import { Catch, Injectable } from "@nestjs/common";
import { NecordArgumentsHost } from "necord";
import { InvalidChannelLimitError } from "../../Limits/Error/InvalidChannelLimitError.js";
import { JsonLogger } from "../../Logging/Service/JsonLogger.js";
import { OwnerAccessDeniedError } from "../../Ownership/Error/OwnerAccessDeniedError.js";
import { OwnershipConflictError } from "../../Ownership/Error/OwnershipConflictError.js";
import { InvalidTriggerChannelError } from "../../Triggers/Error/InvalidTriggerChannelError.js";
import { TriggerPermissionsError } from "../../Triggers/Error/TriggerPermissionsError.js";
import { VoiceChannelUnavailableError } from "../../Voice/Error/VoiceChannelUnavailableError.js";
import { CommandMessage } from "../Enum/CommandMessage.js";
import { CommandAccessError } from "../Error/CommandAccessError.js";
import { InvalidCommandTargetError } from "../Error/InvalidCommandTargetError.js";
import { CommandReplyService } from "../Service/CommandReplyService.js";

import type { ArgumentsHost, ExceptionFilter } from "@nestjs/common";
import type {
  AutocompleteInteraction,
  ButtonInteraction,
  ChatInputCommandInteraction,
} from "discord.js";

@Injectable()
@Catch()
export class CommandExceptionFilter implements ExceptionFilter {
  private static readonly FAILURE_EVENT = "discord.command.failed";
  constructor(
    private readonly replies: CommandReplyService,
    private readonly logger: JsonLogger,
  ) {}

  /**
   * @throws {Promise<TypeError>} Writing a safe diagnostic failed.
   * @throws {Promise<Error>} Formatting or sending an error response failed.
   */
  async catch(error: unknown, host: ArgumentsHost): Promise<void> {
    const [interaction] =
      NecordArgumentsHost.create(host).getContext<
        [ChatInputCommandInteraction | ButtonInteraction | AutocompleteInteraction]
      >();

    if (interaction.isAutocomplete()) {
      if (!interaction.responded) {
        await interaction.respond([]);
      }

      return;
    }

    let key = CommandMessage.Technical;

    if (error instanceof CommandAccessError || error instanceof OwnerAccessDeniedError) {
      key = CommandMessage.Denied;
    } else if (
      error instanceof InvalidCommandTargetError ||
      error instanceof VoiceChannelUnavailableError
    ) {
      key = CommandMessage.InvalidTarget;
    } else if (error instanceof InvalidTriggerChannelError) {
      key = CommandMessage.InvalidChannel;
    } else if (error instanceof TriggerPermissionsError) {
      key = CommandMessage.BotPermissions;
    } else if (error instanceof InvalidChannelLimitError) {
      key = CommandMessage.InvalidLimit;
    } else if (error instanceof OwnershipConflictError) {
      key = CommandMessage.Conflict;
    } else {
      this.logger.error({
        event: CommandExceptionFilter.FAILURE_EVENT,
        userId: interaction.user.id,
        reason: "unexpected-command-error",
      });
    }

    await this.replies.send(interaction, this.replies.text(interaction.locale, key));
  }
}
