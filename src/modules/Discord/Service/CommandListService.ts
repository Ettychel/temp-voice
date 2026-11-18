import { Injectable } from "@nestjs/common";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  channelMention,
  InteractionContextType,
  PermissionFlagsBits,
} from "discord.js";
import { randomUUID } from "node:crypto";
import { sprintf } from "sprintf-js";
import { OwnershipService } from "../../Ownership/Service/OwnershipService.js";
import { ListPaginationSession } from "../Entity/ListPaginationSession.js";
import { CommandMessage } from "../Enum/CommandMessage.js";
import { CommandAccessError } from "../Error/CommandAccessError.js";
import { CommandReplyService } from "./CommandReplyService.js";
import { CommandTargetService } from "./CommandTargetService.js";

import type { ButtonInteraction, ChatInputCommandInteraction, Locale } from "discord.js";
import type { OperationReentryError } from "../../Core/Operation/Error/OperationReentryError.js";
import type { DatabaseOperationError } from "../../Infrastructure/Database/Error/DatabaseOperationError.js";
import type { OwnerAccessDeniedError } from "../../Ownership/Error/OwnerAccessDeniedError.js";
import type { VoiceListDto } from "../../Voice/Dto/VoiceListDto.js";
import type { InvalidCommandTargetError } from "../Error/InvalidCommandTargetError.js";

@Injectable()
export class CommandListService {
  static readonly BUTTON_PATTERN = "voice-list/:session/:page";
  private static readonly BUTTON_ID = "voice-list/%(session)s/%(page)d";
  private static readonly PAGE_CONTENT = "%(body)s\n\n%(footer)s";
  private static readonly HEADING = "**%(heading)s**";
  private static readonly SESSION_LIFETIME_MS = 15 * 60 * 1000;
  private static readonly MAX_BODY_LENGTH = 1800;
  private static readonly UNLIMITED = "∞";
  private readonly sessions = new Map<string, ListPaginationSession>();

  constructor(
    private readonly replies: CommandReplyService,
    private readonly ownership: OwnershipService,
    private readonly targets: CommandTargetService,
  ) {}

  /** @throws {Promise<Error>} Formatting or sending the list failed. */
  async show(
    interaction: ChatInputCommandInteraction,
    guildId: string,
    owner: boolean,
    data: VoiceListDto,
  ): Promise<void> {
    const now = Date.now();

    for (const [id, session] of this.sessions) {
      if (session.expiresAt <= now) {
        this.sessions.delete(id);
      }
    }

    const session = new ListPaginationSession(
      randomUUID(),
      interaction.user.id,
      guildId,
      owner,
      now + CommandListService.SESSION_LIFETIME_MS,
      interaction.locale,
      this.pages(data, owner, interaction.locale),
    );

    if (session.pages.length > 1) {
      this.sessions.set(session.id, session);
    }

    await this.render(interaction, session, 0);
  }

  /**
   * @throws {Promise<CommandAccessError>} The caller, context or requested page action is not allowed.
   * @throws {Promise<OperationReentryError>} The database queue was reentered.
   * @throws {Promise<DatabaseOperationError>} Reading current ownership failed.
   * @throws {Promise<OwnerAccessDeniedError>} The author is no longer the current owner.
   * @throws {Promise<InvalidCommandTargetError>} The guild is no longer available.
   * @throws {Promise<unknown>} Discord acknowledgment, formatting or reply failed.
   */
  async turn(interaction: ButtonInteraction, id: string, targetPage: string): Promise<void> {
    const session = this.sessions.get(id);

    if (session === undefined) {
      await this.expired(interaction);

      return;
    }

    if (session.userId !== interaction.user.id) {
      throw new CommandAccessError();
    }

    if (session.expiresAt <= Date.now()) {
      this.sessions.delete(id);
      await this.expired(interaction);

      return;
    }

    const page = Number(targetPage);

    if (!Number.isInteger(page) || page < 0 || page >= session.pages.length) {
      throw new CommandAccessError();
    }

    if (session.owner) {
      if (interaction.context !== InteractionContextType.BotDM) {
        throw new CommandAccessError();
      }
    } else if (
      interaction.guildId !== session.guildId ||
      !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)
    ) {
      throw new CommandAccessError();
    }

    await interaction.deferUpdate();

    if (session.owner) {
      await this.ownership.assertOwner(interaction.user.id);
    }

    this.targets.guild(session.guildId);
    await this.render(interaction, session, page);
  }

  /** @throws {Error} Formatting a localized page failed. */
  private pages(data: VoiceListDto, owner: boolean, locale: Locale): string[] {
    const text = (key: CommandMessage, values: Record<string, string | number> = {}) =>
      this.replies.text(locale, key, values);

    const rows: string[] = [];

    if (owner) {
      rows.push(
        text(CommandMessage.Summary, {
          count: data.totalCount,
          limit: data.guildLimit ?? CommandListService.UNLIMITED,
        }),
      );
    }

    rows.push(sprintf(CommandListService.HEADING, { heading: text(CommandMessage.Active) }));
    const active = data.triggers.filter((trigger) => trigger.isActive);

    rows.push(
      ...active.map((trigger) =>
        text(CommandMessage.Trigger, {
          channel: trigger.channelId,
          count: trigger.channelCount,
          limit: trigger.channelLimit ?? CommandListService.UNLIMITED,
        }),
      ),
    );

    if (active.length === 0) {
      rows.push(text(CommandMessage.Empty));
    }

    if (owner) {
      rows.push(sprintf(CommandListService.HEADING, { heading: text(CommandMessage.Inactive) }));

      const inactive = data.triggers.filter(
        (trigger) => !trigger.isActive && trigger.channelLimit !== null,
      );

      rows.push(
        ...inactive.map((trigger) =>
          text(CommandMessage.Trigger, {
            channel: trigger.channelId,
            count: trigger.channelCount,
            limit: trigger.channelLimit!,
          }),
        ),
      );

      if (inactive.length === 0) {
        rows.push(text(CommandMessage.Empty));
      }
    }

    rows.push(text(CommandMessage.Orphans, { count: data.orphanCount }));
    rows.push(sprintf(CommandListService.HEADING, { heading: text(CommandMessage.Problems) }));

    rows.push(
      ...(data.problemChannelIds.length === 0
        ? [text(CommandMessage.Empty)]
        : data.problemChannelIds.map((id) => channelMention(id))),
    );

    const pages: string[] = [];
    let lines: string[] = [];
    let length = 0;

    for (const row of rows) {
      if (length + row.length + 1 > CommandListService.MAX_BODY_LENGTH && lines.length > 0) {
        pages.push(lines.join("\n"));
        lines = [];
        length = 0;
      }

      lines.push(row);
      length += row.length + 1;
    }

    pages.push(lines.join("\n"));

    return pages;
  }

  /** @throws {Promise<Error>} Sending the expired-session response failed. */
  private async expired(interaction: ButtonInteraction): Promise<void> {
    await this.replies.send(
      interaction,
      this.replies.text(interaction.locale, CommandMessage.Expired),
    );
  }

  /** @throws {Promise<Error>} Formatting or sending the current page failed. */
  private async render(
    interaction: ChatInputCommandInteraction | ButtonInteraction,
    session: ListPaginationSession,
    page: number,
  ): Promise<void> {
    const components: ActionRowBuilder<ButtonBuilder>[] = [];

    if (session.pages.length > 1) {
      components.push(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(
              sprintf(CommandListService.BUTTON_ID, {
                session: session.id,
                page: Math.max(0, page - 1),
              }),
            )
            .setLabel(this.replies.text(session.locale, CommandMessage.Back))
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0),
          new ButtonBuilder()
            .setCustomId(
              sprintf(CommandListService.BUTTON_ID, {
                session: session.id,
                page: Math.min(session.pages.length - 1, page + 1),
              }),
            )
            .setLabel(this.replies.text(session.locale, CommandMessage.Next))
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === session.pages.length - 1),
        ),
      );
    }

    await this.replies.send(
      interaction,
      sprintf(CommandListService.PAGE_CONTENT, {
        body: session.pages[page],
        footer: this.replies.text(session.locale, CommandMessage.Page, {
          page: page + 1,
          total: session.pages.length,
        }),
      }),
      components,
    );
  }
}
