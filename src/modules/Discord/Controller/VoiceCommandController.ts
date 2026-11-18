import { Injectable, UseFilters, UseGuards } from "@nestjs/common";
import {
  ApplicationIntegrationType,
  InteractionContextType,
  Locale,
  PermissionFlagsBits,
} from "discord.js";
import { Context, Options, SlashCommand, Subcommand } from "necord";
import { WatchTriggerResult } from "../../Triggers/Enum/WatchTriggerResult.js";
import { GetVoiceListHandler } from "../../Voice/Handler/GetVoiceListHandler.js";
import { UnwatchTriggerHandler } from "../../Voice/Handler/UnwatchTriggerHandler.js";
import { WatchTriggerHandler } from "../../Voice/Handler/WatchTriggerHandler.js";
import { VoiceChannelOptionsDto } from "../Dto/VoiceChannelOptionsDto.js";
import { CommandMessage } from "../Enum/CommandMessage.js";
import { DiscordCommandName } from "../Enum/DiscordCommandName.js";
import { CommandExceptionFilter } from "../Filter/CommandExceptionFilter.js";
import { VoiceCommandGuard } from "../Guard/VoiceCommandGuard.js";
import { CommandOptionsPipe } from "../Pipe/CommandOptionsPipe.js";
import { CommandListService } from "../Service/CommandListService.js";
import { CommandReplyService } from "../Service/CommandReplyService.js";
import { CommandTargetService } from "../Service/CommandTargetService.js";

import type { SlashCommandContext } from "necord";
import type { OperationAdmissionClosedError } from "../../Core/Operation/Error/OperationAdmissionClosedError.js";
import type { OperationReentryError } from "../../Core/Operation/Error/OperationReentryError.js";
import type { DatabaseOperationError } from "../../Infrastructure/Database/Error/DatabaseOperationError.js";
import type { InvalidTriggerChannelError } from "../../Triggers/Error/InvalidTriggerChannelError.js";
import type { TriggerPermissionsError } from "../../Triggers/Error/TriggerPermissionsError.js";
import type { VoiceChannelUnavailableError } from "../../Voice/Error/VoiceChannelUnavailableError.js";
import type { InvalidCommandTargetError } from "../Error/InvalidCommandTargetError.js";

@Injectable()
@SlashCommand({
  name: DiscordCommandName.Voice,
  description: "Manage voice triggers",
  descriptionLocalizations: { [Locale.Russian]: "Управление голосовыми триггерами" },
  integrationTypes: [ApplicationIntegrationType.GuildInstall],
  contexts: [InteractionContextType.Guild],
  defaultMemberPermissions: PermissionFlagsBits.ManageGuild,
  nsfw: false,
})
@UseGuards(VoiceCommandGuard)
@UseFilters(CommandExceptionFilter)
export class VoiceCommandController {
  constructor(
    private readonly watchTrigger: WatchTriggerHandler,
    private readonly unwatchTrigger: UnwatchTriggerHandler,
    private readonly getList: GetVoiceListHandler,
    private readonly lists: CommandListService,
    private readonly replies: CommandReplyService,
    private readonly targets: CommandTargetService,
  ) {}

  /**
   * @throws {Promise<InvalidCommandTargetError>} The supplied guild or channel ID is invalid.
   * @throws {Promise<InvalidTriggerChannelError>} The channel cannot be configured as a trigger.
   * @throws {Promise<TriggerPermissionsError>} The bot lacks the required channel permissions.
   * @throws {Promise<VoiceChannelUnavailableError>} Current guild or channel facts are unavailable.
   * @throws {Promise<DatabaseOperationError>} The storage operation failed.
   * @throws {Promise<OperationReentryError>} The guild or database queue was reentered.
   * @throws {Promise<OperationAdmissionClosedError>} The application stopped accepting work.
   * @throws {Promise<unknown>} Discord acknowledgment, formatting or reply failed.
   */
  @Subcommand({
    name: DiscordCommandName.Watch,
    description: "Register a voice trigger",
    descriptionLocalizations: { [Locale.Russian]: "Зарегистрировать голосовой триггер" },
  })
  async watch(
    @Context() [interaction]: SlashCommandContext,
    @Options(CommandOptionsPipe) options: VoiceChannelOptionsDto,
  ): Promise<void> {
    await this.replies.defer(interaction);
    this.targets.channel(interaction.guildId!, options.channel.id);
    const result = await this.watchTrigger.handle(interaction.guildId!, options.channel.id);

    await this.replies.send(
      interaction,
      this.replies.text(
        interaction.locale,
        result === WatchTriggerResult.AlreadyActive
          ? CommandMessage.AlreadyWatched
          : CommandMessage.Watched,
      ),
    );
  }

  /**
   * @throws {Promise<InvalidCommandTargetError>} The supplied guild or channel ID is invalid.
   * @throws {Promise<VoiceChannelUnavailableError>} Current guild or channel facts are unavailable.
   * @throws {Promise<DatabaseOperationError>} The storage operation failed.
   * @throws {Promise<OperationReentryError>} The guild or database queue was reentered.
   * @throws {Promise<OperationAdmissionClosedError>} The application stopped accepting work.
   * @throws {Promise<unknown>} Discord acknowledgment, formatting or reply failed.
   */
  @Subcommand({
    name: DiscordCommandName.Unwatch,
    description: "Disable observation of a voice trigger",
    descriptionLocalizations: { [Locale.Russian]: "Отключить наблюдение за голосовым триггером" },
  })
  async unwatch(
    @Context() [interaction]: SlashCommandContext,
    @Options(CommandOptionsPipe) options: VoiceChannelOptionsDto,
  ): Promise<void> {
    await this.replies.defer(interaction);
    this.targets.channel(interaction.guildId!, options.channel.id);
    await this.unwatchTrigger.handle(interaction.guildId!, options.channel.id);

    await this.replies.send(
      interaction,
      this.replies.text(interaction.locale, CommandMessage.Unwatched),
    );
  }

  /**
   * @throws {Promise<InvalidCommandTargetError>} The supplied guild or channel ID is invalid.
   * @throws {Promise<VoiceChannelUnavailableError>} Current guild or channel facts are unavailable.
   * @throws {Promise<DatabaseOperationError>} The storage operation failed.
   * @throws {Promise<OperationReentryError>} The guild or database queue was reentered.
   * @throws {Promise<unknown>} Discord acknowledgment, formatting or reply failed.
   */
  @Subcommand({
    name: DiscordCommandName.List,
    description: "List voice triggers and rooms",
    descriptionLocalizations: { [Locale.Russian]: "Показать голосовые триггеры и комнаты" },
  })
  async list(@Context() [interaction]: SlashCommandContext): Promise<void> {
    await this.replies.defer(interaction);
    this.targets.guild(interaction.guildId!);
    const data = await this.getList.handle(interaction.guildId!);
    await this.lists.show(interaction, interaction.guildId!, false, data);
  }
}
