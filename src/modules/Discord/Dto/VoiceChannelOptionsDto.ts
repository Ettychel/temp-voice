import { ChannelType, Locale } from "discord.js";
import { ChannelOption } from "necord";
import { CommandOptionName } from "../Enum/CommandOptionName.js";

import type { VoiceChannel } from "discord.js";

export class VoiceChannelOptionsDto {
  @ChannelOption({
    name: CommandOptionName.Channel,
    description: "Voice trigger channel",
    description_localizations: { [Locale.Russian]: "Голосовой канал-триггер" },
    channel_types: [ChannelType.GuildVoice],
    required: true,
  })
  readonly channel!: VoiceChannel;
}
