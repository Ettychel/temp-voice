import { Locale } from "discord.js";
import { IntegerOption, StringOption } from "necord";
import { CommandOptionName } from "../Enum/CommandOptionName.js";

export class OwnerLimitOptionsDto {
  @StringOption({
    name: CommandOptionName.Guild,
    description: "Server ID",
    description_localizations: { [Locale.Russian]: "ID сервера" },
    autocomplete: true,
    required: true,
  })
  readonly guild!: string;

  @IntegerOption({
    name: CommandOptionName.Limit,
    description: "Maximum rooms; 0 removes the limit",
    description_localizations: { [Locale.Russian]: "Максимум комнат; 0 снимает лимит" },
    min_value: 0,
    max_value: Number.MAX_SAFE_INTEGER,
    required: true,
  })
  readonly limit!: number;

  @StringOption({
    name: CommandOptionName.Channel,
    description: "Voice channel ID; omit for server limit",
    description_localizations: {
      [Locale.Russian]: "ID голосового канала; без него — лимит сервера",
    },
    autocomplete: true,
    required: false,
  })
  readonly channel!: string | null;
}
