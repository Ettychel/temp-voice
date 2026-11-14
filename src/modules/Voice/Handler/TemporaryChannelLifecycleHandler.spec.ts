import "reflect-metadata";
import { ChannelType } from "discord.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { DataSource } from "typeorm";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DatabaseOptionsFactory } from "../../App/Factory/DatabaseOptionsFactory.js";
import { OperationAdmissionClosedError } from "../../Core/Operation/Error/OperationAdmissionClosedError.js";
import { KeyedOperationCoordinator } from "../../Core/Operation/Service/KeyedOperationCoordinator.js";
import { OperationLifetimeService } from "../../Core/Operation/Service/OperationLifetimeService.js";
import { DiscordEventObserver } from "../../Discord/Observer/DiscordEventObserver.js";
import { DiscordGuildStateService } from "../../Discord/Service/DiscordGuildStateService.js";
import { DatabaseConfig } from "../../Infrastructure/Database/Config/DatabaseConfig.js";
import { DatabaseOperationError } from "../../Infrastructure/Database/Error/DatabaseOperationError.js";
import { DatabaseOperationExecutor } from "../../Infrastructure/Database/Service/DatabaseOperationExecutor.js";
import { GuildLimitRepository } from "../../Limits/Repository/GuildLimitRepository.js";
import { LimitsService } from "../../Limits/Service/LimitsService.js";
import { JsonLogger } from "../../Logging/Service/JsonLogger.js";
import { ReconciliationService } from "../../Reconciliation/Service/ReconciliationService.js";
import { TriggerRepository } from "../../Triggers/Repository/TriggerRepository.js";
import { TriggerService } from "../../Triggers/Service/TriggerService.js";
import { ChannelDeletionResult } from "../Enum/ChannelDeletionResult.js";
import { VoiceChannelState } from "../Enum/VoiceChannelState.js";
import { VoiceChannelMissingError } from "../Error/VoiceChannelMissingError.js";
import { VoiceChannelMutationError } from "../Error/VoiceChannelMutationError.js";
import { VoiceChannelUnavailableError } from "../Error/VoiceChannelUnavailableError.js";
import { GuildRemovalRepository } from "../Repository/GuildRemovalRepository.js";
import { TemporaryChannelRepository } from "../Repository/TemporaryChannelRepository.js";
import { TemporaryChannelService } from "../Service/TemporaryChannelService.js";
import { VoiceEntryService } from "../Service/VoiceEntryService.js";
import { CreateTemporaryChannelHandler } from "./CreateTemporaryChannelHandler.js";
import { DeleteTemporaryChannelHandler } from "./DeleteTemporaryChannelHandler.js";
import { ReconcileGuildHandler } from "./ReconcileGuildHandler.js";
import { RemoveGuildHandler } from "./RemoveGuildHandler.js";
import { SetChannelLimitHandler } from "./SetChannelLimitHandler.js";
import { SynchronizeTriggerHandler } from "./SynchronizeTriggerHandler.js";
import { UnwatchTriggerHandler } from "./UnwatchTriggerHandler.js";
import { WatchTriggerHandler } from "./WatchTriggerHandler.js";

import type { Client, VoiceChannel } from "discord.js";
import type { VoiceEntryDto } from "../Dto/VoiceEntryDto.js";

describe("temporary channel lifecycle with Discord substituted and real SQLite", () => {
  let directory: string;
  let dataSource: DataSource;
  let coordinator: KeyedOperationCoordinator;
  let triggers: TriggerService;
  let limits: LimitsService;
  let repository: TemporaryChannelRepository;
  let channels: TemporaryChannelService;
  let entries: VoiceEntryService;
  let create: CreateTemporaryChannelHandler;
  let deletion: DeleteTemporaryChannelHandler;
  let watch: WatchTriggerHandler;
  let unwatch: UnwatchTriggerHandler;
  let setLimit: SetChannelLimitHandler;
  let logger: JsonLogger;
  let nextId: number;
  let runtime: ReconciliationService;
  let removals: GuildRemovalRepository;
  let removal: RemoveGuildHandler;
  let lifetime: OperationLifetimeService;

  const gateway = {
    getTriggerChannel: vi.fn(async (guildId: string, channelId: string) => ({
      guildId,
      channelId,
      type: ChannelType.GuildVoice,
      isAfk: false,
      canManage: true,
    })),
    isMemberInChannel: vi.fn(async () => true),
    createChannel: vi.fn(async () => String(++nextId)),
    moveMember: vi.fn(async (_guildId: string, _userId: string, _channelId: string) => {}),
    getChannelState: vi.fn(async (): Promise<VoiceChannelState> => VoiceChannelState.Empty),
    deleteChannel: vi.fn(async (_guildId: string, _channelId: string) => {}),
  };

  const enter = (userId = "user", channelId = "trigger"): VoiceEntryDto =>
    entries.record({ guildId: "guild", userId, previousChannelId: null, channelId, isBot: false })!;

  beforeEach(async () => {
    vi.resetAllMocks();
    nextId = 0;

    gateway.getTriggerChannel.mockImplementation(async (guildId, channelId) => ({
      guildId,
      channelId,
      type: ChannelType.GuildVoice,
      isAfk: false,
      canManage: true,
    }));

    gateway.isMemberInChannel.mockResolvedValue(true);
    gateway.createChannel.mockImplementation(async () => String(++nextId));
    gateway.moveMember.mockResolvedValue(undefined);
    gateway.getChannelState.mockResolvedValue(VoiceChannelState.Empty);
    gateway.deleteChannel.mockResolvedValue(undefined);
    directory = await mkdtemp(join(tmpdir(), "temp-voice-lifecycle-"));

    dataSource = new DataSource(
      new DatabaseOptionsFactory(
        new DatabaseConfig(join(directory, "lifecycle.sqlite")),
      ).createTypeOrmOptions(),
    );

    await dataSource.initialize();
    const executor = new DatabaseOperationExecutor();
    coordinator = new KeyedOperationCoordinator();
    triggers = new TriggerService(new TriggerRepository(dataSource, executor));
    limits = new LimitsService(new GuildLimitRepository(dataSource, executor));
    repository = new TemporaryChannelRepository(dataSource, executor);
    channels = new TemporaryChannelService(repository);
    entries = new VoiceEntryService();
    logger = new JsonLogger();
    vi.spyOn(logger, "log").mockImplementation(() => {});
    vi.spyOn(logger, "warn").mockImplementation(() => {});
    vi.spyOn(logger, "error").mockImplementation(() => {});
    deletion = new DeleteTemporaryChannelHandler(coordinator, channels, triggers, logger, gateway);

    create = new CreateTemporaryChannelHandler(
      coordinator,
      triggers,
      limits,
      channels,
      entries,
      deletion,
      logger,
      gateway,
    );

    watch = new WatchTriggerHandler(coordinator, triggers, channels, entries, gateway);
    unwatch = new UnwatchTriggerHandler(coordinator, triggers, channels, entries);
    setLimit = new SetChannelLimitHandler(coordinator, limits, triggers, channels, gateway);
    lifetime = new OperationLifetimeService(coordinator);
    removals = new GuildRemovalRepository(dataSource, executor);
    removal = new RemoveGuildHandler(coordinator, removals, channels, triggers, limits);

    runtime = new ReconciliationService(
      entries,
      new ReconcileGuildHandler(coordinator, triggers, channels, entries, deletion, gateway),
      create,
      deletion,
      new SynchronizeTriggerHandler(coordinator, triggers, channels, entries),
      removal,
      coordinator,
      lifetime,
      logger,
    );

    await watch.handle("guild", "trigger");
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

  it("reconciles only tracked identities and keeps occupied or unknown channels in limits", async () => {
    for (const id of ["occupied", "unknown", "missing", "empty"]) {
      await channels.recordCreated("guild", "trigger", "owner", id);
    }

    gateway.getChannelState.mockImplementation(async (_guild?: string, channelId?: string) => {
      if (channelId === "occupied") {
        return VoiceChannelState.Occupied;
      }

      if (channelId === "unknown") {
        return VoiceChannelState.Unknown;
      }

      if (channelId === "missing") {
        return VoiceChannelState.Missing;
      }

      return VoiceChannelState.Empty;
    });

    await runtime.restoreGuild("guild");
    expect(runtime.isReady("guild")).toBe(true);

    expect((await channels.list("guild")).map((channel) => channel.channelId).sort()).toEqual([
      "occupied",
      "unknown",
    ]);

    expect(gateway.deleteChannel).toHaveBeenCalledExactlyOnceWith("guild", "empty");
    expect(gateway.createChannel).not.toHaveBeenCalled();
  });

  it("buffers new entries during reconciliation and ignores earlier occupants and entries that already left", async () => {
    enter("present-at-start");

    gateway.getTriggerChannel.mockImplementationOnce(async (guildId, channelId) => {
      await runtime.observeVoiceTransition({
        guildId,
        userId: "new",
        previousChannelId: null,
        channelId,
        isBot: false,
      });

      await runtime.observeVoiceTransition({
        guildId,
        userId: "gone",
        previousChannelId: null,
        channelId,
        isBot: false,
      });

      await runtime.observeVoiceTransition({
        guildId,
        userId: "gone",
        previousChannelId: channelId,
        channelId: null,
        isBot: false,
      });

      return { guildId, channelId, type: ChannelType.GuildVoice, isAfk: false, canManage: true };
    });

    await runtime.restoreGuild("guild");
    expect(gateway.createChannel).toHaveBeenCalledExactlyOnceWith("guild", "trigger", "new");
  });

  it("does not lose a departure received after its channel was checked during reconciliation", async () => {
    await channels.recordCreated("guild", "trigger", "owner", "first");
    await channels.recordCreated("guild", "trigger", "owner", "second");
    let departed = false;

    gateway.getChannelState.mockImplementation(async (_guild?: string, channelId?: string) => {
      if (channelId === "second") {
        departed = true;

        await runtime.observeVoiceTransition({
          guildId: "guild",
          userId: "human",
          previousChannelId: "first",
          channelId: null,
          isBot: false,
        });
      }

      return channelId === "first" && departed
        ? VoiceChannelState.Empty
        : VoiceChannelState.Occupied;
    });

    await runtime.restoreGuild("guild");
    expect(await channels.get("guild", "first")).toBeNull();
    expect(await channels.get("guild", "second")).not.toBeNull();
  });

  it("invalidates pre-disconnect entries and preserves data while the guild is unavailable", async () => {
    await runtime.restoreGuild("guild");
    const obsolete = enter("old");
    await channels.recordCreated("guild", "trigger", "owner", "occupied");
    runtime.invalidateGuild("guild");
    expect(runtime.isReady("guild")).toBe(false);
    expect(await channels.count("guild")).toBe(1);
    gateway.getChannelState.mockResolvedValue(VoiceChannelState.Occupied);
    await runtime.restoreGuild("guild");
    expect(await create.handle(obsolete)).toBeNull();
    expect(await channels.count("guild")).toBe(1);
    expect(gateway.createChannel).not.toHaveBeenCalled();
    expect(gateway.deleteChannel).not.toHaveBeenCalled();
  });

  it("preserves inaccessible trigger configuration, unwatching AFK while forgetting a confirmed deleted trigger", async () => {
    await watch.handle("guild", "afk");
    await watch.handle("guild", "missing");
    await setLimit.handle("guild", 4, "afk");
    await setLimit.handle("guild", 5, "missing");
    await channels.recordCreated("guild", "missing", "owner", "child");
    gateway.getChannelState.mockResolvedValue(VoiceChannelState.Occupied);

    gateway.getTriggerChannel.mockImplementation(async (guildId, channelId) => {
      if (channelId === "trigger") {
        throw new VoiceChannelUnavailableError();
      }

      if (channelId === "missing") {
        throw new VoiceChannelMissingError();
      }

      return { guildId, channelId, type: ChannelType.GuildVoice, isAfk: true, canManage: true };
    });

    await runtime.restoreGuild("guild");
    expect(await triggers.get("guild", "trigger")).toMatchObject({ isActive: true });
    expect(await triggers.get("guild", "afk")).toMatchObject({ isActive: false, channelLimit: 4 });
    expect(await triggers.get("guild", "missing")).toBeNull();
    expect(await channels.count("guild")).toBe(1);
  });

  it("cleans confirmed channel deletion idempotently without deleting its children", async () => {
    await setLimit.handle("guild", 3, "trigger");
    await channels.recordCreated("guild", "trigger", "owner", "child");
    await runtime.channelDeleted("guild", "trigger");
    await runtime.channelDeleted("guild", "trigger");
    expect(await triggers.get("guild", "trigger")).toBeNull();
    expect(await channels.count("guild")).toBe(1);
    await runtime.channelDeleted("guild", "child");
    await runtime.channelDeleted("guild", "child");
    expect(await channels.count("guild")).toBe(0);
    expect(gateway.deleteChannel).not.toHaveBeenCalled();
  });

  it("resumes interrupted confirmed guild cleanup from its durable marker", async () => {
    await limits.setGuildLimit("guild", 7);
    await channels.recordCreated("guild", "trigger", "owner", "child");
    vi.spyOn(triggers, "clearGuild").mockRejectedValueOnce(new DatabaseOperationError(true));
    await expect(removal.handle("guild")).rejects.toBeInstanceOf(DatabaseOperationError);
    expect(await removals.pending()).toEqual(["guild"]);
    expect(await limits.getGuildLimit("guild")).toBe(7);
    await dataSource.destroy();
    await dataSource.initialize();
    await runtime.onModuleInit();
    expect(await removals.pending()).toEqual([]);
    expect(await channels.count("guild")).toBe(0);
    expect(await triggers.list("guild")).toEqual([]);
    expect(await limits.getGuildLimit("guild")).toBeNull();
    await runtime.confirmedGuildRemoval("guild");
    expect(await removals.pending()).toEqual([]);
  });

  it("signals fatal database failure to the process after compensating the known Discord identity", async () => {
    await runtime.restoreGuild("guild");
    vi.spyOn(channels, "recordCreated").mockRejectedValueOnce(new DatabaseOperationError(false));

    await runtime.observeVoiceTransition({
      guildId: "guild",
      userId: "new",
      previousChannelId: null,
      channelId: "trigger",
      isBot: false,
    });

    await lifetime.failure;
    expect(coordinator.isAcceptingOperations).toBe(false);
    expect(gateway.deleteChannel).toHaveBeenCalledWith("guild", "1");
    expect(gateway.moveMember).not.toHaveBeenCalled();
  });

  it("finishes an interrupted removal before accepting the re-invited guild", async () => {
    await limits.setGuildLimit("guild", 7);
    vi.spyOn(triggers, "clearGuild").mockRejectedValueOnce(new DatabaseOperationError(true));
    await runtime.confirmedGuildRemoval("guild");
    expect(await removals.pending()).toEqual(["guild"]);
    await runtime.restoreGuild("guild");
    expect(runtime.isReady("guild")).toBe(true);
    expect(await removals.pending()).toEqual([]);
    expect(await triggers.list("guild")).toEqual([]);
    expect(await limits.getGuildLimit("guild")).toBeNull();
  });

  it("queues an SDK channelDelete notification emitted inside REST without inheriting its active operation", async () => {
    const observer = new DiscordEventObserver(
      {} as Client,
      new DiscordGuildStateService(),
      runtime,
      lifetime,
      logger,
      coordinator,
    );

    let notification!: Promise<void>;
    await channels.recordCreated("guild", "trigger", "owner", "child");

    gateway.deleteChannel.mockImplementationOnce(async (guildId, channelId) => {
      notification = observer.channelDeleted([{ guildId, id: channelId } as VoiceChannel]);
    });

    await deletion.handle("guild", "child");
    await notification;
    expect(await channels.count("guild")).toBe(0);
    expect(coordinator.isAcceptingOperations).toBe(true);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it("persists identity before moving and sets cooldown only after successful movement", async () => {
    gateway.moveMember.mockImplementationOnce(async (_guild, _user, channelId) => {
      expect(await repository.find(channelId)).toMatchObject({
        guildId: "guild",
        ownerId: "user",
        deleteAttempts: 0,
      });
    });

    expect(await create.handle(enter())).toBe("1");
    expect(await create.handle(enter("user", "trigger"))).toBeNull();
    expect(await create.handle(enter("another-user"))).toBe("2");
    expect(gateway.createChannel).toHaveBeenCalledTimes(2);
    expect(await repository.count("guild")).toBe(2);
  });

  it("does not treat duplicate delivery as a new entrance after cooldown expires", async () => {
    const entry = enter();

    expect(await Promise.all([create.handle(entry), create.handle({ ...entry })])).toEqual([
      "1",
      null,
    ]);

    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 5001);
    expect(await create.handle({ ...entry })).toBeNull();
    expect(await create.handle(enter())).toBe("2");
  });

  it("serializes different triggers against the same guild limit", async () => {
    await watch.handle("guild", "second-trigger");
    await setLimit.handle("guild", 1);

    const result = await Promise.all([
      create.handle(enter("first")),
      create.handle(enter("second", "second-trigger")),
    ]);

    expect(result.filter((id) => id !== null)).toHaveLength(1);
    expect(gateway.createChannel).toHaveBeenCalledTimes(1);
    expect(await repository.count("guild")).toBe(1);
  });

  it("serializes entrants against the trigger limit", async () => {
    await setLimit.handle("guild", 1, "trigger");

    const result = await Promise.all([
      create.handle(enter("first")),
      create.handle(enter("second")),
    ]);

    expect(result.filter((id) => id !== null)).toHaveLength(1);
    expect(gateway.createChannel).toHaveBeenCalledTimes(1);
  });

  it("lowering the limit retains existing channels and blocks until all excess slots are freed", async () => {
    await channels.recordCreated("guild", "trigger", "old", "existing-a");
    await channels.recordCreated("guild", "trigger", "old", "existing-b");
    await setLimit.handle("guild", 1);
    expect(await create.handle(enter())).toBeNull();
    expect(await repository.count("guild")).toBe(2);
    expect(gateway.deleteChannel).not.toHaveBeenCalled();
    await repository.remove("existing-a");
    expect(await create.handle(enter())).toBeNull();
    await repository.remove("existing-b");
    expect(await create.handle(enter())).toBe("1");
  });

  it("does not create from a stale entry that left and returned while queued", async () => {
    let release!: () => void;

    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const held = coordinator.run("guild", () => gate);
    const old = enter();
    const pending = create.handle(old);

    entries.record({
      guildId: "guild",
      userId: "user",
      previousChannelId: "trigger",
      channelId: null,
      isBot: false,
    });

    const returned = enter();
    release();
    await held;
    expect(await pending).toBeNull();
    expect(gateway.createChannel).not.toHaveBeenCalled();
    expect(await create.handle(returned)).toBe("1");
  });

  it("rolls back if the creator leaves and returns during Discord creation", async () => {
    let returned!: VoiceEntryDto;

    gateway.createChannel.mockImplementationOnce(async () => {
      entries.record({
        guildId: "guild",
        userId: "user",
        previousChannelId: "trigger",
        channelId: null,
        isBot: false,
      });

      returned = enter();

      return "stale-room";
    });

    expect(await create.handle(enter())).toBeNull();
    expect(gateway.moveMember).not.toHaveBeenCalled();
    expect(await repository.find("stale-room")).toBeNull();
    expect(await create.handle(returned)).toBe("1");
  });

  it("keeps an occupied rollback channel until its last ordinary user leaves", async () => {
    gateway.createChannel.mockImplementationOnce(async () => {
      entries.record({
        guildId: "guild",
        userId: "user",
        previousChannelId: "trigger",
        channelId: null,
        isBot: false,
      });

      return "occupied-room";
    });

    gateway.getChannelState.mockResolvedValueOnce(VoiceChannelState.Occupied);
    expect(await create.handle(enter())).toBeNull();
    expect(await repository.find("occupied-room")).toMatchObject({ deleteAttempts: 0 });
    expect(gateway.deleteChannel).not.toHaveBeenCalled();
    expect(await deletion.handle("guild", "occupied-room")).toBe(ChannelDeletionResult.Deleted);
    expect(await repository.count("guild")).toBe(0);
  });

  it("movement failure uses one shared rollback and does not start cooldown", async () => {
    gateway.moveMember.mockRejectedValueOnce(new VoiceChannelMutationError());

    gateway.deleteChannel.mockImplementationOnce(async (_guild, channelId) => {
      expect(await repository.find(channelId)).toMatchObject({ deleteAttempts: 1 });
    });

    await expect(create.handle(enter())).rejects.toBeInstanceOf(VoiceChannelMutationError);
    expect(gateway.deleteChannel).toHaveBeenCalledTimes(1);
    expect(await repository.count("guild")).toBe(0);
    expect(await create.handle(enter())).toBe("2");
  });

  it("a failed rollback retains identity and spent budget without starting cooldown", async () => {
    gateway.moveMember.mockRejectedValueOnce(new VoiceChannelMutationError());
    gateway.deleteChannel.mockRejectedValueOnce(new VoiceChannelMutationError());
    await expect(create.handle(enter())).rejects.toBeInstanceOf(VoiceChannelMutationError);
    expect(await repository.find("1")).toMatchObject({ deleteAttempts: 1 });
    expect(await create.handle(enter())).toBe("2");
  });

  it("bounds deletion to three persisted attempts and can later clear confirmed absence", async () => {
    await channels.recordCreated("guild", "trigger", "user", "tracked");
    await unwatch.handle("guild", "trigger");
    gateway.deleteChannel.mockRejectedValue(new VoiceChannelMutationError());

    for (let attempt = 1; attempt <= 3; attempt++) {
      expect(await deletion.handle("guild", "tracked")).toBe(ChannelDeletionResult.Failed);
      expect(gateway.deleteChannel).toHaveBeenCalledTimes(attempt);
      expect(await repository.find("tracked")).toMatchObject({ deleteAttempts: attempt });
    }

    expect(await deletion.handle("guild", "tracked")).toBe(ChannelDeletionResult.Exhausted);
    expect(gateway.deleteChannel).toHaveBeenCalledTimes(3);
    expect(await repository.count("guild")).toBe(1);
    gateway.getChannelState.mockResolvedValueOnce(VoiceChannelState.Missing);
    expect(await deletion.handle("guild", "tracked")).toBe(ChannelDeletionResult.ConfirmedMissing);
    expect(await repository.count("guild")).toBe(0);
    expect(await triggers.get("guild", "trigger")).toBeNull();
  });

  it.each([VoiceChannelState.Occupied, VoiceChannelState.Unknown])(
    "does not spend deletion attempts with state %s",
    async (state) => {
      await channels.recordCreated("guild", "trigger", "user", "tracked");
      gateway.getChannelState.mockResolvedValue(state);
      await deletion.handle("guild", "tracked");
      expect(await repository.find("tracked")).toMatchObject({ deleteAttempts: 0 });
      expect(gateway.deleteChannel).not.toHaveBeenCalled();
    },
  );

  it("coalesces concurrent deletion requests into one failed attempt", async () => {
    await channels.recordCreated("guild", "trigger", "user", "tracked");
    gateway.deleteChannel.mockRejectedValue(new VoiceChannelMutationError());

    expect(
      await Promise.all([deletion.handle("guild", "tracked"), deletion.handle("guild", "tracked")]),
    ).toEqual([ChannelDeletionResult.Failed, ChannelDeletionResult.Failed]);

    expect(gateway.deleteChannel).toHaveBeenCalledTimes(1);
    expect(await repository.find("tracked")).toMatchObject({ deleteAttempts: 1 });
  });

  it("keeps a channel that became occupied while its deletion attempt was being reserved", async () => {
    await channels.recordCreated("guild", "trigger", "user", "tracked");

    gateway.getChannelState
      .mockResolvedValueOnce(VoiceChannelState.Empty)
      .mockResolvedValueOnce(VoiceChannelState.Occupied);

    expect(await deletion.handle("guild", "tracked")).toBe(ChannelDeletionResult.Occupied);
    expect(await repository.find("tracked")).toMatchObject({ deleteAttempts: 1 });
    expect(gateway.deleteChannel).not.toHaveBeenCalled();
  });

  it("shares a queued deletion with rollback without reacquiring the guild queue", async () => {
    let reachedMove!: () => void;
    let releaseMove!: () => void;

    const reached = new Promise<void>((resolve) => {
      reachedMove = resolve;
    });

    const gate = new Promise<void>((resolve) => {
      releaseMove = resolve;
    });

    gateway.moveMember.mockImplementationOnce(async () => {
      reachedMove();
      await gate;
      throw new VoiceChannelMutationError();
    });

    gateway.deleteChannel.mockRejectedValueOnce(new VoiceChannelMutationError());

    const creation = expect(create.handle(enter())).rejects.toBeInstanceOf(
      VoiceChannelMutationError,
    );

    await reached;
    const queued = deletion.handle("guild", "1");
    releaseMove();
    await creation;
    expect(await queued).toBe(ChannelDeletionResult.Failed);
    expect(gateway.deleteChannel).toHaveBeenCalledTimes(1);
    expect(await repository.find("1")).toMatchObject({ deleteAttempts: 1 });
  });

  it("does not retry immediately if rollback persistence fails", async () => {
    gateway.createChannel.mockImplementationOnce(async () => {
      entries.record({
        guildId: "guild",
        userId: "user",
        previousChannelId: "trigger",
        channelId: null,
        isBot: false,
      });

      return "cancelled-room";
    });

    const failure = new DatabaseOperationError(false);
    vi.spyOn(channels, "reserveDeletion").mockRejectedValueOnce(failure);
    await expect(create.handle(enter())).rejects.toBe(failure);
    expect(channels.reserveDeletion).toHaveBeenCalledTimes(1);
    expect(gateway.deleteChannel).not.toHaveBeenCalled();
    expect(await repository.find("cancelled-room")).toMatchObject({ deleteAttempts: 0 });
  });

  it("keeps another guild independent while creation is waiting for Discord", async () => {
    await watch.handle("other-guild", "trigger");
    let release!: () => void;
    let started!: () => void;

    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const startedPromise = new Promise<void>((resolve) => {
      started = resolve;
    });

    gateway.createChannel.mockImplementationOnce(async () => {
      started();
      await gate;

      return "slow-room";
    });

    const slow = create.handle(enter());
    await startedPromise;

    const other = entries.record({
      guildId: "other-guild",
      userId: "user",
      previousChannelId: null,
      channelId: "trigger",
      isBot: false,
    })!;

    expect(await create.handle(other)).toBe("1");
    expect(await repository.count("other-guild")).toBe(1);
    expect(await repository.count("guild")).toBe(0);
    release();
    expect(await slow).toBe("slow-room");
  });

  it("does not move an existing occupant merely because watch completed", async () => {
    const existing = enter("already-present", "new-trigger");
    await watch.handle("guild", "new-trigger");
    expect(await create.handle(existing)).toBeNull();
    expect(gateway.createChannel).not.toHaveBeenCalled();
    expect(gateway.moveMember).not.toHaveBeenCalled();
    expect(await create.handle(enter("new-user", "new-trigger"))).toBe("1");
  });

  it("does not start cooldown after Discord creation failed", async () => {
    gateway.createChannel.mockRejectedValueOnce(new VoiceChannelMutationError());
    await expect(create.handle(enter())).rejects.toBeInstanceOf(VoiceChannelMutationError);
    expect(await repository.count("guild")).toBe(0);
    expect(await create.handle(enter())).toBe("1");
  });

  it("does not close admission after a transient busy error while persisting the new channel", async () => {
    vi.spyOn(channels, "recordCreated").mockRejectedValueOnce(new DatabaseOperationError(true));

    await expect(create.handle(enter())).rejects.toMatchObject({
      name: "DatabaseOperationError",
      isBusy: true,
    });

    expect(gateway.deleteChannel).toHaveBeenCalledWith("guild", "1");
    expect(coordinator.isAcceptingOperations).toBe(true);
    expect(await create.handle(enter())).toBe("2");
  });

  it("compensates an unsaved Discord ID, rejects the result, and closes admission on irreversible persistence failure", async () => {
    const failure = new DatabaseOperationError(false);
    vi.spyOn(channels, "recordCreated").mockRejectedValueOnce(failure);
    const first = expect(create.handle(enter())).rejects.toBe(failure);

    const queued = expect(create.handle(enter("queued"))).rejects.toBeInstanceOf(
      OperationAdmissionClosedError,
    );

    await first;
    await queued;
    expect(gateway.deleteChannel).toHaveBeenCalledWith("guild", "1");
    expect(gateway.moveMember).not.toHaveBeenCalled();
    expect(coordinator.isAcceptingOperations).toBe(false);

    await expect(create.handle(enter("other"))).rejects.toBeInstanceOf(
      OperationAdmissionClosedError,
    );

    expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ channelId: "1" }));
  });
});
