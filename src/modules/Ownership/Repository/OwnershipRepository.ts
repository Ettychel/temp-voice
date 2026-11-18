import { Injectable } from "@nestjs/common";
import { DataSource, IsNull, MoreThan, Or, QueryFailedError } from "typeorm";
import { DatabaseOperationExecutor } from "../../Infrastructure/Database/Service/DatabaseOperationExecutor.js";
import { ClaimStateDto } from "../Dto/ClaimStateDto.js";
import { OwnershipCodeStateDto } from "../Dto/OwnershipCodeStateDto.js";
import { BotOwner } from "../Entity/BotOwner.js";
import { ClaimAttempt } from "../Entity/ClaimAttempt.js";
import { OwnerCode } from "../Entity/OwnerCode.js";

import type { EntityManager, InsertResult } from "typeorm";
import type { OperationReentryError } from "../../Core/Operation/Error/OperationReentryError.js";
import type { DatabaseOperationError } from "../../Infrastructure/Database/Error/DatabaseOperationError.js";
import type { ClaimAttemptDto } from "../Dto/ClaimAttemptDto.js";
import type { OwnerCodeDto } from "../Dto/OwnerCodeDto.js";
import type { ClaimStateRowType } from "../Type/ClaimStateRowType.js";
import type { OwnershipCodeStateRowType } from "../Type/OwnershipCodeStateRowType.js";

@Injectable()
export class OwnershipRepository {
  private static readonly DUPLICATE_PRIMARY_KEY = "SQLITE_CONSTRAINT_PRIMARYKEY";
  private static readonly DUPLICATE_UNIQUE_KEY = "SQLITE_CONSTRAINT_UNIQUE";

  constructor(
    private readonly dataSource: DataSource,
    private readonly executor: DatabaseOperationExecutor,
  ) {}

  /**
   * Reads only the current owner's ID for authorization.
   * @throws {Promise<DatabaseOperationError>} Reading ownership failed.
   * @throws {Promise<OperationReentryError>} The database queue was reentered.
   */
  findOwnerId(): Promise<string | null> {
    return this.executor.run(() => this.readOwnerId(this.dataSource.manager));
  }

  /**
   * Reads code state and its optional owner in one statement; codes remain after redemption.
   * @throws {Promise<DatabaseOperationError>} Reading ownership failed.
   * @throws {Promise<OperationReentryError>} The database queue was reentered.
   */
  readCodeState(): Promise<OwnershipCodeStateDto> {
    return this.executor.run(async () => {
      const state = await this.dataSource.manager
        .createQueryBuilder(OwnerCode, "code")
        .leftJoin(BotOwner, "owner", "owner.id = code.id")
        .select("owner.userId", "ownerId")
        .addSelect("code.hash", "codeHash")
        .addSelect("code.isRedeemed", "isRedeemed")
        .where({ id: OwnerCode.SINGLETON_ID })
        .getRawOne<OwnershipCodeStateRowType>();

      return OwnershipCodeStateDto.fromRaw(state);
    });
  }

  /**
   * Reads the active code and this user's attempts together; absent codes need only attempts.
   * @throws {Promise<DatabaseOperationError>} Reading claim facts failed.
   * @throws {Promise<OperationReentryError>} The database queue was reentered.
   */
  readClaimState(userId: string): Promise<ClaimStateDto> {
    return this.executor.run(async () => {
      const state = await this.dataSource.manager
        .createQueryBuilder(OwnerCode, "code")
        .leftJoin(ClaimAttempt, "attempt", "attempt.userId = :userId", { userId })
        .select("code.hash", "codeHash")
        .addSelect("code.expiresAt", "codeExpiresAt")
        .addSelect("code.isRedeemed", "isRedeemed")
        .addSelect("attempt.failures", "failures")
        .addSelect("attempt.blockedUntil", "blockedUntil")
        .where({ id: OwnerCode.SINGLETON_ID })
        .getRawOne<ClaimStateRowType>();

      if (state !== undefined) {
        return ClaimStateDto.fromRaw(state);
      }

      const attempt = await this.dataSource.manager.findOneBy(ClaimAttempt, { userId });

      return ClaimStateDto.fromRaw(state, attempt);
    });
  }

  /**
   * Returns false when another operation replaced/consumed the code or changed its owner.
   * @throws {Promise<DatabaseOperationError>} Replacing the code failed.
   * @throws {Promise<OperationReentryError>} The database queue was reentered.
   */
  replaceCode(expected: OwnershipCodeStateDto, code: OwnerCodeDto): Promise<boolean> {
    return this.executor.run(() =>
      this.dataSource.transaction((manager) => this.writeCode(manager, expected, code)),
    );
  }

  /**
   * Replaces the current code and removes the owner atomically; false means stale identity.
   * @throws {Promise<DatabaseOperationError>} Recovery failed without partial writes.
   * @throws {Promise<OperationReentryError>} The database queue was reentered.
   */
  recover(expected: OwnershipCodeStateDto, code: OwnerCodeDto): Promise<boolean> {
    return this.executor.run(() =>
      this.dataSource.transaction(async (manager) => {
        if (!(await this.writeCode(manager, expected, code))) {
          return false;
        }

        await manager.delete(BotOwner, { id: BotOwner.SINGLETON_ID });

        return true;
      }),
    );
  }

  /**
   * Checks current attempts, then marks the code redeemed and assigns the owner atomically.
   * The attempt check and all writes share one transaction; expiry is checked at consumption.
   * @throws {Promise<DatabaseOperationError>} Claim failed without partial writes.
   * @throws {Promise<OperationReentryError>} The database queue was reentered.
   */
  claim(userId: string, expected: ClaimStateDto): Promise<boolean> {
    return this.executor.run(() =>
      this.dataSource.transaction(async (manager) => {
        const attempt = await manager.findOneBy(ClaimAttempt, { userId });

        if (
          (attempt?.failures ?? null) !== expected.failures ||
          (attempt?.blockedUntil ?? null) !== expected.blockedUntil
        ) {
          return false;
        }

        const consumed = await manager.update(
          OwnerCode,
          {
            id: OwnerCode.SINGLETON_ID,
            hash: expected.codeHash ?? IsNull(),
            expiresAt: Or(IsNull(), MoreThan(Date.now())),
            isRedeemed: false,
          },
          { isRedeemed: true },
        );

        if (consumed.affected !== 1) {
          return false;
        }

        await manager
          .createQueryBuilder()
          .insert()
          .into(BotOwner)
          .values({ id: BotOwner.SINGLETON_ID, userId })
          .orUpdate(["user_id"], ["id"])
          .updateEntity(false)
          .execute();

        await manager.delete(ClaimAttempt, { userId });

        return true;
      }),
    );
  }

  /**
   * Checks only active code identity, then conditionally inserts/updates the user's attempts.
   * @throws {Promise<DatabaseOperationError>} Recording an invalid attempt failed.
   * @throws {Promise<OperationReentryError>} The database queue was reentered.
   */
  saveAttempt(userId: string, expected: ClaimStateDto, attempt: ClaimAttemptDto): Promise<boolean> {
    return this.executor.run(() =>
      this.dataSource.transaction(async (manager) => {
        const code = await manager.findOne(OwnerCode, {
          select: { hash: true, isRedeemed: true },
          where: { id: OwnerCode.SINGLETON_ID },
        });

        if (
          (code?.hash ?? null) !== expected.codeHash ||
          (code?.isRedeemed ?? false) !== expected.isRedeemed
        ) {
          return false;
        }

        if (expected.failures === null) {
          return this.insertIfMissing(() =>
            manager
              .createQueryBuilder()
              .insert()
              .into(ClaimAttempt)
              .values({ userId, ...attempt })
              .updateEntity(false)
              .execute(),
          );
        }

        const changed = await manager.update(
          ClaimAttempt,
          {
            userId,
            failures: expected.failures,
            blockedUntil: expected.blockedUntil ?? IsNull(),
          },
          attempt,
        );

        return changed.affected === 1;
      }),
    );
  }

  /** @throws {Promise<Error>} Reading the owner failed. */
  private async readOwnerId(manager: EntityManager): Promise<string | null> {
    const owner = await manager.findOne(BotOwner, {
      select: { userId: true },
      where: { id: BotOwner.SINGLETON_ID },
    });

    return owner?.userId ?? null;
  }

  /**
   * Hash changes identify replacements; the redemption flag identifies owner assignment.
   * @throws {Promise<Error>} Conditional persistence failed.
   * @throws {Promise<unknown>} Inserting a code failed for a reason other than a duplicate key.
   */
  private async writeCode(
    manager: EntityManager,
    expected: OwnershipCodeStateDto,
    code: OwnerCodeDto,
  ): Promise<boolean> {
    if (expected.codeHash !== null) {
      const changed = await manager.update(
        OwnerCode,
        {
          id: OwnerCode.SINGLETON_ID,
          hash: expected.codeHash,
          isRedeemed: expected.isRedeemed,
        },
        code,
      );

      return changed.affected === 1;
    }

    return this.insertIfMissing(() =>
      manager
        .createQueryBuilder()
        .insert()
        .into(OwnerCode)
        .values({ id: OwnerCode.SINGLETON_ID, ...code })
        .updateEntity(false)
        .execute(),
    );
  }

  /** @throws {Promise<unknown>} Propagates failures other than an expected concurrent insert. */
  private async insertIfMissing(insert: () => Promise<InsertResult>): Promise<boolean> {
    try {
      await insert();

      return true;
    } catch (error) {
      const driverError: unknown = error instanceof QueryFailedError ? error.driverError : null;

      if (
        typeof driverError === "object" &&
        driverError !== null &&
        "code" in driverError &&
        (driverError.code === OwnershipRepository.DUPLICATE_PRIMARY_KEY ||
          driverError.code === OwnershipRepository.DUPLICATE_UNIQUE_KEY)
      ) {
        return false;
      }

      throw error;
    }
  }
}
