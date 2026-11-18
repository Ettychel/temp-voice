import { Injectable } from "@nestjs/common";
import {
  ChannelFlags,
  ChannelType,
  Client,
  DiscordAPIError,
  PermissionFlagsBits,
  RESTJSONErrorCodes,
  Routes,
} from "discord.js";
import { VoiceChannelState } from "../../Voice/Enum/VoiceChannelState.js";
import { VoiceChannelMissingError } from "../../Voice/Error/VoiceChannelMissingError.js";
import { VoiceChannelMutationError } from "../../Voice/Error/VoiceChannelMutationError.js";
import { VoiceChannelUnavailableError } from "../../Voice/Error/VoiceChannelUnavailableError.js";
import { VoiceChannelOptionsFactory } from "../Factory/VoiceChannelOptionsFactory.js";
import { DiscordGuildStateService } from "../Service/DiscordGuildStateService.js";

import type { Guild, GuildBasedChannel, GuildMember, VoiceChannel } from "discord.js";
import type { TriggerChannelDto } from "../../Triggers/Dto/TriggerChannelDto.js";
import type { VoiceChannelGatewayInterface } from "../../Voice/Interface/VoiceChannelGatewayInterface.js";

@Injectable()
export class DiscordVoiceChannelAdapter implements VoiceChannelGatewayInterface {
  private static readonly REQUIRED_PERMISSIONS =
    PermissionFlagsBits.ViewChannel |
    PermissionFlagsBits.ManageChannels |
    PermissionFlagsBits.Connect |
    PermissionFlagsBits.MoveMembers;

  constructor(
    private readonly client: Client,
    private readonly state: DiscordGuildStateService,
    private readonly optionsFactory: VoiceChannelOptionsFactory,
  ) {}

  /** @throws {VoiceChannelUnavailableError} The bot cannot currently access this guild. */
  assertGuildAvailable(guildId: string): void {
    this.currentGuild(guildId);
  }

  /**
   * @throws {Promise<VoiceChannelMissingError>} A direct API response confirmed absence.
   * @throws {Promise<VoiceChannelUnavailableError>} The guild, channel or permissions are unavailable.
   */
  async getTriggerChannel(guildId: string, channelId: string): Promise<TriggerChannelDto> {
    const { guild, epoch, botId } = this.currentGuild(guildId);
    const channel = await this.fetchChannel(guild, channelId, epoch, true);
    let canManage = false;

    if (channel.type === ChannelType.GuildVoice) {
      const bot = await this.fetchMember(guild, botId, true);
      this.assertCurrent(guild, epoch);
      canManage = this.canCopy(channel, bot);
    }

    return {
      guildId,
      channelId,
      type: channel.type,
      isAfk: guild.afkChannelId === channelId,
      canManage,
    };
  }

  /** @throws {Promise<VoiceChannelUnavailableError>} The current voice snapshot is unavailable. */
  async isMemberInChannel(guildId: string, userId: string, channelId: string): Promise<boolean> {
    const { guild } = this.currentGuild(guildId);

    return guild.voiceStates.cache.get(userId)?.channelId === channelId;
  }

  /**
   * @throws {Promise<VoiceChannelUnavailableError>} Source or creator facts are unavailable.
   * @throws {Promise<VoiceChannelMutationError>} Permissions are insufficient or creation failed.
   */
  async createChannel(guildId: string, triggerChannelId: string, userId: string): Promise<string> {
    const { guild, epoch, botId } = this.currentGuild(guildId);
    const source = await this.fetchChannel(guild, triggerChannelId, epoch, true);
    const bot = await this.fetchMember(guild, botId, true);
    const creator = await this.fetchMember(guild, userId);
    this.assertCurrent(guild, epoch);

    if (
      source.type !== ChannelType.GuildVoice ||
      guild.afkChannelId === triggerChannelId ||
      creator.user.bot ||
      !this.canCopy(source, bot)
    ) {
      throw new VoiceChannelMutationError();
    }

    let created: unknown;

    try {
      created = await this.client.rest.post(Routes.guildChannels(guildId), {
        body: this.optionsFactory.create(source, creator),
      });
    } catch {
      throw new VoiceChannelMutationError();
    }

    if (
      typeof created !== "object" ||
      created === null ||
      !("id" in created) ||
      typeof created.id !== "string"
    ) {
      throw new VoiceChannelMutationError();
    }

    // Return known identity even if the connection changed while the POST was pending.
    return created.id;
  }

  /** @throws {Promise<VoiceChannelMutationError>} The guild/member is unavailable or movement failed. */
  async moveMember(guildId: string, userId: string, channelId: string): Promise<void> {
    try {
      const { guild, epoch } = this.currentGuild(guildId);
      const member = await this.fetchMember(guild, userId);
      this.assertCurrent(guild, epoch);
      await member.voice.setChannel(channelId);
    } catch {
      throw new VoiceChannelMutationError();
    }
  }

  /** @throws {Promise<VoiceChannelUnavailableError>} A reliable guild snapshot is unavailable. */
  async getChannelState(guildId: string, channelId: string): Promise<VoiceChannelState> {
    const { guild, epoch, botId } = this.currentGuild(guildId);
    let channel: GuildBasedChannel;

    try {
      channel = await this.fetchChannel(guild, channelId, epoch, false);
    } catch (error) {
      return error instanceof VoiceChannelMissingError
        ? VoiceChannelState.Missing
        : VoiceChannelState.Unknown;
    }

    if (channel.type !== ChannelType.GuildVoice) {
      return VoiceChannelState.Unknown;
    }

    try {
      const bot = await this.fetchMember(guild, botId, true);

      if (!channel.permissionsFor(bot).has(PermissionFlagsBits.ViewChannel)) {
        return VoiceChannelState.Unknown;
      }
    } catch {
      return VoiceChannelState.Unknown;
    }

    for (const voice of guild.voiceStates.cache.values()) {
      if (voice.channelId === channelId && !guild.members.cache.has(voice.id)) {
        try {
          await this.fetchMember(guild, voice.id);
        } catch {
          return VoiceChannelState.Unknown;
        }
      }
    }

    this.assertCurrent(guild, epoch);

    for (const voice of guild.voiceStates.cache.values()) {
      if (voice.channelId !== channelId) {
        continue;
      }

      const member = guild.members.cache.get(voice.id);

      if (!member) {
        return VoiceChannelState.Unknown;
      }

      if (!member.user.bot) {
        return VoiceChannelState.Occupied;
      }
    }

    return VoiceChannelState.Empty;
  }

  /** @throws {Promise<VoiceChannelMutationError>} Discord deletion failed. */
  async deleteChannel(guildId: string, channelId: string): Promise<void> {
    let guild: Guild;
    let epoch: number;

    try {
      ({ guild, epoch } = this.currentGuild(guildId));
    } catch {
      throw new VoiceChannelMutationError();
    }

    try {
      await guild.channels.delete(channelId);
    } catch (error) {
      if (
        error instanceof DiscordAPIError &&
        error.code === RESTJSONErrorCodes.UnknownChannel &&
        this.state.isCurrent(guildId, epoch)
      ) {
        return;
      }

      throw new VoiceChannelMutationError();
    }
  }

  /** @throws {VoiceChannelUnavailableError} The guild has no current available snapshot. */
  private currentGuild(guildId: string): { guild: Guild; epoch: number; botId: string } {
    const guild = this.client.guilds.cache.get(guildId);
    const epoch = this.state.getEpoch(guildId);
    const botId = this.client.user?.id;

    if (!this.client.isReady() || !guild?.available || epoch === undefined || botId === undefined) {
      throw new VoiceChannelUnavailableError();
    }

    return { guild, epoch, botId };
  }

  /** @throws {VoiceChannelUnavailableError} The available snapshot changed during an awaited read. */
  private assertCurrent(guild: Guild, epoch: number): void {
    if (!this.client.isReady() || !guild.available || !this.state.isCurrent(guild.id, epoch)) {
      throw new VoiceChannelUnavailableError();
    }
  }

  /**
   * @throws {Promise<VoiceChannelMissingError>} Direct GET confirmed absence in the current guild.
   * @throws {Promise<VoiceChannelUnavailableError>} Access or current channel data is unavailable.
   */
  private async fetchChannel(
    guild: Guild,
    channelId: string,
    epoch: number,
    force: boolean,
  ): Promise<GuildBasedChannel> {
    if (guild.channels.cache.get(channelId)?.flags.has(ChannelFlags.ChannelObfuscated)) {
      throw new VoiceChannelUnavailableError();
    }

    let channel: GuildBasedChannel | null;

    try {
      channel = await guild.channels.fetch(channelId, { force });
    } catch (error) {
      this.assertCurrent(guild, epoch);

      if (error instanceof DiscordAPIError && error.code === RESTJSONErrorCodes.UnknownChannel) {
        throw new VoiceChannelMissingError();
      }

      throw new VoiceChannelUnavailableError();
    }

    this.assertCurrent(guild, epoch);

    if (!channel || channel.flags.has(ChannelFlags.ChannelObfuscated)) {
      throw new VoiceChannelUnavailableError();
    }

    return channel;
  }

  /** @throws {Promise<VoiceChannelUnavailableError>} The guild member cannot be read. */
  private async fetchMember(guild: Guild, userId: string, force = false): Promise<GuildMember> {
    try {
      return await guild.members.fetch({ user: userId, force });
    } catch {
      throw new VoiceChannelUnavailableError();
    }
  }

  private canCopy(channel: VoiceChannel, bot: GuildMember): boolean {
    if (
      channel.flags.has(ChannelFlags.ChannelObfuscated) ||
      !channel.permissionsFor(bot).has(DiscordVoiceChannelAdapter.REQUIRED_PERMISSIONS)
    ) {
      return false;
    }

    let copied = VoiceChannelOptionsFactory.CREATOR_PERMISSIONS;

    for (const overwrite of channel.permissionOverwrites.cache.values()) {
      copied |= overwrite.allow.bitfield | overwrite.deny.bitfield;
    }

    return (
      bot.permissions.has(copied) &&
      ((copied & PermissionFlagsBits.ManageRoles) === 0n ||
        bot.permissions.has(PermissionFlagsBits.Administrator))
    );
  }
}
