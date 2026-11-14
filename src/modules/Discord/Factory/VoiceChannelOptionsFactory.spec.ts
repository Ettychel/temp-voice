import {
  ChannelFlags,
  ChannelType,
  Collection,
  OverwriteType,
  PermissionFlagsBits,
  PermissionsBitField,
  VideoQualityMode,
} from "discord.js";
import { describe, expect, it } from "vitest";
import { VoiceChannelOptionsFactory } from "./VoiceChannelOptionsFactory.js";

import type { GuildMember, VoiceChannel } from "discord.js";

describe("temporary voice channel copying policy", () => {
  it("copies compatible fields without position and merges only the three creator permissions", () => {
    const original = {
      id: "creator",
      type: OverwriteType.Member,
      allow: new PermissionsBitField(PermissionFlagsBits.Speak),
      deny: new PermissionsBitField(PermissionFlagsBits.Connect | PermissionFlagsBits.MoveMembers),
    };

    const role = {
      id: "role",
      type: OverwriteType.Role,
      allow: new PermissionsBitField(PermissionFlagsBits.Stream),
      deny: new PermissionsBitField(PermissionFlagsBits.SendMessages),
    };

    const source = {
      parentId: "category",
      position: 12,
      bitrate: 96000,
      userLimit: 7,
      rtcRegion: "rotterdam",
      videoQualityMode: VideoQualityMode.Full,
      nsfw: false,
      rateLimitPerUser: 13,
      flags: { bitfield: ChannelFlags.IsSpoilerChannel | ChannelFlags.ChannelObfuscated },
      permissionOverwrites: {
        cache: new Collection([
          [original.id, original],
          [role.id, role],
        ]),
      },
    } as unknown as VoiceChannel;

    const creator = { id: "creator", displayName: "😀".repeat(51) } as GuildMember;
    const body = new VoiceChannelOptionsFactory().create(source, creator);

    expect(body).toMatchObject({
      name: "😀".repeat(50),
      type: ChannelType.GuildVoice,
      parent_id: "category",
      bitrate: 96000,
      user_limit: 7,
      rtc_region: "rotterdam",
      video_quality_mode: VideoQualityMode.Full,
      nsfw: false,
      rate_limit_per_user: 13,
      flags: ChannelFlags.IsSpoilerChannel,
    });

    expect(body).not.toHaveProperty("position");

    expect(body.permission_overwrites).toEqual([
      {
        id: "creator",
        type: OverwriteType.Member,
        allow: (
          PermissionFlagsBits.Speak | VoiceChannelOptionsFactory.CREATOR_PERMISSIONS
        ).toString(),
        deny: PermissionFlagsBits.MoveMembers.toString(),
      },
      {
        id: "role",
        type: OverwriteType.Role,
        allow: role.allow.bitfield.toString(),
        deny: role.deny.bitfield.toString(),
      },
    ]);

    expect(original.deny.bitfield).toBe(
      PermissionFlagsBits.Connect | PermissionFlagsBits.MoveMembers,
    );

    expect(original.allow.bitfield).toBe(PermissionFlagsBits.Speak);
  });

  it("adds a missing creator overwrite without granting member moderation", () => {
    const source = {
      parentId: null,
      bitrate: 64000,
      userLimit: 0,
      rtcRegion: null,
      nsfw: false,
      flags: { bitfield: 0 },
      permissionOverwrites: { cache: new Collection() },
    } as unknown as VoiceChannel;

    const body = new VoiceChannelOptionsFactory().create(source, {
      id: "creator",
      displayName: "Name",
    } as GuildMember);

    expect(body.permission_overwrites).toEqual([
      {
        id: "creator",
        type: OverwriteType.Member,
        allow: (
          PermissionFlagsBits.ViewChannel |
          PermissionFlagsBits.Connect |
          PermissionFlagsBits.ManageChannels
        ).toString(),
        deny: "0",
      },
    ]);

    expect(body).toMatchObject({ rtc_region: null, user_limit: 0 });
  });
});
