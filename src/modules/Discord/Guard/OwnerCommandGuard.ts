import { Injectable } from "@nestjs/common";
import { InteractionContextType } from "discord.js";
import { NecordExecutionContext } from "necord";
import { CommandAccessError } from "../Error/CommandAccessError.js";

import type { CanActivate, ExecutionContext } from "@nestjs/common";
import type { AutocompleteInteraction, ChatInputCommandInteraction } from "discord.js";

@Injectable()
export class OwnerCommandGuard implements CanActivate {
  /** @throws {CommandAccessError} Owner commands are only available in the bot's DM. */
  canActivate(context: ExecutionContext): boolean {
    const [interaction] =
      NecordExecutionContext.create(context).getContext<
        [ChatInputCommandInteraction | AutocompleteInteraction]
      >();

    if (interaction.context !== InteractionContextType.BotDM) {
      throw new CommandAccessError();
    }

    return true;
  }
}
