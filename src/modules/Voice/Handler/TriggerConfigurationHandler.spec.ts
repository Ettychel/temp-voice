import "reflect-metadata";
import { ChannelType, Locale } from "discord.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { DataSource } from "typeorm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseOptionsFactory } from "../../App/Factory/DatabaseOptionsFactory.js";
import { KeyedOperationCoordinator } from "../../Core/Operation/Service/KeyedOperationCoordinator.js";
import { OwnerCommandController } from "../../Discord/Controller/OwnerCommandController.js";
import { CommandListService } from "../../Discord/Service/CommandListService.js";
import { CommandReplyService } from "../../Discord/Service/CommandReplyService.js";
import { DatabaseConfig } from "../../Infrastructure/Database/Config/DatabaseConfig.js";
import { DatabaseOperationExecutor } from "../../Infrastructure/Database/Service/DatabaseOperationExecutor.js";
import { CreationBlockReason } from "../../Limits/Enum/CreationBlockReason.js";
import { InvalidChannelLimitError } from "../../Limits/Error/InvalidChannelLimitError.js";
import { GuildLimitRepository } from "../../Limits/Repository/GuildLimitRepository.js";
import { LimitsService } from "../../Limits/Service/LimitsService.js";
import { OwnerAccessDeniedError } from "../../Ownership/Error/OwnerAccessDeniedError.js";
import { OwnershipRepository } from "../../Ownership/Repository/OwnershipRepository.js";
import { OwnerCodeService } from "../../Ownership/Service/OwnerCodeService.js";
import { OwnershipService } from "../../Ownership/Service/OwnershipService.js";
import { WatchTriggerResult } from "../../Triggers/Enum/WatchTriggerResult.js";
import { InvalidTriggerChannelError } from "../../Triggers/Error/InvalidTriggerChannelError.js";
import { TriggerPermissionsError } from "../../Triggers/Error/TriggerPermissionsError.js";
import { TriggerRepository } from "../../Triggers/Repository/TriggerRepository.js";
import { TriggerService } from "../../Triggers/Service/TriggerService.js";
import { VoiceChannelState } from "../Enum/VoiceChannelState.js";
import { TemporaryChannelRepository } from "../Repository/TemporaryChannelRepository.js";
import { TemporaryChannelService } from "../Service/TemporaryChannelService.js";
import { VoiceEntryService } from "../Service/VoiceEntryService.js";
import { GetVoiceListHandler } from "./GetVoiceListHandler.js";
import { SetChannelLimitHandler } from "./SetChannelLimitHandler.js";
import { SynchronizeTriggerHandler } from "./SynchronizeTriggerHandler.js";
import { UnwatchTriggerHandler } from "./UnwatchTriggerHandler.js";
import { WatchTriggerHandler } from "./WatchTriggerHandler.js";

import type { SlashCommandContext } from "necord";
import type { CommandTargetService } from "../../Discord/Service/CommandTargetService.js";
import type { TriggerChannelDto } from "../../Triggers/Dto/TriggerChannelDto.js";

describe("trigger configuration scenarios on SQLite", () => {
  let directory: string;
  let dataSource: DataSource;
  let coordinator: KeyedOperationCoordinator;
  let executor: DatabaseOperationExecutor;
  let triggers: TriggerService;
  let limits: LimitsService;
  let temporary: TemporaryChannelRepository;
  let channels: TemporaryChannelService;
  let entries: VoiceEntryService;
  let getList: GetVoiceListHandler;

  const facts = (guildId = "guild", channelId = "trigger"): TriggerChannelDto => ({
    guildId,
    channelId,
    type: ChannelType.GuildVoice,
    isAfk: false,
    canManage: true,
  });

  const gateway = {
    assertGuildAvailable: vi.fn(() => {}),
    getTriggerChannel: vi.fn(async (guildId: string, channelId: string) =>
      facts(guildId, channelId),
    ),
    isMemberInChannel: vi.fn(async () => true),
    createChannel: vi.fn(async () => "temporary"),
    moveMember: vi.fn(async () => {}),
    getChannelState: vi.fn(async () => VoiceChannelState.Empty),
    deleteChannel: vi.fn(async () => {}),
  };

  let watch: WatchTriggerHandler;
  let unwatch: UnwatchTriggerHandler;
  let setLimit: SetChannelLimitHandler;
  let synchronize: SynchronizeTriggerHandler;

  beforeEach(async () => {
    gateway.getTriggerChannel.mockReset();

    gateway.getTriggerChannel.mockImplementation(async (guildId, channelId) =>
      facts(guildId, channelId),
    );

    directory = await mkdtemp(join(tmpdir(), "temp-voice-rules-"));

    dataSource = new DataSource(
      new DatabaseOptionsFactory(
        new DatabaseConfig(join(directory, "rules.sqlite")),
      ).createTypeOrmOptions(),
    );

    await dataSource.initialize();
    await dataSource.runMigrations();
    executor = new DatabaseOperationExecutor();
    coordinator = new KeyedOperationCoordinator();
    triggers = new TriggerService(new TriggerRepository(dataSource, executor));
    limits = new LimitsService(new GuildLimitRepository(dataSource, executor));
    temporary = new TemporaryChannelRepository(dataSource, executor);
    channels = new TemporaryChannelService(temporary);
    entries = new VoiceEntryService();

    watch = new WatchTriggerHandler(coordinator, triggers, channels, entries, gateway);

    unwatch = new UnwatchTriggerHandler(coordinator, triggers, channels, entries, gateway);

    setLimit = new SetChannelLimitHandler(coordinator, limits, triggers, channels, gateway);

    getList = new GetVoiceListHandler(triggers, channels, limits, gateway);
    synchronize = new SynchronizeTriggerHandler(coordinator, triggers, channels, entries);
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

  const addTemporary = async (channelId = "temporary") =>
    temporary.add({
      channelId,
      guildId: "guild",
      triggerChannelId: "trigger",
      ownerId: "user",
      deleteAttempts: 0,
      createdAt: Date.now(),
    });

  it.each([
    { type: ChannelType.GuildStageVoice },
    { type: ChannelType.GuildText },
    { isAfk: true },
  ])("rejects an unsuitable trigger: %s", async (patch) => {
    gateway.getTriggerChannel.mockResolvedValueOnce({ ...facts(), ...patch });

    await expect(watch.handle("guild", "trigger")).rejects.toBeInstanceOf(
      InvalidTriggerChannelError,
    );

    expect(await triggers.get("guild", "trigger")).toBeNull();
  });

  it("rejects registering a managed channel and rejects missing bot permissions", async () => {
    await addTemporary("trigger");

    await expect(watch.handle("guild", "trigger")).rejects.toBeInstanceOf(
      InvalidTriggerChannelError,
    );

    gateway.getTriggerChannel.mockResolvedValueOnce({
      ...facts("guild", "other"),
      canManage: false,
    });

    await expect(watch.handle("guild", "other")).rejects.toBeInstanceOf(TriggerPermissionsError);
    expect(await triggers.get("guild", "other")).toBeNull();
  });

  it("does not write on repeated watch or reset the new-entry boundary", async () => {
    expect(await watch.handle("guild", "trigger")).toBe(WatchTriggerResult.Registered);

    const entry = entries.record({
      guildId: "guild",
      userId: "user",
      previousChannelId: null,
      channelId: "trigger",
      isBot: false,
    })!;

    const before = (await dataSource.query("SELECT total_changes() AS changes"))[0].changes;
    expect(await watch.handle("guild", "trigger")).toBe(WatchTriggerResult.AlreadyActive);
    expect((await dataSource.query("SELECT total_changes() AS changes"))[0].changes).toBe(before);
    expect(entries.isEligible(entry)).toBe(true);
  });

  it("preserves a preconfigured limit through watch, unwatch and watch again", async () => {
    await setLimit.handle("guild", 5, "trigger");

    expect(await triggers.get("guild", "trigger")).toMatchObject({
      isActive: false,
      channelLimit: 5,
    });

    await watch.handle("guild", "trigger");

    expect(await triggers.get("guild", "trigger")).toMatchObject({
      isActive: true,
      channelLimit: 5,
    });

    await unwatch.handle("guild", "trigger");

    expect(await triggers.get("guild", "trigger")).toMatchObject({
      isActive: false,
      channelLimit: 5,
    });

    await watch.handle("guild", "trigger");

    expect(await triggers.get("guild", "trigger")).toMatchObject({
      isActive: true,
      channelLimit: 5,
    });
  });

  it("keeps inactive settings with tracked channels and removes them only when unused", async () => {
    await watch.handle("guild", "trigger");
    await addTemporary();
    await unwatch.handle("guild", "trigger");

    expect(await triggers.get("guild", "trigger")).toMatchObject({
      isActive: false,
      channelLimit: null,
    });

    await synchronize.cleanup("guild", "trigger");
    expect(await triggers.get("guild", "trigger")).not.toBeNull();
    expect(await temporary.count("guild")).toBe(1);
    await temporary.remove("temporary");
    await synchronize.cleanup("guild", "trigger");
    expect(await triggers.get("guild", "trigger")).toBeNull();
    await watch.handle("guild", "trigger");
    await unwatch.handle("guild", "trigger");
    expect(await triggers.get("guild", "trigger")).toBeNull();
  });

  it("removes a physically deleted trigger's limit but keeps exhausted channels in guild counts", async () => {
    await setLimit.handle("guild", 3, "trigger");
    await watch.handle("guild", "trigger");
    await addTemporary();
    await temporary.reserveDeleteAttempt("temporary");
    await temporary.reserveDeleteAttempt("temporary");
    await temporary.reserveDeleteAttempt("temporary");
    await synchronize.channelDeleted("guild", "trigger");
    await synchronize.channelDeleted("guild", "trigger");
    expect(await triggers.get("guild", "trigger")).toBeNull();
    expect(await temporary.count("guild", "trigger")).toBe(1);
    await setLimit.handle("guild", 1);

    expect(
      limits.getCreationBlockReason("guild", "user", {
        guildLimit: await limits.getGuildLimit("guild"),
        triggerLimit: null,
        guildChannelCount: await channels.count("guild"),
        triggerChannelCount: 0,
      }),
    ).toBe(CreationBlockReason.GuildLimit);
  });

  it("AFK assignment unwatches and retains the limit and channels without reactivation", async () => {
    await setLimit.handle("guild", 3, "trigger");
    await watch.handle("guild", "trigger");
    await addTemporary();
    await synchronize.afkChanged("guild", "trigger");
    await synchronize.afkChanged("guild", null);

    expect(await triggers.get("guild", "trigger")).toMatchObject({
      isActive: false,
      channelLimit: 3,
    });

    expect(await temporary.count("guild")).toBe(1);
  });

  it("zero removes limits and never deactivates an active trigger or removes channels", async () => {
    await setLimit.handle("guild", 3);
    await setLimit.handle("guild", 0);
    expect(await limits.getGuildLimit("guild")).toBeNull();
    await setLimit.handle("guild", 2, "trigger");
    await setLimit.handle("guild", 0, "trigger");
    expect(await triggers.get("guild", "trigger")).toBeNull();
    await watch.handle("guild", "trigger");
    await addTemporary();
    await setLimit.handle("guild", 0, "trigger");

    expect(await triggers.get("guild", "trigger")).toMatchObject({
      isActive: true,
      channelLimit: null,
    });

    await setLimit.handle("guild", 1);
    expect(await temporary.count("guild")).toBe(1);

    await expect(setLimit.handle("guild", -1, "trigger")).rejects.toBeInstanceOf(
      InvalidChannelLimitError,
    );
  });

  it("excludes entries received before or during a successful watch", async () => {
    const old = entries.record({
      guildId: "guild",
      userId: "old",
      previousChannelId: null,
      channelId: "trigger",
      isBot: false,
    })!;

    let release!: () => void;
    let started!: () => void;

    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const startedPromise = new Promise<void>((resolve) => {
      started = resolve;
    });

    gateway.getTriggerChannel.mockImplementationOnce(async () => {
      started();
      await gate;

      return facts();
    });

    const pending = watch.handle("guild", "trigger");
    await startedPromise;

    const during = entries.record({
      guildId: "guild",
      userId: "during",
      previousChannelId: null,
      channelId: "trigger",
      isBot: false,
    })!;

    release();
    await pending;
    expect(entries.isEligible(old)).toBe(false);
    expect(entries.isEligible(during)).toBe(false);

    const after = entries.record({
      guildId: "guild",
      userId: "after",
      previousChannelId: null,
      channelId: "trigger",
      isBot: false,
    })!;

    expect(entries.isEligible(after)).toBe(true);
  });

  it("serializes trigger configuration while guild limits do not wait for Discord", async () => {
    let release!: () => void;
    let started!: () => void;

    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const startedPromise = new Promise<void>((resolve) => {
      started = resolve;
    });

    gateway.getTriggerChannel.mockImplementationOnce(async () => {
      started();
      await gate;

      return facts();
    });

    const pendingWatch = watch.handle("guild", "trigger");
    await startedPromise;
    const pendingLimit = setLimit.handle("guild", 2, "trigger");
    await setLimit.handle("guild", 10);
    await setLimit.handle("other-guild", 10);
    expect(await limits.getGuildLimit("guild")).toBe(10);
    expect(await limits.getGuildLimit("other-guild")).toBe(10);

    expect(await getList.handle("guild", true)).toMatchObject({
      triggers: [],
      totalCount: 0,
      guildLimit: 10,
    });

    expect(await triggers.get("guild", "trigger")).toBeNull();
    release();
    await Promise.all([pendingWatch, pendingLimit]);

    expect(await triggers.get("guild", "trigger")).toMatchObject({
      isActive: true,
      channelLimit: 2,
    });
  });

  it.each(["watch", "unwatch", "limit", "list"] as const)(
    "finishes an accepted owner %s after ownership changes while the guild queue is busy",
    async (operation) => {
      const ownership = new OwnershipService(
        new OwnershipRepository(dataSource, executor),
        new OwnerCodeService(),
      );

      await ownership.claim("owner", (await ownership.initialize())!);
      await watch.handle("guild", "trigger");
      const authorization = vi.spyOn(ownership, "assertOwner");
      let release!: () => void;
      let accepted!: () => void;

      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });

      const acceptance = new Promise<void>((resolve) => {
        accepted = resolve;
      });

      const held = coordinator.run("guild", () => gate);

      const targets = {
        channel: () => accepted(),
        guild: () => accepted(),
      } as unknown as CommandTargetService;

      const replies = new CommandReplyService();

      const controller = new OwnerCommandController(
        ownership,
        watch,
        unwatch,
        setLimit,
        getList,
        new CommandListService(replies, ownership, targets),
        replies,
        targets,
      );

      const interaction = {
        user: { id: "owner" },
        locale: Locale.EnglishUS,
        deferred: false,
        replied: false,
        inGuild: () => false,
        deferReply: vi.fn(async () => {
          interaction.deferred = true;
        }),
        editReply: vi.fn(async () => ({})),
      };

      const context = [interaction] as unknown as SlashCommandContext;

      const run = () => {
        switch (operation) {
          case "watch":
            return controller.watch(context, { guild: "guild", channel: "new-trigger" });
          case "unwatch":
            return controller.unwatch(context, { guild: "guild", channel: "trigger" });
          case "limit":
            return controller.limit(context, { guild: "guild", channel: "trigger", limit: 2 });
          case "list":
            return controller.list(context, { guild: "guild" });
        }
      };

      const pending = run();

      try {
        await acceptance;
        await ownership.claim("next", await ownership.recover());
        expect(authorization).toHaveBeenCalledExactlyOnceWith("owner");
      } finally {
        release();
        await held;
      }

      await pending;
      expect(interaction.editReply).toHaveBeenCalledTimes(1);
      expect(authorization).toHaveBeenCalledTimes(1);

      if (operation === "watch") {
        expect((await triggers.get("guild", "new-trigger"))?.isActive).toBe(true);
      } else if (operation === "unwatch") {
        expect(await triggers.get("guild", "trigger")).toBeNull();
      } else if (operation === "limit") {
        expect((await triggers.get("guild", "trigger"))?.channelLimit).toBe(2);
      }

      await expect(run()).rejects.toBeInstanceOf(OwnerAccessDeniedError);
      expect(interaction.editReply).toHaveBeenCalledTimes(1);
      expect(authorization).toHaveBeenCalledTimes(2);
      authorization.mockRestore();
    },
  );

  it("counts active, inactive, missing-trigger and exhausted rooms in the list snapshot", async () => {
    await watch.handle("guild", "active");
    await setLimit.handle("guild", 2, "inactive");
    await setLimit.handle("guild", 10);

    for (const [channelId, triggerChannelId, deleteAttempts] of [
      ["a", "active", 0],
      ["b", "inactive", 3],
      ["c", "missing", 1],
    ] as const) {
      await temporary.add({
        channelId,
        guildId: "guild",
        triggerChannelId,
        ownerId: "user",
        deleteAttempts,
        createdAt: 1,
      });
    }

    const list = await getList.handle("guild", true);

    expect(list).toMatchObject({
      totalCount: 3,
      orphanCount: 2,
      problemChannelIds: ["b"],
      guildLimit: 10,
    });

    expect(list.triggers).toEqual([
      { channelId: "active", isActive: true, channelLimit: null, channelCount: 1 },
      { channelId: "inactive", isActive: false, channelLimit: 2, channelCount: 1 },
    ]);
  });

  it("fetches actual channel facts only after waiting for the guild queue", async () => {
    let release!: () => void;
    let started!: () => void;

    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const startedPromise = new Promise<void>((resolve) => {
      started = resolve;
    });

    const held = coordinator.run("guild", async () => {
      started();
      await gate;
    });

    await startedPromise;

    const rejected = expect(watch.handle("guild", "trigger")).rejects.toBeInstanceOf(
      InvalidTriggerChannelError,
    );

    expect(gateway.getTriggerChannel).not.toHaveBeenCalled();
    gateway.getTriggerChannel.mockResolvedValueOnce({ ...facts(), isAfk: true });
    release();
    await held;
    await rejected;
    expect(await triggers.get("guild", "trigger")).toBeNull();
  });
});
