import { Injectable } from "@nestjs/common";
import { Locale, MessageFlags } from "discord.js";
import { sprintf } from "sprintf-js";
import { CommandMessage } from "../Enum/CommandMessage.js";

import type {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ChatInputCommandInteraction,
} from "discord.js";

@Injectable()
export class CommandReplyService {
  private static readonly TEXT: Record<CommandMessage, readonly [string, string]> = {
    [CommandMessage.Denied]: [
      "You cannot use this command here or no longer have permission.",
      "Команда здесь недоступна или у вас больше нет прав.",
    ],
    [CommandMessage.InvalidTarget]: [
      "Select an available server and one of its voice channels.",
      "Выберите доступный сервер и его голосовой канал.",
    ],
    [CommandMessage.InvalidChannel]: [
      "This channel cannot be used as a trigger.",
      "Этот канал нельзя использовать как триггер.",
    ],
    [CommandMessage.BotPermissions]: [
      "The bot lacks the permissions required to manage this channel.",
      "Боту не хватает прав для управления этим каналом.",
    ],
    [CommandMessage.InvalidLimit]: [
      "The limit must be a non-negative integer; 0 removes the limit.",
      "Лимит должен быть целым неотрицательным числом; 0 снимает ограничение.",
    ],
    [CommandMessage.Technical]: [
      "The operation failed. Please try again later.",
      "Не удалось выполнить операцию. Повторите позже.",
    ],
    [CommandMessage.Conflict]: [
      "Ownership or the code changed. Please retry with the current code.",
      "Владелец или код изменились. Повторите с актуальным кодом.",
    ],
    [CommandMessage.Claimed]: ["You are now the bot owner.", "Вы стали владельцем бота."],
    [CommandMessage.InvalidCode]: [
      "The code is invalid, expired or already redeemed.",
      "Код неверен, просрочен или уже погашен.",
    ],
    [CommandMessage.Blocked]: [
      "Too many incorrect attempts. Try again <t:%(until)d:R>.",
      "Слишком много неверных попыток. Повторите <t:%(until)d:R>.",
    ],
    [CommandMessage.Transfer]: [
      "Transfer code (valid for 24 hours):\n`%(code)s`",
      "Код передачи (действует 24 часа):\n`%(code)s`",
    ],
    [CommandMessage.Watched]: ["Voice trigger registered.", "Голосовой триггер зарегистрирован."],
    [CommandMessage.AlreadyWatched]: [
      "This voice trigger is already registered.",
      "Этот голосовой триггер уже зарегистрирован.",
    ],
    [CommandMessage.Unwatched]: [
      "Observation disabled. Existing rooms are retained until empty.",
      "Наблюдение отключено. Существующие комнаты сохраняются до опустения.",
    ],
    [CommandMessage.LimitSaved]: [
      "Limit saved. Existing rooms are unaffected.",
      "Лимит сохранён. Существующие комнаты не затронуты.",
    ],
    [CommandMessage.Active]: ["Active triggers", "Активные триггеры"],
    [CommandMessage.Inactive]: [
      "Inactive triggers with saved limits",
      "Неактивные триггеры с сохранёнными лимитами",
    ],
    [CommandMessage.Orphans]: [
      "Rooms without an active trigger: %(count)d",
      "Комнаты без активного триггера: %(count)d",
    ],
    [CommandMessage.Problems]: ["Rooms requiring manual deletion", "Комнаты для ручного удаления"],
    [CommandMessage.Summary]: [
      "Total rooms: %(count)d; server limit: %(limit)s",
      "Всего комнат: %(count)d; лимит сервера: %(limit)s",
    ],
    [CommandMessage.Trigger]: [
      "• <#%(channel)s> — rooms: %(count)d; limit: %(limit)s",
      "• <#%(channel)s> — комнат: %(count)d; лимит: %(limit)s",
    ],
    [CommandMessage.Empty]: ["None", "Нет"],
    [CommandMessage.Back]: ["Back", "Назад"],
    [CommandMessage.Next]: ["Next", "Далее"],
    [CommandMessage.Expired]: [
      "This list session has expired. Run the list command again.",
      "Сессия списка недействительна. Выполните команду списка заново.",
    ],
    [CommandMessage.Page]: ["Page %(page)d/%(total)d", "Страница %(page)d/%(total)d"],
  };

  /** @throws {Error} Formatting a message with invalid parameters failed. */
  text(locale: Locale, key: CommandMessage, values: Record<string, string | number> = {}): string {
    return sprintf(CommandReplyService.TEXT[key][locale === Locale.Russian ? 1 : 0], values);
  }

  /** @throws {Promise<Error>} Discord could not acknowledge the interaction. */
  async defer(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.deferReply(interaction.inGuild() ? { flags: MessageFlags.Ephemeral } : {});
  }

  /** @throws {Promise<Error>} Discord could not send the reply. */
  async send(
    interaction: ChatInputCommandInteraction | ButtonInteraction,
    content: string,
    components: ActionRowBuilder<ButtonBuilder>[] = [],
  ): Promise<void> {
    const message = { content, components, allowedMentions: { parse: [] as const } };

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(message);
    } else {
      await interaction.reply({
        ...message,
        ...(interaction.inGuild() ? { flags: MessageFlags.Ephemeral } : {}),
      });
    }
  }
}
