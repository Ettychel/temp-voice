import { Injectable } from "@nestjs/common";
import { ChannelFlags, ChannelType, Client } from "discord.js";
import { InvalidCommandTargetError } from "../Error/InvalidCommandTargetError.js";

import type { Guild, VoiceChannel } from "discord.js";

@Injectable()
export class CommandTargetService {
  private static readonly SNOWFLAKE = /^\d{1,20}$/;
  constructor(private readonly client: Client) {}

  /** @throws {InvalidCommandTargetError} The bot is not connected to the selected available guild. */
  guild(guildId: string): Guild {
    const guild = this.client.guilds.cache.get(guildId);

    if (
      !CommandTargetService.SNOWFLAKE.test(guildId) ||
      !this.client.isReady() ||
      !guild?.available
    ) {
      throw new InvalidCommandTargetError();
    }

    return guild;
  }

  /** @throws {InvalidCommandTargetError} The selected channel is not an available voice channel in this guild. */
  channel(guildId: string, channelId: string): VoiceChannel {
    const channel = this.guild(guildId).channels.cache.get(channelId);

    if (
      !CommandTargetService.SNOWFLAKE.test(channelId) ||
      channel?.type !== ChannelType.GuildVoice ||
      channel.guildId !== guildId ||
      channel.flags.has(ChannelFlags.ChannelObfuscated)
    ) {
      throw new InvalidCommandTargetError();
    }

    return channel;
  }
}
