import { Locale } from "discord.js";
import { StringOption } from "necord";
import { CommandOptionName } from "../Enum/CommandOptionName.js";

export class OwnerGuildOptionsDto {
  @StringOption({
    name: CommandOptionName.Guild,
    description: "Server ID",
    description_localizations: { [Locale.Russian]: "ID сервера" },
    autocomplete: true,
    required: true,
  })
  readonly guild!: string;
}
