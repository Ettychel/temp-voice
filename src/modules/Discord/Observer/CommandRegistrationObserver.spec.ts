import {
  ApplicationCommandType,
  Collection,
  InteractionContextType,
  PermissionFlagsBits,
  PermissionsBitField,
} from "discord.js";
import { describe, expect, it, vi } from "vitest";
import { JsonLogger } from "../../Logging/Service/JsonLogger.js";
import { CommandRegistrationObserver } from "./CommandRegistrationObserver.js";

import type { Client } from "discord.js";
import type { CommandsService } from "necord";

describe("addressed command synchronization", () => {
  const setup = () => {
    const desired = {
      name: "voice",
      type: ApplicationCommandType.ChatInput,
      description: "Voice commands",
      descriptionLocalizations: { ru: "Голосовые команды" },
      defaultMemberPermissions: PermissionFlagsBits.ManageGuild,
      contexts: [InteractionContextType.Guild],
      integrationTypes: [0],
      options: [
        {
          type: 1,
          name: "watch",
          description: "Watch",
          descriptionLocalizations: { ru: "Наблюдать" },
          options: [
            {
              type: 3,
              name: "channel",
              description: "Channel",
              description_localizations: { ru: "Канал" },
              required: true,
              autocomplete: true,
            },
          ],
        },
        { type: 1, name: "list", description: "List", options: [] },
      ],
    };

    const received = {
      ...structuredClone(desired),
      id: "registered",
      version: "server-version",
      defaultMemberPermissions: new PermissionsBitField(PermissionFlagsBits.ManageGuild),
      nsfw: false,
      nameLocalizations: {},
      options: [
        structuredClone(desired.options[0]),
        { type: 1, name: "list", description: "List" },
      ],
    };

    const current = {
      id: "registered",
      name: "voice",
      type: ApplicationCommandType.ChatInput,
      equals: () => false,
      toJSON: () => received,
    };

    const cache = new Collection([["registered", current]]);

    const manager = {
      fetch: vi.fn(async () => cache),
      create: vi.fn(async (_data: unknown) => ({})),
      edit: vi.fn(async (_id: string, _data: unknown) => ({})),
    };

    const client = { application: { commands: manager } } as unknown as Client;

    const commands = {
      getGlobalCommands: () => [{ toJSON: () => desired }],
    } as unknown as CommandsService;

    return {
      desired,
      received,
      manager,
      cache,
      service: new CommandRegistrationObserver(client, commands, new JsonLogger()),
    };
  };

  it("performs no write for equivalent definitions, IDs, versions and omitted default fields", async () => {
    const context = setup();
    await context.service.synchronize();
    await context.service.synchronize();
    expect(context.manager.create).not.toHaveBeenCalled();
    expect(context.manager.edit).not.toHaveBeenCalled();
    expect(context.manager.fetch).toHaveBeenCalledWith({ withLocalizations: true });
  });

  it.each(["description", "localization", "option-localization", "context", "permission"] as const)(
    "updates only the changed command when its %s changes",
    async (field) => {
      const context = setup();

      if (field === "description") {
        context.desired.description = "New description";
      }

      if (field === "localization") {
        context.desired.descriptionLocalizations.ru = "Новое описание";
      }

      if (field === "option-localization") {
        context.desired.options[0].options![0].description_localizations.ru = "Другой канал";
      }

      if (field === "context") {
        context.desired.contexts = [InteractionContextType.BotDM];
      }

      if (field === "permission") {
        context.desired.defaultMemberPermissions = PermissionFlagsBits.Administrator;
      }

      await context.service.synchronize();
      expect(context.manager.create).not.toHaveBeenCalled();
      expect(context.manager.edit).toHaveBeenCalledExactlyOnceWith("registered", context.desired);
    },
  );

  it("creates only a missing command", async () => {
    const context = setup();
    context.cache.clear();
    await context.service.synchronize();
    expect(context.manager.create).toHaveBeenCalledExactlyOnceWith(context.desired);
    expect(context.manager.edit).not.toHaveBeenCalled();
  });
});
