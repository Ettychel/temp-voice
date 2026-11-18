import { Injectable, UseFilters, UseGuards, UseInterceptors } from "@nestjs/common";
import { ApplicationIntegrationType, InteractionContextType, Locale } from "discord.js";
import { Context, Options, SlashCommand, Subcommand } from "necord";
import { ClaimResult } from "../../Ownership/Enum/ClaimResult.js";
import { OwnershipService } from "../../Ownership/Service/OwnershipService.js";
import { WatchTriggerResult } from "../../Triggers/Enum/WatchTriggerResult.js";
import { GetVoiceListHandler } from "../../Voice/Handler/GetVoiceListHandler.js";
import { SetChannelLimitHandler } from "../../Voice/Handler/SetChannelLimitHandler.js";
import { UnwatchTriggerHandler } from "../../Voice/Handler/UnwatchTriggerHandler.js";
import { WatchTriggerHandler } from "../../Voice/Handler/WatchTriggerHandler.js";
import { ClaimCodeOptionsDto } from "../Dto/ClaimCodeOptionsDto.js";
import { OwnerChannelOptionsDto } from "../Dto/OwnerChannelOptionsDto.js";
import { OwnerGuildOptionsDto } from "../Dto/OwnerGuildOptionsDto.js";
import { OwnerLimitOptionsDto } from "../Dto/OwnerLimitOptionsDto.js";
import { CommandMessage } from "../Enum/CommandMessage.js";
import { DiscordCommandName } from "../Enum/DiscordCommandName.js";
import { CommandExceptionFilter } from "../Filter/CommandExceptionFilter.js";
import { OwnerCommandGuard } from "../Guard/OwnerCommandGuard.js";
import { OwnerAutocompleteInterceptor } from "../Interceptor/OwnerAutocompleteInterceptor.js";
import { CommandOptionsPipe } from "../Pipe/CommandOptionsPipe.js";
import { CommandListService } from "../Service/CommandListService.js";
import { CommandReplyService } from "../Service/CommandReplyService.js";
import { CommandTargetService } from "../Service/CommandTargetService.js";

import type { SlashCommandContext } from "necord";
import type { OperationAdmissionClosedError } from "../../Core/Operation/Error/OperationAdmissionClosedError.js";
import type { OperationReentryError } from "../../Core/Operation/Error/OperationReentryError.js";
import type { DatabaseOperationError } from "../../Infrastructure/Database/Error/DatabaseOperationError.js";
import type { InvalidChannelLimitError } from "../../Limits/Error/InvalidChannelLimitError.js";
import type { OwnerAccessDeniedError } from "../../Ownership/Error/OwnerAccessDeniedError.js";
import type { OwnershipConflictError } from "../../Ownership/Error/OwnershipConflictError.js";
import type { InvalidTriggerChannelError } from "../../Triggers/Error/InvalidTriggerChannelError.js";
import type { TriggerPermissionsError } from "../../Triggers/Error/TriggerPermissionsError.js";
import type { VoiceChannelUnavailableError } from "../../Voice/Error/VoiceChannelUnavailableError.js";
import type { InvalidCommandTargetError } from "../Error/InvalidCommandTargetError.js";

@Injectable()
@SlashCommand({
  name: DiscordCommandName.Owner,
  description: "Manage bot ownership and server limits",
  descriptionLocalizations: { [Locale.Russian]: "Владение ботом и управление лимитами серверов" },
  integrationTypes: [ApplicationIntegrationType.GuildInstall],
  contexts: [InteractionContextType.BotDM],
  defaultMemberPermissions: null,
  nsfw: false,
})
@UseGuards(OwnerCommandGuard)
@UseInterceptors(OwnerAutocompleteInterceptor)
@UseFilters(CommandExceptionFilter)
export class OwnerCommandController {
  constructor(
    private readonly ownership: OwnershipService,
    private readonly watchTrigger: WatchTriggerHandler,
    private readonly unwatchTrigger: UnwatchTriggerHandler,
    private readonly setLimit: SetChannelLimitHandler,
    private readonly getList: GetVoiceListHandler,
    private readonly lists: CommandListService,
    private readonly replies: CommandReplyService,
    private readonly targets: CommandTargetService,
  ) {}

  /**
   * @throws {Promise<DatabaseOperationError>} The storage operation failed.
   * @throws {Promise<OperationReentryError>} The guild or database queue was reentered.
   * @throws {Promise<OwnershipConflictError>} Ownership or the code changed before persistence.
   * @throws {Promise<unknown>} Discord acknowledgment, formatting or reply failed.
   */
  @Subcommand({
    name: DiscordCommandName.Claim,
    description: "Activate an ownership code",
    descriptionLocalizations: { [Locale.Russian]: "Активировать код владения" },
  })
  async claim(
    @Context() [interaction]: SlashCommandContext,
    @Options(CommandOptionsPipe) options: ClaimCodeOptionsDto,
  ): Promise<void> {
    await this.replies.defer(interaction);
    const result = await this.ownership.claim(interaction.user.id, options.code);

    const key =
      result.result === ClaimResult.Claimed
        ? CommandMessage.Claimed
        : result.result === ClaimResult.Blocked
          ? CommandMessage.Blocked
          : CommandMessage.InvalidCode;

    await this.replies.send(
      interaction,
      this.replies.text(interaction.locale, key, {
        until: Math.ceil((result.blockedUntil ?? 0) / 1000),
      }),
    );
  }

  /**
   * @throws {Promise<OwnerAccessDeniedError>} The caller is no longer the owner.
   * @throws {Promise<DatabaseOperationError>} The storage operation failed.
   * @throws {Promise<OperationReentryError>} The guild or database queue was reentered.
   * @throws {Promise<OwnershipConflictError>} Ownership or the code changed before persistence.
   * @throws {Promise<unknown>} Discord acknowledgment, formatting or reply failed.
   */
  @Subcommand({
    name: DiscordCommandName.Transfer,
    description: "Create a 24-hour ownership transfer code",
    descriptionLocalizations: { [Locale.Russian]: "Создать код передачи владения на 24 часа" },
  })
  async transfer(@Context() [interaction]: SlashCommandContext): Promise<void> {
    await this.replies.defer(interaction);
    const code = await this.ownership.transfer(interaction.user.id);

    await this.replies.send(
      interaction,
      this.replies.text(interaction.locale, CommandMessage.Transfer, { code }),
    );
  }

  /**
   * @throws {Promise<InvalidCommandTargetError>} The supplied guild or channel ID is invalid.
   * @throws {Promise<OwnerAccessDeniedError>} The caller is no longer the owner.
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
    description: "Register a voice trigger on a server",
    descriptionLocalizations: { [Locale.Russian]: "Зарегистрировать голосовой триггер на сервере" },
  })
  async watch(
    @Context() [interaction]: SlashCommandContext,
    @Options(CommandOptionsPipe) options: OwnerChannelOptionsDto,
  ): Promise<void> {
    await this.replies.defer(interaction);
    await this.ownership.assertOwner(interaction.user.id);
    this.targets.channel(options.guild, options.channel);

    const result = await this.watchTrigger.handle(options.guild, options.channel);

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
   * @throws {Promise<OwnerAccessDeniedError>} The caller is no longer the owner.
   * @throws {Promise<VoiceChannelUnavailableError>} Current guild or channel facts are unavailable.
   * @throws {Promise<DatabaseOperationError>} The storage operation failed.
   * @throws {Promise<OperationReentryError>} The guild or database queue was reentered.
   * @throws {Promise<OperationAdmissionClosedError>} The application stopped accepting work.
   * @throws {Promise<unknown>} Discord acknowledgment, formatting or reply failed.
   */
  @Subcommand({
    name: DiscordCommandName.Unwatch,
    description: "Disable a voice trigger on a server",
    descriptionLocalizations: { [Locale.Russian]: "Отключить голосовой триггер на сервере" },
  })
  async unwatch(
    @Context() [interaction]: SlashCommandContext,
    @Options(CommandOptionsPipe) options: OwnerChannelOptionsDto,
  ): Promise<void> {
    await this.replies.defer(interaction);
    await this.ownership.assertOwner(interaction.user.id);
    this.targets.channel(options.guild, options.channel);
    await this.unwatchTrigger.handle(options.guild, options.channel);

    await this.replies.send(
      interaction,
      this.replies.text(interaction.locale, CommandMessage.Unwatched),
    );
  }

  /**
   * @throws {Promise<InvalidCommandTargetError>} The supplied guild or channel ID is invalid.
   * @throws {Promise<OwnerAccessDeniedError>} The caller is no longer the owner.
   * @throws {Promise<VoiceChannelUnavailableError>} Current guild or channel facts are unavailable.
   * @throws {Promise<DatabaseOperationError>} The storage operation failed.
   * @throws {Promise<OperationReentryError>} The guild or database queue was reentered.
   * @throws {Promise<unknown>} Discord acknowledgment, formatting or reply failed.
   */
  @Subcommand({
    name: DiscordCommandName.List,
    description: "List server triggers, rooms and limits",
    descriptionLocalizations: { [Locale.Russian]: "Показать триггеры, комнаты и лимиты сервера" },
  })
  async list(
    @Context() [interaction]: SlashCommandContext,
    @Options(CommandOptionsPipe) options: OwnerGuildOptionsDto,
  ): Promise<void> {
    await this.replies.defer(interaction);
    await this.ownership.assertOwner(interaction.user.id);
    this.targets.guild(options.guild);
    const data = await this.getList.handle(options.guild, true);
    await this.lists.show(interaction, options.guild, true, data);
  }

  /**
   * @throws {Promise<InvalidCommandTargetError>} The supplied guild or channel ID is invalid.
   * @throws {Promise<OwnerAccessDeniedError>} The caller is no longer the owner.
   * @throws {Promise<InvalidChannelLimitError>} The requested limit is invalid.
   * @throws {Promise<InvalidTriggerChannelError>} The channel cannot be configured as a trigger.
   * @throws {Promise<VoiceChannelUnavailableError>} Current guild or channel facts are unavailable.
   * @throws {Promise<DatabaseOperationError>} The storage operation failed.
   * @throws {Promise<OperationReentryError>} The guild or database queue was reentered.
   * @throws {Promise<OperationAdmissionClosedError>} The application stopped accepting work.
   * @throws {Promise<unknown>} Discord acknowledgment, formatting or reply failed.
   */
  @Subcommand({
    name: DiscordCommandName.Limit,
    description: "Set a server or trigger room limit",
    descriptionLocalizations: { [Locale.Russian]: "Установить лимит комнат сервера или триггера" },
  })
  async limit(
    @Context() [interaction]: SlashCommandContext,
    @Options(CommandOptionsPipe) options: OwnerLimitOptionsDto,
  ): Promise<void> {
    await this.replies.defer(interaction);
    await this.ownership.assertOwner(interaction.user.id);
    this.targets.guild(options.guild);

    if (options.channel !== null) {
      this.targets.channel(options.guild, options.channel);
    }

    await this.setLimit.handle(options.guild, options.limit, options.channel ?? undefined);

    await this.replies.send(
      interaction,
      this.replies.text(interaction.locale, CommandMessage.LimitSaved),
    );
  }
}
