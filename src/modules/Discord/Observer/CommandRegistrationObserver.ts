import { Injectable } from "@nestjs/common";
import { ApplicationCommandType, Client, Events, PermissionsBitField } from "discord.js";
import { CommandsService, On } from "necord";
import { isDeepStrictEqual } from "node:util";
import { JsonLogger } from "../../Logging/Service/JsonLogger.js";

import type { ApplicationCommandData } from "discord.js";

@Injectable()
export class CommandRegistrationObserver {
  private static readonly FAILURE_EVENT = "discord.commands.registration.failed";
  private static readonly KEY_ALIASES: Record<string, string> = {
    nameLocalizations: "name_localizations",
    descriptionLocalizations: "description_localizations",
    defaultMemberPermissions: "default_member_permissions",
    channelTypes: "channel_types",
    minValue: "min_value",
    maxValue: "max_value",
    minLength: "min_length",
    maxLength: "max_length",
    integrationTypes: "integration_types",
  };
  private static readonly FIELDS = new Set([
    "type",
    "name",
    "description",
    "name_localizations",
    "description_localizations",
    "default_member_permissions",
    "options",
    "choices",
    "value",
    "channel_types",
    "autocomplete",
    "required",
    "min_value",
    "max_value",
    "min_length",
    "max_length",
    "contexts",
    "integration_types",
    "nsfw",
  ]);

  constructor(
    private readonly client: Client,
    private readonly commands: CommandsService,
    private readonly logger: JsonLogger,
  ) {}

  /** @throws {Promise<TypeError>} Writing the safe failure diagnostic failed. */
  @On(Events.ClientReady)
  async ready(): Promise<void> {
    try {
      await this.synchronize();
    } catch {
      this.logger.error({
        event: CommandRegistrationObserver.FAILURE_EVENT,
        reason: "command-registration-failed",
      });
    }
  }

  /** @throws {Promise<Error>} Fetching or synchronizing Discord command definitions failed. */
  async synchronize(): Promise<void> {
    const manager = this.client.application!.commands;
    const existing = await manager.fetch({ withLocalizations: true });

    for (const definition of this.commands.getGlobalCommands()) {
      const desired = definition.toJSON() as ApplicationCommandData;

      const current = existing.find(
        (command) =>
          command.name === desired.name &&
          command.type === (desired.type ?? ApplicationCommandType.ChatInput),
      );

      if (current === undefined) {
        await manager.create(desired);
      } else if (
        !current.equals(desired) &&
        !isDeepStrictEqual(this.normalize(current.toJSON()), this.normalize(desired))
      ) {
        await manager.edit(current.id, desired);
      }
    }
  }

  private normalize(value: unknown, field?: string): unknown {
    if (value === undefined || value === null || value === false) {
      return undefined;
    }

    if (value instanceof PermissionsBitField) {
      return value.bitfield.toString();
    }

    if (typeof value === "bigint") {
      return value.toString();
    }

    if (Array.isArray(value)) {
      return value.length === 0 ? undefined : value.map((item) => this.normalize(item));
    }

    if (typeof value !== "object") {
      return value;
    }

    if (field === "name_localizations" || field === "description_localizations") {
      const entries = Object.entries(value)
        .filter(([, text]) => text !== null)
        .sort(([a], [b]) => a.localeCompare(b));

      return entries.length === 0 ? undefined : Object.fromEntries(entries);
    }

    const fields = Object.entries(value)
      .map(([key, item]) => {
        const name = CommandRegistrationObserver.KEY_ALIASES[key] ?? key;
        const normalized = this.normalize(item, name);

        return [name, normalized] as const;
      })
      .filter(([key, item]) => CommandRegistrationObserver.FIELDS.has(key) && item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));

    return fields.length === 0 ? undefined : Object.fromEntries(fields);
  }
}
