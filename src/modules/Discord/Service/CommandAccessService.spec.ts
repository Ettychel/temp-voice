import {
  ChannelFlagsBitField,
  ChannelType,
  Collection,
  InteractionContextType,
  Locale,
  PermissionFlagsBits,
  PermissionsBitField,
} from "discord.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { JsonLogger } from "../../Logging/Service/JsonLogger.js";
import { OwnerAccessDeniedError } from "../../Ownership/Error/OwnerAccessDeniedError.js";
import { VoiceChannelOptionsDto } from "../Dto/VoiceChannelOptionsDto.js";
import { CommandAccessError } from "../Error/CommandAccessError.js";
import { InvalidCommandTargetError } from "../Error/InvalidCommandTargetError.js";
import { CommandExceptionFilter } from "../Filter/CommandExceptionFilter.js";
import { OwnerCommandGuard } from "../Guard/OwnerCommandGuard.js";
import { VoiceCommandGuard } from "../Guard/VoiceCommandGuard.js";
import { OwnerAutocompleteInterceptor } from "../Interceptor/OwnerAutocompleteInterceptor.js";
import { CommandOptionsPipe } from "../Pipe/CommandOptionsPipe.js";
import { CommandReplyService } from "./CommandReplyService.js";
import { CommandTargetService } from "./CommandTargetService.js";

import type { ArgumentsHost, ExecutionContext } from "@nestjs/common";
import type { AutocompleteInteraction, Client, Guild, VoiceChannel } from "discord.js";
import type { OwnershipService } from "../../Ownership/Service/OwnershipService.js";

describe("command access and autocomplete without network", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  const setup = () => {
    const guildId = "111111111111111111";
    const channelId = "222222222222222222";

    const channel = {
      id: channelId,
      guildId,
      name: "Voice room",
      type: ChannelType.GuildVoice,
      flags: new ChannelFlagsBitField(),
    } as VoiceChannel;

    const guild = {
      id: guildId,
      name: "Server",
      available: true,
      channels: { cache: new Collection([[channelId, channel]]) },
    } as Guild;

    const client = {
      isReady: () => true,
      guilds: { cache: new Collection([[guildId, guild]]) },
    } as unknown as Client;

    const ownership = { assertOwner: vi.fn(async (_userId: string) => {}) };
    const targets = new CommandTargetService(client);

    const autocomplete = new OwnerAutocompleteInterceptor(
      client,
      ownership as unknown as OwnershipService,
      targets,
    );

    return { guildId, channelId, guild, client, ownership, targets, autocomplete };
  };

  const interaction = (name = "guild", query = "", guildId: string | null = null) => ({
    user: { id: "caller" },
    options: { getFocused: () => ({ name, value: query }), getString: () => guildId },
    respond: vi.fn(async (_choices: unknown) => {}),
  });

  it("creates an options DTO while preserving the selected SDK channel by reference", () => {
    const context = setup();
    const channel = context.guild.channels.cache.get(context.channelId)!;

    const options = new CommandOptionsPipe().transform(
      { channel },
      { type: "custom", metatype: VoiceChannelOptionsDto },
    ) as VoiceChannelOptionsDto;

    expect(options).toBeInstanceOf(VoiceChannelOptionsDto);
    expect(options.channel).toBe(channel);
  });

  it("returns no server or channel names to a non-owner", async () => {
    const context = setup();
    context.ownership.assertOwner.mockRejectedValueOnce(new OwnerAccessDeniedError());
    const request = interaction();
    await context.autocomplete.transformOptions(request as unknown as AutocompleteInteraction);
    expect(request.respond).toHaveBeenCalledWith([]);
  });

  it("filters autocomplete by names and IDs and caps responses at 25 choices", async () => {
    const context = setup();

    for (let index = 0; index < 40; index++) {
      const id = String(300000000000000000n + BigInt(index));

      context.client.guilds.cache.set(id, {
        ...context.guild,
        id,
        name: "Test Server " + index,
      } as Guild);
    }

    const request = interaction("guild", "Test");
    await context.autocomplete.transformOptions(request as unknown as AutocompleteInteraction);
    const choices = request.respond.mock.calls[0][0] as { name: string; value: string }[];
    expect(choices).toHaveLength(25);

    expect(
      choices.every((choice) => choice.name.includes("Test Server") && choice.name.length <= 100),
    ).toBe(true);

    const channelRequest = interaction("channel", context.channelId, context.guildId);

    await context.autocomplete.transformOptions(
      channelRequest as unknown as AutocompleteInteraction,
    );

    expect(channelRequest.respond).toHaveBeenCalledWith([
      { name: "Voice room (222222222222222222)", value: context.channelId },
    ]);
  });

  it("rejects manually supplied foreign IDs and unsuitable channel types", () => {
    const context = setup();
    expect(() => context.targets.guild("999999999999999999")).toThrow(InvalidCommandTargetError);

    expect(() => context.targets.channel(context.guildId, "999999999999999999")).toThrow(
      InvalidCommandTargetError,
    );

    context.guild.channels.cache.set(context.channelId, {
      id: context.channelId,
      guildId: "other",
      type: ChannelType.GuildVoice,
    } as VoiceChannel);

    expect(() => context.targets.channel(context.guildId, context.channelId)).toThrow(
      InvalidCommandTargetError,
    );

    context.guild.channels.cache.set(context.channelId, {
      id: context.channelId,
      guildId: context.guildId,
      type: ChannelType.GuildStageVoice,
    } as unknown as VoiceChannel);

    expect(() => context.targets.channel(context.guildId, context.channelId)).toThrow(
      InvalidCommandTargetError,
    );
  });

  it("returns an empty autocomplete result when authorization cannot finish in time", async () => {
    vi.useFakeTimers();
    const context = setup();
    context.ownership.assertOwner.mockImplementationOnce(() => new Promise<void>(() => {}));
    const request = interaction();

    const result = context.autocomplete.transformOptions(
      request as unknown as AutocompleteInteraction,
    );

    await vi.advanceTimersByTimeAsync(2000);
    await result;
    expect(request.respond).toHaveBeenCalledWith([]);
  });

  it("requires ManageGuild in a guild for voice commands and BotDM for owner commands", () => {
    const request = {
      inGuild: () => true,
      memberPermissions: new PermissionsBitField(),
      context: InteractionContextType.Guild,
    };

    const context = {
      getArgs: () => [[request]],
      getType: () => "necord",
      getClass: () => VoiceCommandGuard,
      getHandler: () => VoiceCommandGuard.prototype.canActivate,
    } as unknown as ExecutionContext;

    expect(() => new VoiceCommandGuard().canActivate(context)).toThrow(CommandAccessError);
    request.memberPermissions = new PermissionsBitField(PermissionFlagsBits.ManageGuild);
    expect(new VoiceCommandGuard().canActivate(context)).toBe(true);
    expect(() => new OwnerCommandGuard().canActivate(context)).toThrow(CommandAccessError);
    request.context = InteractionContextType.BotDM;
    expect(new OwnerCommandGuard().canActivate(context)).toBe(true);
  });

  it("does not expose database or code details in public failures or diagnostics", async () => {
    const logger = new JsonLogger();
    const log = vi.spyOn(logger, "error").mockImplementation(() => {});

    const request = {
      user: { id: "user" },
      locale: Locale.EnglishUS,
      deferred: true,
      replied: false,
      isAutocomplete: () => false,
      editReply: vi.fn(async (_message: unknown) => ({})),
    };

    const host = {
      getArgs: () => [[request]],
      getType: () => "necord",
    } as unknown as ArgumentsHost;

    await new CommandExceptionFilter(new CommandReplyService(), logger).catch(
      new Error("SQL secret=do-not-publish-code"),
      host,
    );

    expect(request.editReply).toHaveBeenCalledWith(
      expect.objectContaining({ content: "The operation failed. Please try again later." }),
    );

    expect(JSON.stringify(log.mock.calls)).not.toContain("do-not-publish");
  });
});
