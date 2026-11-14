import {
  ChannelFlags,
  ChannelFlagsBitField,
  ChannelType,
  Collection,
  DiscordAPIError,
  OverwriteType,
  PermissionFlagsBits,
  PermissionsBitField,
  RESTJSONErrorCodes,
} from "discord.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VoiceChannelState } from "../../Voice/Enum/VoiceChannelState.js";
import { VoiceChannelMutationError } from "../../Voice/Error/VoiceChannelMutationError.js";
import { VoiceChannelOptionsFactory } from "../Factory/VoiceChannelOptionsFactory.js";
import { DiscordGuildStateService } from "../Service/DiscordGuildStateService.js";
import { DiscordVoiceChannelAdapter } from "./DiscordVoiceChannelAdapter.js";

import type { Client, GuildMember } from "discord.js";

describe("Discord safety policies with network substituted", () => {
  const state = new DiscordGuildStateService();

  const bot = {
    id: "bot",
    user: { bot: true },
    permissions: new PermissionsBitField(PermissionsBitField.All),
  };

  const human = { id: "human", user: { bot: false }, displayName: "Human" } as GuildMember;

  const channel = {
    id: "room",
    type: ChannelType.GuildVoice,
    flags: new ChannelFlagsBitField(),
    parentId: null,
    bitrate: 64000,
    userLimit: 0,
    rtcRegion: null,
    nsfw: false,
    permissionsFor: vi.fn(() => new PermissionsBitField(PermissionsBitField.All)),
    permissionOverwrites: {
      cache: new Collection<
        string,
        { id: string; type: OverwriteType; allow: PermissionsBitField; deny: PermissionsBitField }
      >(),
    },
  };

  const guild = {
    id: "guild",
    available: true,
    afkChannelId: null,
    channels: {
      cache: new Collection([["room", channel]]),
      fetch: vi.fn(async () => channel),
      delete: vi.fn(async () => {}),
    },
    members: {
      cache: new Collection<string, GuildMember>(),
      fetch: vi.fn(async ({ user }: { user: string }) => {
        const member = guild.members.cache.get(user);

        if (!member) {
          throw new Error("Unknown member");
        }

        return member;
      }),
    },
    voiceStates: { cache: new Collection<string, { id: string; channelId: string }>() },
  };

  const client = {
    isReady: () => true,
    user: { id: "bot" },
    guilds: { cache: new Collection([["guild", guild]]) },
    rest: { post: vi.fn(async () => ({ id: "created" })) },
  };

  const adapter = new DiscordVoiceChannelAdapter(
    client as unknown as Client,
    state,
    new VoiceChannelOptionsFactory(),
  );

  const apiError = (code: RESTJSONErrorCodes, status: number) =>
    new DiscordAPIError(
      { code, message: "SDK error" },
      code,
      status,
      "GET",
      "https://discord.test",
      {},
    );

  beforeEach(() => {
    vi.clearAllMocks();
    state.invalidate("guild");
    state.markAvailable("guild");
    channel.flags = new ChannelFlagsBitField();
    channel.permissionOverwrites.cache.clear();
    channel.permissionsFor.mockReturnValue(new PermissionsBitField(PermissionsBitField.All));
    bot.permissions = new PermissionsBitField(PermissionsBitField.All);
    guild.members.cache.clear();
    guild.members.cache.set("bot", bot as GuildMember).set("human", human);
    guild.voiceStates.cache.clear();
    guild.channels.fetch.mockResolvedValue(channel);
    client.rest.post.mockResolvedValue({ id: "created" });
  });

  it("ignores bots but preserves channels occupied by ordinary users", async () => {
    guild.voiceStates.cache.set("bot", { id: "bot", channelId: "room" });
    expect(await adapter.getChannelState("guild", "room")).toBe(VoiceChannelState.Empty);
    guild.voiceStates.cache.set("human", { id: "human", channelId: "room" });
    expect(await adapter.getChannelState("guild", "room")).toBe(VoiceChannelState.Occupied);
  });

  it("does not infer emptiness when a participant identity or channel access is unavailable", async () => {
    guild.voiceStates.cache.set("unknown", { id: "unknown", channelId: "room" });
    expect(await adapter.getChannelState("guild", "room")).toBe(VoiceChannelState.Unknown);
    guild.voiceStates.cache.clear();
    channel.permissionsFor.mockReturnValue(new PermissionsBitField());
    expect(await adapter.getChannelState("guild", "room")).toBe(VoiceChannelState.Unknown);
    channel.flags = new ChannelFlagsBitField(ChannelFlags.ChannelObfuscated);
    expect(await adapter.getChannelState("guild", "room")).toBe(VoiceChannelState.Unknown);
  });

  it("requires a direct absence response in the same available generation", async () => {
    guild.channels.fetch.mockRejectedValueOnce(apiError(RESTJSONErrorCodes.UnknownChannel, 404));
    expect(await adapter.getChannelState("guild", "room")).toBe(VoiceChannelState.Missing);
    guild.channels.fetch.mockRejectedValueOnce(apiError(RESTJSONErrorCodes.MissingAccess, 403));
    expect(await adapter.getChannelState("guild", "room")).toBe(VoiceChannelState.Unknown);

    guild.channels.fetch.mockImplementationOnce(async () => {
      state.invalidate("guild");
      throw apiError(RESTJSONErrorCodes.UnknownChannel, 404);
    });

    expect(await adapter.getChannelState("guild", "room")).toBe(VoiceChannelState.Unknown);
  });

  it("rescans voice states after awaited member reads", async () => {
    guild.members.fetch.mockImplementationOnce(async () => {
      guild.voiceStates.cache.set("human", { id: "human", channelId: "room" });

      return bot as GuildMember;
    });

    expect(await adapter.getChannelState("guild", "room")).toBe(VoiceChannelState.Occupied);
  });

  it("returns a known created ID even if connectivity changes during POST", async () => {
    client.rest.post.mockImplementationOnce(async () => {
      state.invalidate("guild");

      return { id: "known-room" };
    });

    expect(await adapter.createChannel("guild", "room", "human")).toBe("known-room");
    expect(client.rest.post).toHaveBeenCalledTimes(1);
  });

  it("rejects copying overwrites the bot cannot reproduce", async () => {
    bot.permissions = new PermissionsBitField(
      PermissionFlagsBits.ViewChannel |
        PermissionFlagsBits.ManageChannels |
        PermissionFlagsBits.Connect |
        PermissionFlagsBits.MoveMembers,
    );

    channel.permissionOverwrites.cache.set("role", {
      id: "role",
      type: OverwriteType.Role,
      allow: new PermissionsBitField(),
      deny: new PermissionsBitField(PermissionFlagsBits.ManageRoles),
    });

    await expect(adapter.createChannel("guild", "room", "human")).rejects.toBeInstanceOf(
      VoiceChannelMutationError,
    );

    bot.permissions.add(PermissionFlagsBits.ManageRoles);

    await expect(adapter.createChannel("guild", "room", "human")).rejects.toBeInstanceOf(
      VoiceChannelMutationError,
    );

    expect(client.rest.post).not.toHaveBeenCalled();
  });
});
