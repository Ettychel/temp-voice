import "reflect-metadata";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { DataSource } from "typeorm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DatabaseOptionsFactory } from "../../App/Factory/DatabaseOptionsFactory.js";
import { DatabaseConfig } from "../../Infrastructure/Database/Config/DatabaseConfig.js";
import { DatabaseOperationError } from "../../Infrastructure/Database/Error/DatabaseOperationError.js";
import { DatabaseOperationExecutor } from "../../Infrastructure/Database/Service/DatabaseOperationExecutor.js";
import { VoiceTrigger } from "../../Triggers/Entity/VoiceTrigger.js";
import { TemporaryChannelRepository } from "./TemporaryChannelRepository.js";

describe("temporary channel deletion budget", () => {
  let directory: string;
  let dataSource: DataSource;
  let repository: TemporaryChannelRepository;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), "temp-voice-test-"));

    dataSource = new DataSource(
      new DatabaseOptionsFactory(
        new DatabaseConfig(join(directory, "test.sqlite")),
      ).createTypeOrmOptions(),
    );

    await dataSource.initialize();
    repository = new TemporaryChannelRepository(dataSource, new DatabaseOperationExecutor());

    await repository.add({
      channelId: "channel",
      guildId: "guild",
      triggerChannelId: "trigger",
      ownerId: "user",
      deleteAttempts: 0,
      createdAt: Date.now(),
    });
  });

  afterEach(async () => {
    if (dataSource?.isInitialized) {
      await dataSource.destroy();
    }

    if (directory) {
      expect(dirname(resolve(directory))).toBe(resolve(tmpdir()));
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("allows only three concurrent reservations and keeps the channel in limits", async () => {
    const outcomes = await Promise.all(
      Array.from({ length: 8 }, () => repository.reserveDeleteAttempt("channel")),
    );

    expect(outcomes.filter(Boolean)).toHaveLength(3);
    expect(await repository.find("channel")).toMatchObject({ deleteAttempts: 3 });
    expect(await repository.count("guild")).toBe(1);
    expect(await repository.count("guild", "trigger")).toBe(1);
  });

  it("does not reset attempts after restart or require a surviving trigger", async () => {
    await dataSource.getRepository(VoiceTrigger).insert({
      guildId: "guild",
      channelId: "trigger",
      isActive: true,
      channelLimit: 2,
      createdAt: Date.now(),
    });

    await repository.reserveDeleteAttempt("channel");
    await repository.reserveDeleteAttempt("channel");
    await dataSource.getRepository(VoiceTrigger).delete({ guildId: "guild", channelId: "trigger" });
    await dataSource.destroy();
    await dataSource.initialize();
    expect(await repository.count("guild", "trigger")).toBe(1);
    expect(await repository.reserveDeleteAttempt("channel")).toBe(true);
    expect(await repository.reserveDeleteAttempt("channel")).toBe(false);
    await repository.remove("channel");
    await repository.remove("channel");
    expect(await repository.count("guild")).toBe(0);
  });

  it("honors the budget across independent SQLite connections", async () => {
    const otherDataSource = new DataSource({ ...dataSource.options, migrationsRun: false });
    await otherDataSource.initialize();

    try {
      const other = new TemporaryChannelRepository(
        otherDataSource,
        new DatabaseOperationExecutor(),
      );

      const outcomes = await Promise.all(
        [repository, other, repository, other, repository, other].map((candidate) =>
          candidate.reserveDeleteAttempt("channel"),
        ),
      );

      expect(outcomes.filter(Boolean)).toHaveLength(3);
      expect(await repository.find("channel")).toMatchObject({ deleteAttempts: 3 });
    } finally {
      await otherDataSource.destroy();
    }
  });

  it("does not spend the deletion budget when another connection holds a write lock", async () => {
    const lockHolder = new DataSource({ ...dataSource.options, migrationsRun: false });
    await lockHolder.initialize();

    try {
      await lockHolder.query("BEGIN IMMEDIATE");

      try {
        await expect(repository.reserveDeleteAttempt("channel")).rejects.toMatchObject({
          name: "DatabaseOperationError",
          isBusy: true,
        });
      } finally {
        await lockHolder.query("ROLLBACK");
      }

      expect(await repository.find("channel")).toMatchObject({ deleteAttempts: 0 });
    } finally {
      await lockHolder.destroy();
    }
  });

  it("treats a failed write as a technical error without spending an attempt", async () => {
    const readonlyDataSource = new DataSource({
      ...new DatabaseOptionsFactory(
        new DatabaseConfig(join(directory, "test.sqlite")),
      ).createTypeOrmOptions(),
      readonly: true,
      migrationsRun: false,
      enableWAL: false,
    });

    await readonlyDataSource.initialize();

    try {
      const readonlyRepository = new TemporaryChannelRepository(
        readonlyDataSource,
        new DatabaseOperationExecutor(),
      );

      await expect(readonlyRepository.reserveDeleteAttempt("channel")).rejects.toBeInstanceOf(
        DatabaseOperationError,
      );

      expect(await repository.find("channel")).toMatchObject({ deleteAttempts: 0 });
    } finally {
      await readonlyDataSource.destroy();
    }
  });
});
