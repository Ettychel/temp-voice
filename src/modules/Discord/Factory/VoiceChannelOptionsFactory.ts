import { Injectable } from "@nestjs/common";
import {
  ChannelFlags,
  ChannelType,
  OverwriteType,
  PermissionFlagsBits,
  VideoQualityMode,
} from "discord.js";

import type { GuildMember, RESTPostAPIGuildChannelJSONBody, VoiceChannel } from "discord.js";

@Injectable()
export class VoiceChannelOptionsFactory {
  static readonly CREATOR_PERMISSIONS =
    PermissionFlagsBits.ViewChannel |
    PermissionFlagsBits.Connect |
    PermissionFlagsBits.ManageChannels;
  private static readonly MAXIMUM_NAME_LENGTH = 100;

  create(source: VoiceChannel, creator: GuildMember): RESTPostAPIGuildChannelJSONBody {
    const permissionOverwrites = source.permissionOverwrites.cache.map((overwrite) => ({
      id: overwrite.id,
      type: overwrite.type,
      allow: overwrite.allow.bitfield,
      deny: overwrite.deny.bitfield,
    }));

    const existing = permissionOverwrites.find(
      (overwrite) => overwrite.id === creator.id && overwrite.type === OverwriteType.Member,
    );

    if (existing) {
      existing.allow |= VoiceChannelOptionsFactory.CREATOR_PERMISSIONS;
      existing.deny &= ~VoiceChannelOptionsFactory.CREATOR_PERMISSIONS;
    } else {
      permissionOverwrites.push({
        id: creator.id,
        type: OverwriteType.Member,
        allow: VoiceChannelOptionsFactory.CREATOR_PERMISSIONS,
        deny: 0n,
      });
    }

    return {
      name: this.channelName(creator.displayName),
      type: ChannelType.GuildVoice,
      parent_id: source.parentId,
      bitrate: source.bitrate,
      user_limit: source.userLimit,
      rtc_region: source.rtcRegion,
      video_quality_mode: source.videoQualityMode ?? VideoQualityMode.Auto,
      nsfw: source.nsfw,
      rate_limit_per_user: source.rateLimitPerUser ?? 0,
      flags: source.flags.bitfield & ChannelFlags.IsSpoilerChannel,
      permission_overwrites: permissionOverwrites.map((overwrite) => ({
        ...overwrite,
        allow: overwrite.allow.toString(),
        deny: overwrite.deny.toString(),
      })),
    };
  }

  private channelName(displayName: string): string {
    const characters: string[] = [];
    let length = 0;

    for (const character of displayName) {
      if (length + character.length > VoiceChannelOptionsFactory.MAXIMUM_NAME_LENGTH) {
        break;
      }

      characters.push(character);
      length += character.length;
    }

    return characters.join("");
  }
}
