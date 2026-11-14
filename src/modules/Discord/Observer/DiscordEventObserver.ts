import { Injectable } from "@nestjs/common";
import { Client, Events } from "discord.js";
import { Context, On } from "necord";
import { KeyedOperationCoordinator } from "../../Core/Operation/Service/KeyedOperationCoordinator.js";
import { OperationLifetimeService } from "../../Core/Operation/Service/OperationLifetimeService.js";
import { JsonLogger } from "../../Logging/Service/JsonLogger.js";
import { ReconciliationService } from "../../Reconciliation/Service/ReconciliationService.js";
import { DiscordGuildStateService } from "../Service/DiscordGuildStateService.js";

import type { Guild } from "discord.js";
import type { ContextOf } from "necord";

@Injectable()
export class DiscordEventObserver {
  private static readonly LOG_EVENT = "discord.gateway";

  constructor(
    private readonly client: Client,
    private readonly state: DiscordGuildStateService,
    private readonly runtime: ReconciliationService,
    private readonly lifetime: OperationLifetimeService,
    private readonly logger: JsonLogger,
    private readonly coordinator: KeyedOperationCoordinator,
  ) {}

  /** @throws {Promise<TypeError>} Writing a diagnostic failed. */
  @On(Events.ClientReady)
  async clientReady(): Promise<void> {
    await Promise.all(this.client.guilds.cache.map((guild) => this.available(guild)));
  }

  /** @throws {Promise<unknown>} Writing a diagnostic failed. */
  @On(Events.GuildCreate)
  async guildCreated(@Context() [guild]: ContextOf<Events.GuildCreate>): Promise<void> {
    await this.available(guild);
  }

  /** @throws {Promise<unknown>} Writing a diagnostic failed. */
  @On(Events.GuildAvailable)
  async guildAvailable(@Context() [guild]: ContextOf<Events.GuildAvailable>): Promise<void> {
    await this.available(guild);
  }

  @On(Events.GuildUnavailable)
  guildUnavailable(@Context() [guild]: ContextOf<Events.GuildUnavailable>): void {
    this.state.invalidate(guild.id);
    this.runtime.invalidateGuild(guild.id);
  }

  /** @throws {Promise<unknown>} Writing a diagnostic failed. */
  @On(Events.GuildDelete)
  async guildDeleted(@Context() [guild]: ContextOf<Events.GuildDelete>): Promise<void> {
    this.state.invalidate(guild.id);
    await this.dispatch(() => this.runtime.confirmedGuildRemoval(guild.id));
  }

  /** @throws {Promise<unknown>} Writing a diagnostic failed. */
  @On(Events.VoiceStateUpdate)
  async voiceChanged(
    @Context() [previous, current]: ContextOf<Events.VoiceStateUpdate>,
  ): Promise<void> {
    await this.dispatch(() =>
      this.runtime.observeVoiceTransition({
        guildId: current.guild.id,
        userId: current.id,
        previousChannelId: previous.channelId,
        channelId: current.channelId,
        isBot: current.member?.user.bot ?? this.client.users.cache.get(current.id)?.bot ?? true,
      }),
    );
  }

  /** @throws {Promise<unknown>} Writing a diagnostic failed. */
  @On(Events.ChannelDelete)
  async channelDeleted(@Context() [channel]: ContextOf<Events.ChannelDelete>): Promise<void> {
    if ("guildId" in channel) {
      await this.dispatch(() => this.runtime.channelDeleted(channel.guildId, channel.id));
    }
  }

  /** @throws {Promise<unknown>} Writing a diagnostic failed. */
  @On(Events.ChannelUpdate)
  async channelChanged(
    @Context() [_previous, channel]: ContextOf<Events.ChannelUpdate>,
  ): Promise<void> {
    if ("guildId" in channel) {
      await this.dispatch(() => this.runtime.channelChanged(channel.guildId, channel.id));
    }
  }

  /** @throws {Promise<unknown>} Writing a diagnostic failed. */
  @On(Events.GuildUpdate)
  async guildChanged(@Context() [previous, current]: ContextOf<Events.GuildUpdate>): Promise<void> {
    if (previous.afkChannelId !== current.afkChannelId) {
      await this.dispatch(() => this.runtime.afkChanged(current.id, current.afkChannelId));
    }
  }

  @On(Events.ShardDisconnect)
  shardDisconnected(@Context() [_event, shardId]: ContextOf<Events.ShardDisconnect>): void {
    this.invalidateShard(shardId);
  }

  @On(Events.ShardReconnecting)
  shardReconnecting(@Context() [shardId]: ContextOf<Events.ShardReconnecting>): void {
    this.invalidateShard(shardId);
  }

  /** @throws {Promise<TypeError>} Writing a diagnostic failed. */
  @On(Events.ShardResume)
  async shardResumed(@Context() [shardId]: ContextOf<Events.ShardResume>): Promise<void> {
    await this.restoreShard(shardId);
  }

  /** @throws {Promise<TypeError>} Writing a diagnostic failed. */
  @On(Events.ShardReady)
  async shardReady(@Context() [shardId]: ContextOf<Events.ShardReady>): Promise<void> {
    await this.restoreShard(shardId);
  }

  @On(Events.Invalidated)
  invalidated(): void {
    for (const guild of this.client.guilds.cache.values()) {
      this.state.invalidate(guild.id);
      this.runtime.invalidateGuild(guild.id);
    }

    this.lifetime.fail();
  }

  /**
   * @throws {TypeError}
   */
  @On(Events.Error)
  clientError(): void {
    this.logger.error({
      event: DiscordEventObserver.LOG_EVENT,
      reason: "Discord client reported an error.",
    });
  }

  /** @throws {unknown} Writing a diagnostic failed. */
  private available(guild: Guild): Promise<void> {
    if (this.client.isReady() && guild.available && this.state.markAvailable(guild.id)) {
      return this.dispatch(() => this.runtime.restoreGuild(guild.id));
    }

    return Promise.resolve();
  }

  private invalidateShard(shardId: number): void {
    for (const guild of this.client.guilds.cache.values()) {
      if (guild.shardId === shardId) {
        this.state.invalidate(guild.id);
        this.runtime.invalidateGuild(guild.id);
      }
    }
  }

  /** @throws {unknown} The event diagnostic failed asynchronously. */
  private dispatch(operation: () => Promise<void>): Promise<void> {
    return this.coordinator.outsideOperationContext(operation);
  }

  /** @throws {Promise<TypeError>} Writing a diagnostic failed. */
  private async restoreShard(shardId: number): Promise<void> {
    await Promise.all(
      this.client.guilds.cache
        .filter((guild) => guild.shardId === shardId)
        .map((guild) => this.available(guild)),
    );
  }
}
