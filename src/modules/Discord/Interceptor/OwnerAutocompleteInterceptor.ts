import { Injectable } from "@nestjs/common";
import { ChannelFlags, ChannelType, Client } from "discord.js";
import { AutocompleteInterceptor } from "necord";
import { sprintf } from "sprintf-js";
import { OwnershipService } from "../../Ownership/Service/OwnershipService.js";
import { CommandOptionName } from "../Enum/CommandOptionName.js";
import { CommandTargetService } from "../Service/CommandTargetService.js";

import type { ApplicationCommandOptionChoiceData, AutocompleteInteraction } from "discord.js";

@Injectable()
export class OwnerAutocompleteInterceptor extends AutocompleteInterceptor {
  private static readonly MAX_CHOICES = 25;
  private static readonly MAX_LABEL_LENGTH = 100;
  private static readonly RESPONSE_BUDGET_MS = 2000;
  private static readonly LABEL = "%(name)s (%(id)s)";
  constructor(
    private readonly client: Client,
    private readonly ownership: OwnershipService,
    private readonly targets: CommandTargetService,
  ) {
    super();
  }

  /** @throws {Promise<Error>} Discord could not accept the autocomplete response. */
  async transformOptions(interaction: AutocompleteInteraction): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let choices: ApplicationCommandOptionChoiceData<string>[];

    try {
      choices = await Promise.race([
        this.choices(interaction),
        new Promise<ApplicationCommandOptionChoiceData<string>[]>((resolve) => {
          timer = setTimeout(() => resolve([]), OwnerAutocompleteInterceptor.RESPONSE_BUDGET_MS);
        }),
      ]);
    } catch {
      choices = [];
    } finally {
      clearTimeout(timer);
    }

    await interaction.respond(choices);
  }

  /** @throws {Promise<unknown>} Owner authorization or selected guild validation failed. */
  private async choices(
    interaction: AutocompleteInteraction,
  ): Promise<ApplicationCommandOptionChoiceData<string>[]> {
    await this.ownership.assertOwner(interaction.user.id);

    if (!this.client.isReady()) {
      return [];
    }

    const focused = interaction.options.getFocused(true);
    const query = focused.value.toString().toLowerCase();
    let candidates: { id: string; name: string }[] = [];

    if (focused.name === CommandOptionName.Guild) {
      candidates = [...this.client.guilds.cache.values()].filter((guild) => guild.available);
    } else if (focused.name === CommandOptionName.Channel) {
      const guildId = interaction.options.getString(CommandOptionName.Guild);

      if (guildId === null) {
        return [];
      }

      candidates = [...this.targets.guild(guildId).channels.cache.values()].filter(
        (channel) =>
          channel.type === ChannelType.GuildVoice &&
          !channel.flags.has(ChannelFlags.ChannelObfuscated),
      );
    }

    return candidates
      .filter((choice) => choice.id.includes(query) || choice.name.toLowerCase().includes(query))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, OwnerAutocompleteInterceptor.MAX_CHOICES)
      .map((choice) => ({
        name: sprintf(OwnerAutocompleteInterceptor.LABEL, choice).slice(
          0,
          OwnerAutocompleteInterceptor.MAX_LABEL_LENGTH,
        ),
        value: choice.id,
      }));
  }
}
