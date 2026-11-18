import "reflect-metadata";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { DataSource } from "typeorm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseOptionsFactory } from "../../App/Factory/DatabaseOptionsFactory.js";
import { OwnershipBootstrapObserver } from "../../App/Observer/OwnershipBootstrapObserver.js";
import { DatabaseConfig } from "../../Infrastructure/Database/Config/DatabaseConfig.js";
import { DatabaseOperationError } from "../../Infrastructure/Database/Error/DatabaseOperationError.js";
import { DatabaseOperationExecutor } from "../../Infrastructure/Database/Service/DatabaseOperationExecutor.js";
import { JsonLogger } from "../../Logging/Service/JsonLogger.js";
import { ClaimAttemptDto } from "../Dto/ClaimAttemptDto.js";
import { ClaimResultDto } from "../Dto/ClaimResultDto.js";
import { ClaimStateDto } from "../Dto/ClaimStateDto.js";
import { GeneratedOwnerCodeDto } from "../Dto/GeneratedOwnerCodeDto.js";
import { OwnerCodeDto } from "../Dto/OwnerCodeDto.js";
import { OwnershipCodeStateDto } from "../Dto/OwnershipCodeStateDto.js";
import { BotOwner } from "../Entity/BotOwner.js";
import { ClaimAttempt } from "../Entity/ClaimAttempt.js";
import { OwnerCode } from "../Entity/OwnerCode.js";
import { ClaimResult } from "../Enum/ClaimResult.js";
import { OwnerCodeKind } from "../Enum/OwnerCodeKind.js";
import { OwnerAccessDeniedError } from "../Error/OwnerAccessDeniedError.js";
import { OwnershipConflictError } from "../Error/OwnershipConflictError.js";
import { OwnershipRepository } from "../Repository/OwnershipRepository.js";
import { OwnerCodeService } from "./OwnerCodeService.js";
import { OwnershipService } from "./OwnershipService.js";

describe("ownership rules on real SQLite", () => {
  const TRANSFER_LIFETIME_MS = 24 * 60 * 60 * 1000;
  const BLOCK_DURATION_MS = 15 * 60 * 1000;
  let directory: string;
  let dataSource: DataSource;
  let repository: OwnershipRepository;
  let codes: OwnerCodeService;
  let service: OwnershipService;
  let now: number;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "temp-voice-ownership-"));

    dataSource = new DataSource(
      new DatabaseOptionsFactory(
        new DatabaseConfig(join(directory, "test.sqlite")),
      ).createTypeOrmOptions(),
    );

    await dataSource.initialize();
    await dataSource.runMigrations();
    repository = new OwnershipRepository(dataSource, new DatabaseOperationExecutor());
    codes = new OwnerCodeService();
    service = new OwnershipService(repository, codes);
    now = Date.now();
    vi.spyOn(Date, "now").mockImplementation(() => now);
  });

  afterEach(async () => {
    vi.restoreAllMocks();

    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }

    if (directory) {
      expect(dirname(resolve(directory))).toBe(resolve(tmpdir()));
      await rm(directory, { recursive: true, force: true });
    }
  });

  const storedState = async (userId: string | null = null) => ({
    ownerId:
      (await dataSource.manager.findOneBy(BotOwner, { id: BotOwner.SINGLETON_ID }))?.userId ?? null,
    code: await dataSource.manager.findOneBy(OwnerCode, { id: OwnerCode.SINGLETON_ID }),
    attempt: userId === null ? null : await dataSource.manager.findOneBy(ClaimAttempt, { userId }),
  });

  const assignOwner = async () => {
    const code = (await service.initialize())!;
    expect((await service.claim("owner", code)).result).toBe(ClaimResult.Claimed);
  };

  it.each([
    { name: "neither owner nor code", ownerId: null, hasCode: false, isRedeemed: false },
    { name: "initial code", ownerId: null, hasCode: true, isRedeemed: false },
    { name: "owner and transfer code", ownerId: "owner", hasCode: true, isRedeemed: false },
    { name: "owner and redeemed code", ownerId: "owner", hasCode: true, isRedeemed: true },
  ])("reads $name in one database query", async ({ ownerId, hasCode, isRedeemed }) => {
    const code = codes.create(OwnerCodeKind.Initial, null);
    expect(code).toBeInstanceOf(GeneratedOwnerCodeDto);
    expect(code.stored).toBeInstanceOf(OwnerCodeDto);

    if (ownerId !== null) {
      await dataSource.manager.insert(BotOwner, { id: BotOwner.SINGLETON_ID, userId: ownerId });
    }

    if (hasCode) {
      await dataSource.manager.insert(OwnerCode, {
        id: OwnerCode.SINGLETON_ID,
        ...code.stored,
        isRedeemed,
      });
    }

    const queries = vi.spyOn(dataSource.logger, "logQuery");
    const state = await repository.readCodeState();

    expect(state).toBeInstanceOf(OwnershipCodeStateDto);

    expect(state).toEqual({
      ownerId,
      codeHash: hasCode ? code.stored.hash : null,
      isRedeemed,
    });

    expect(queries).toHaveBeenCalledOnce();
  });

  it("rotates initial codes at startup, stores only their hash and consumes a code once", async () => {
    const saveAttempt = vi.spyOn(repository, "saveAttempt");
    const oldCode = (await service.initialize())!;
    const code = (await service.initialize())!;
    expect(code).toMatch(/^[A-Za-z0-9]{32}$/);
    expect(code).not.toBe(oldCode);
    const state = await storedState();

    expect(state).toMatchObject({
      ownerId: null,
      code: { kind: OwnerCodeKind.Initial, expiresAt: null, isRedeemed: false },
    });

    expect(JSON.stringify(state)).not.toContain(code);
    expect(codes.matches(code, state.code!.hash)).toBe(true);
    const invalid = await service.claim("other", oldCode);
    expect(invalid).toBeInstanceOf(ClaimResultDto);
    expect(invalid.result).toBe(ClaimResult.InvalidCode);

    expect(saveAttempt).toHaveBeenCalledWith(
      "other",
      expect.any(ClaimStateDto),
      expect.any(ClaimAttemptDto),
    );

    now += TRANSFER_LIFETIME_MS * 2;
    const claimed = await service.claim("owner", code);
    expect(claimed).toBeInstanceOf(ClaimResultDto);
    expect(claimed.result).toBe(ClaimResult.Claimed);
    expect((await storedState()).code).toEqual({ ...state.code, isRedeemed: true });
    await dataSource.destroy();
    await dataSource.initialize();
    expect((await service.claim("other", code)).result).toBe(ClaimResult.InvalidCode);
    expect((await service.claim("owner", code)).result).toBe(ClaimResult.InvalidCode);
    await expect(service.initialize()).resolves.toBeNull();
    await expect(service.assertOwner("owner")).resolves.toBeUndefined();
    await expect(service.assertOwner("other")).rejects.toBeInstanceOf(OwnerAccessDeniedError);
  });

  it("retains the owner during transfer and invalidates each older transfer code", async () => {
    await assignOwner();
    await expect(service.transfer("outsider")).rejects.toBeInstanceOf(OwnerAccessDeniedError);
    const oldCode = await service.transfer("owner");
    const code = await service.transfer("owner");

    expect((await storedState()).code).toMatchObject({
      kind: OwnerCodeKind.Transfer,
      expiresAt: now + TRANSFER_LIFETIME_MS,
      isRedeemed: false,
    });

    await service.assertOwner("owner");
    expect((await service.claim("next", oldCode)).result).toBe(ClaimResult.InvalidCode);
    expect((await service.claim("next", code)).result).toBe(ClaimResult.Claimed);
    await expect(service.assertOwner("owner")).rejects.toBeInstanceOf(OwnerAccessDeniedError);
    await service.assertOwner("next");
    expect((await storedState("next")).attempt).toBeNull();
    expect((await storedState()).code?.isRedeemed).toBe(true);
  });

  it("rejects transfer codes at the exact 24-hour boundary", async () => {
    await assignOwner();
    const code = await service.transfer("owner");
    now += TRANSFER_LIFETIME_MS;
    expect((await service.claim("next", code)).result).toBe(ClaimResult.InvalidCode);
    await service.assertOwner("owner");
    expect((await storedState("next")).attempt?.failures).toBe(1);
  });

  it("never consumes a code that expires while awaiting persistence", async () => {
    await assignOwner();
    const code = await service.transfer("owner");
    const claim = repository.claim.bind(repository);

    vi.spyOn(repository, "claim").mockImplementationOnce(async (userId, state) => {
      now += TRANSFER_LIFETIME_MS;

      return claim(userId, state);
    });

    await expect(service.claim("next", code)).rejects.toBeInstanceOf(OwnershipConflictError);
    expect(await storedState("next")).toMatchObject({ ownerId: "owner", attempt: null });
  });

  it("persists the fifth-error block across restart and does not hash codes during the block", async () => {
    const code = (await service.initialize())!;

    for (let index = 0; index < 4; index++) {
      expect((await service.claim("user", "wrong")).result).toBe(ClaimResult.InvalidCode);
    }

    const blocked = await service.claim("user", "wrong");
    expect(blocked).toBeInstanceOf(ClaimResultDto);

    expect(blocked).toEqual({
      result: ClaimResult.Blocked,
      blockedUntil: now + BLOCK_DURATION_MS,
    });

    await dataSource.destroy();
    await dataSource.initialize();
    const matches = vi.spyOn(codes, "matches");
    expect((await service.claim("user", code)).result).toBe(ClaimResult.Blocked);
    expect(matches).not.toHaveBeenCalled();
    expect((await storedState("user")).attempt?.failures).toBe(5);
    expect((await service.claim("other", "wrong")).result).toBe(ClaimResult.InvalidCode);
  });

  it("grants five new attempts after a block and resets only the successful claimant", async () => {
    const code = (await service.initialize())!;

    for (let index = 0; index < 5; index++) {
      await service.claim("user", "wrong");
    }

    now += BLOCK_DURATION_MS;

    for (let index = 0; index < 4; index++) {
      expect((await service.claim("user", "wrong")).result).toBe(ClaimResult.InvalidCode);
    }

    expect((await storedState("user")).attempt?.failures).toBe(4);
    expect((await service.claim("user", "wrong")).result).toBe(ClaimResult.Blocked);
    now += BLOCK_DURATION_MS;
    await service.claim("other", "wrong");
    expect((await service.claim("user", code)).result).toBe(ClaimResult.Claimed);
    expect((await storedState("user")).attempt).toBeNull();
    expect((await storedState("other")).attempt?.failures).toBe(1);
  });

  it("recovery immediately revokes the owner and replaces every earlier code", async () => {
    await assignOwner();
    const transfer = await service.transfer("owner");
    const oldRecovery = await service.recover();
    const recovery = await service.recover();
    await expect(service.assertOwner("owner")).rejects.toBeInstanceOf(OwnerAccessDeniedError);

    expect((await storedState()).code).toMatchObject({
      kind: OwnerCodeKind.Recovery,
      expiresAt: null,
      isRedeemed: false,
    });

    expect((await service.claim("next", transfer)).result).toBe(ClaimResult.InvalidCode);
    expect((await service.claim("next", oldRecovery)).result).toBe(ClaimResult.InvalidCode);
    now += TRANSFER_LIFETIME_MS * 2;
    expect((await service.claim("next", recovery)).result).toBe(ClaimResult.Claimed);
    await service.recover();
    expect((await storedState()).code?.isRedeemed).toBe(false);
  });

  it("rejects stale claim facts without changing ownership or attempts", async () => {
    const initial = (await service.initialize())!;
    const stale = await repository.readClaimState("user");
    expect(stale).toBeInstanceOf(ClaimStateDto);
    const recovery = await service.recover();
    expect(await repository.claim("user", stale)).toBe(false);

    expect(await repository.saveAttempt("user", stale, new ClaimAttemptDto(1, null))).toBe(false);

    expect(await storedState("user")).toMatchObject({ ownerId: null, attempt: null });
    expect((await service.claim("user", recovery)).result).toBe(ClaimResult.Claimed);
    expect((await service.claim("other", initial)).result).toBe(ClaimResult.InvalidCode);
  });

  it("reports a service-level conflict without spending an invalid attempt", async () => {
    const code = (await service.initialize())!;
    const claim = repository.claim.bind(repository);

    vi.spyOn(repository, "claim").mockImplementationOnce(async (userId, state) => {
      await service.recover();

      return claim(userId, state);
    });

    await expect(service.claim("user", code)).rejects.toBeInstanceOf(OwnershipConflictError);
    expect(await storedState("user")).toMatchObject({ ownerId: null, attempt: null });
  });

  it("preserves a code inserted after the initial read found no code", async () => {
    const stale = await repository.readCodeState();
    const recovery = await service.recover();
    const initial = codes.create(OwnerCodeKind.Initial, null);
    expect(await repository.replaceCode(stale, initial.stored)).toBe(false);
    const state = await storedState();
    expect(state.ownerId).toBeNull();
    expect(codes.matches(recovery, state.code!.hash)).toBe(true);
  });

  it("rejects stale writes when the same code has been redeemed since reading", async () => {
    const initial = (await service.initialize())!;
    const stale = await repository.readCodeState();
    const staleClaim = await repository.readClaimState("other");
    await service.claim("next", initial);
    const newTransfer = codes.create(OwnerCodeKind.Transfer, now + TRANSFER_LIFETIME_MS);
    expect(await repository.replaceCode(stale, newTransfer.stored)).toBe(false);

    expect(await repository.saveAttempt("other", staleClaim, new ClaimAttemptDto(1, null))).toBe(
      false,
    );

    expect(await storedState("other")).toMatchObject({
      ownerId: "next",
      code: { hash: stale.codeHash, isRedeemed: true },
      attempt: null,
    });
  });

  it("does not count database busy as an incorrect code", async () => {
    await service.initialize();
    const lockHolder = new DataSource({ ...dataSource.options, migrationsRun: false });
    await lockHolder.initialize();

    try {
      await lockHolder.query("BEGIN IMMEDIATE");

      try {
        await expect(service.claim("user", "wrong")).rejects.toMatchObject({
          name: "DatabaseOperationError",
          isBusy: true,
        });
      } finally {
        await lockHolder.query("ROLLBACK");
      }

      expect((await storedState("user")).attempt).toBeNull();
    } finally {
      await lockHolder.destroy();
    }
  });

  it("rolls back code consumption and owner assignment when attempt reset fails", async () => {
    await assignOwner();
    const code = await service.transfer("owner");
    await service.claim("next", "wrong");
    const before = await storedState("next");

    await dataSource.query(
      "CREATE TRIGGER reject_attempt_reset BEFORE DELETE ON claim_attempts BEGIN SELECT RAISE(ABORT, 'injected failure'); END",
    );

    await expect(service.claim("next", code)).rejects.toBeInstanceOf(DatabaseOperationError);
    expect(await storedState("next")).toEqual(before);
  });

  it("rolls back the new recovery code when owner revocation fails", async () => {
    await assignOwner();
    await service.transfer("owner");
    const before = await storedState();

    await dataSource.query(
      "CREATE TRIGGER reject_recovery BEFORE DELETE ON bot_owner BEGIN SELECT RAISE(ABORT, 'injected failure'); END",
    );

    await expect(service.recover()).rejects.toBeInstanceOf(DatabaseOperationError);
    expect(await storedState()).toEqual(before);
  });

  it("uses targeted ORM reads instead of repeatedly loading full ownership state", async () => {
    await assignOwner();
    const queries = vi.spyOn(dataSource.logger, "logQuery");
    const selects = () => queries.mock.calls.filter(([sql]) => /^\s*SELECT\b/i.test(sql));

    await service.assertOwner("owner");
    expect(selects()).toHaveLength(1);
    expect(selects()[0][0]).not.toContain("owner_codes");
    queries.mockClear();
    await service.transfer("owner");
    expect(selects()).toHaveLength(1);
    queries.mockClear();
    const transfer = await service.transfer("owner");
    expect(selects()).toHaveLength(1);
    queries.mockClear();
    expect((await service.claim("next", transfer)).result).toBe(ClaimResult.Claimed);
    expect(selects()).toHaveLength(2);
    queries.mockClear();
    await service.recover();
    expect(selects()).toHaveLength(1);
    queries.mockClear();
    expect((await service.claim("wrong-user", "wrong")).result).toBe(ClaimResult.InvalidCode);
    expect(selects()).toHaveLength(2);
  });

  it("does not overwrite a concurrent invalid attempt for the same user", async () => {
    await service.initialize();
    const stale = await repository.readClaimState("user");
    await service.claim("user", "wrong");

    expect(await repository.saveAttempt("user", stale, new ClaimAttemptDto(1, null))).toBe(false);

    expect((await storedState("user")).attempt?.failures).toBe(1);
    expect(await repository.claim("user", stale)).toBe(false);
  });

  it.each(["recovery", "claim"] as const)(
    "continues startup and preserves a concurrent %s",
    async (operation) => {
      const initial = (await service.initialize())!;
      const logger = new JsonLogger();
      vi.spyOn(logger, "log").mockImplementation(() => {});
      vi.spyOn(logger, "warn").mockImplementation(() => {});
      let recovery: string | undefined;
      const replaceCode = repository.replaceCode.bind(repository);

      vi.spyOn(repository, "replaceCode").mockImplementationOnce(async (expected, code) => {
        if (operation === "recovery") {
          recovery = await service.recover();
        } else {
          await service.claim("concurrent-owner", initial);
        }

        return replaceCode(expected, code);
      });

      const observer = new OwnershipBootstrapObserver(service, logger);
      await expect(observer.onModuleInit()).resolves.toBeUndefined();
      expect(logger.log).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledOnce();
      const state = await storedState();

      if (operation === "recovery") {
        expect(state.ownerId).toBeNull();
        expect(codes.matches(recovery!, state.code!.hash)).toBe(true);
      } else {
        expect(state.ownerId).toBe("concurrent-owner");
        expect(state.code?.isRedeemed).toBe(true);
      }
    },
  );

  it("does not hide a database failure during initial ownership setup", async () => {
    const failure = new DatabaseOperationError(false);
    vi.spyOn(repository, "readCodeState").mockRejectedValueOnce(failure);
    const logger = new JsonLogger();
    vi.spyOn(logger, "warn").mockImplementation(() => {});

    await expect(new OwnershipBootstrapObserver(service, logger).onModuleInit()).rejects.toBe(
      failure,
    );

    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("allows only one successful concurrent claim across independent SQLite connections", async () => {
    const code = (await service.initialize())!;
    const otherDataSource = new DataSource({ ...dataSource.options, migrationsRun: false });
    await otherDataSource.initialize();

    try {
      const other = new OwnershipService(
        new OwnershipRepository(otherDataSource, new DatabaseOperationExecutor()),
        new OwnerCodeService(),
      );

      const outcomes = await Promise.allSettled([
        service.claim("first", code),
        other.claim("second", code),
      ]);

      expect(
        outcomes.filter(
          (outcome) =>
            outcome.status === "fulfilled" && outcome.value.result === ClaimResult.Claimed,
        ),
      ).toHaveLength(1);

      const ownerId = (await storedState()).ownerId;
      expect(["first", "second"]).toContain(ownerId);
      expect((await storedState()).code?.isRedeemed).toBe(true);

      for (const outcome of outcomes) {
        if (outcome.status === "rejected") {
          expect(
            outcome.reason instanceof DatabaseOperationError ||
              outcome.reason instanceof OwnershipConflictError,
          ).toBe(true);
        }
      }
    } finally {
      await otherDataSource.destroy();
    }
  });
});
