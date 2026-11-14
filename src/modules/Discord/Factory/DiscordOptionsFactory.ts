import { Injectable } from "@nestjs/common";
import { GatewayIntentBits } from "discord.js";
import { DiscordConfig } from "../Config/DiscordConfig.js";

import type { ConfigurableModuleOptionsFactory } from "@nestjs/common";
import type { NecordModuleOptions } from "necord";

@Injectable()
export class DiscordOptionsFactory implements ConfigurableModuleOptionsFactory<
  NecordModuleOptions,
  "createNecordOptions"
> {
  constructor(private readonly config: DiscordConfig) {}

  createNecordOptions(): NecordModuleOptions {
    return {
      token: this.config.token,
      intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
      skipRegistration: true,
    };
  }
}
