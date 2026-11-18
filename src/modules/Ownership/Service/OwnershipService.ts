import { Injectable } from "@nestjs/common";
import { ClaimAttemptDto } from "../Dto/ClaimAttemptDto.js";
import { ClaimResultDto } from "../Dto/ClaimResultDto.js";
import { ClaimResult } from "../Enum/ClaimResult.js";
import { OwnerCodeKind } from "../Enum/OwnerCodeKind.js";
import { OwnerAccessDeniedError } from "../Error/OwnerAccessDeniedError.js";
import { OwnershipConflictError } from "../Error/OwnershipConflictError.js";
import { OwnershipRepository } from "../Repository/OwnershipRepository.js";
import { OwnerCodeService } from "./OwnerCodeService.js";

import type { OperationReentryError } from "../../Core/Operation/Error/OperationReentryError.js";
import type { DatabaseOperationError } from "../../Infrastructure/Database/Error/DatabaseOperationError.js";

@Injectable()
export class OwnershipService {
  private static readonly TRANSFER_LIFETIME_MS = 24 * 60 * 60 * 1000;
  private static readonly BLOCK_DURATION_MS = 15 * 60 * 1000;
  private static readonly MAX_FAILURES = 5;

  constructor(
    private readonly repository: OwnershipRepository,
    private readonly codes: OwnerCodeService,
  ) {}

  /**
   * Returns a new initial code only when no owner exists; ordinary guild operations stay enabled.
   * @throws {Promise<DatabaseOperationError>} Reading or replacing the code failed.
   * @throws {Promise<OperationReentryError>} The database queue was reentered.
   * @throws {Promise<OwnershipConflictError>} Ownership changed concurrently.
   */
  async initialize(): Promise<string | null> {
    const state = await this.repository.readCodeState();

    if (state.ownerId !== null) {
      return null;
    }

    const code = this.codes.create(OwnerCodeKind.Initial, null);

    if (!(await this.repository.replaceCode(state, code.stored))) {
      throw new OwnershipConflictError();
    }

    return code.value;
  }

  /**
   * Authorizes a new command or action once at acceptance, before any guild queue wait.
   * An accepted command may finish after ownership changes, including while queued.
   * Does not cache authorization across operations or processes.
   * @throws {Promise<OwnerAccessDeniedError>} The caller is not the current owner.
   * @throws {Promise<DatabaseOperationError>} Reading the current owner failed.
   * @throws {Promise<OperationReentryError>} The database queue was reentered.
   */
  async assertOwner(userId: string): Promise<void> {
    if ((await this.repository.findOwnerId()) !== userId) {
      throw new OwnerAccessDeniedError();
    }
  }

  /**
   * Replaces the active code while retaining the current owner until a successful claim.
   * @throws {Promise<OwnerAccessDeniedError>} The caller is not the current owner.
   * @throws {Promise<DatabaseOperationError>} Reading or replacing the code failed.
   * @throws {Promise<OperationReentryError>} The database queue was reentered.
   * @throws {Promise<OwnershipConflictError>} Ownership changed concurrently.
   */
  async transfer(userId: string): Promise<string> {
    const state = await this.repository.readCodeState();

    if (state.ownerId !== userId) {
      throw new OwnerAccessDeniedError();
    }

    const code = this.codes.create(
      OwnerCodeKind.Transfer,
      Date.now() + OwnershipService.TRANSFER_LIFETIME_MS,
    );

    if (!(await this.repository.replaceCode(state, code.stored))) {
      throw new OwnershipConflictError();
    }

    return code.value;
  }

  /**
   * Atomically revokes the owner and all older codes; return the new code only after commit.
   * @throws {Promise<DatabaseOperationError>} Recovery failed without partial writes.
   * @throws {Promise<OperationReentryError>} The database queue was reentered.
   * @throws {Promise<OwnershipConflictError>} Ownership changed concurrently.
   */
  async recover(): Promise<string> {
    const state = await this.repository.readCodeState();
    const code = this.codes.create(OwnerCodeKind.Recovery, null);

    if (!(await this.repository.recover(state, code.stored))) {
      throw new OwnershipConflictError();
    }

    return code.value;
  }

  /**
   * Wrong/expired/redeemed/absent codes spend an attempt; blocked callers never check the hash.
   * Technical storage errors and concurrent changes never spend an attempt.
   * @throws {Promise<DatabaseOperationError>} Claim failed without partial writes.
   * @throws {Promise<OperationReentryError>} The database queue was reentered.
   * @throws {Promise<OwnershipConflictError>} State changed or the code expired before commit.
   */
  async claim(userId: string, value: string): Promise<ClaimResultDto> {
    const state = await this.repository.readClaimState(userId);
    const now = Date.now();

    const blockedUntil = state.blockedUntil;

    if (blockedUntil !== null && blockedUntil > now) {
      return new ClaimResultDto(ClaimResult.Blocked, blockedUntil);
    }

    if (
      state.codeHash !== null &&
      !state.isRedeemed &&
      (state.codeExpiresAt === null || state.codeExpiresAt > now) &&
      this.codes.matches(value, state.codeHash)
    ) {
      if (!(await this.repository.claim(userId, state))) {
        throw new OwnershipConflictError();
      }

      return new ClaimResultDto(ClaimResult.Claimed, null);
    }

    const failures = state.blockedUntil !== null ? 1 : (state.failures ?? 0) + 1;

    const nextBlockedUntil =
      failures >= OwnershipService.MAX_FAILURES ? now + OwnershipService.BLOCK_DURATION_MS : null;

    if (
      !(await this.repository.saveAttempt(
        userId,
        state,
        new ClaimAttemptDto(failures, nextBlockedUntil),
      ))
    ) {
      throw new OwnershipConflictError();
    }

    return new ClaimResultDto(
      nextBlockedUntil === null ? ClaimResult.InvalidCode : ClaimResult.Blocked,
      nextBlockedUntil,
    );
  }
}
