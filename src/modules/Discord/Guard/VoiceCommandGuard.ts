import { Injectable } from "@nestjs/common";
import { PermissionFlagsBits } from "discord.js";
import { NecordExecutionContext } from "necord";
import { CommandAccessError } from "../Error/CommandAccessError.js";

import type { CanActivate, ExecutionContext } from "@nestjs/common";
import type { ChatInputCommandInteraction } from "discord.js";

@Injectable()
export class VoiceCommandGuard implements CanActivate {
  /** @throws {CommandAccessError} The command requires ManageGuild in a guild. */
  canActivate(context: ExecutionContext): boolean {
    const [interaction] =
      NecordExecutionContext.create(context).getContext<[ChatInputCommandInteraction]>();

    if (
      !interaction.inGuild() ||
      !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
    ) {
      throw new CommandAccessError();
    }

    return true;
  }
}
