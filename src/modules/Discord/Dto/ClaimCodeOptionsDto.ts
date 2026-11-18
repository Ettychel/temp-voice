import { Locale } from "discord.js";
import { StringOption } from "necord";
import { CommandOptionName } from "../Enum/CommandOptionName.js";

export class ClaimCodeOptionsDto {
  @StringOption({
    name: CommandOptionName.Code,
    description: "Owner activation code",
    description_localizations: { [Locale.Russian]: "Код активации владельца" },
    required: true,
  })
  readonly code!: string;
}
