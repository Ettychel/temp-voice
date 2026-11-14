import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DiscordConfig } from "../DiscordConfig.js";

import type { DiscordEnvVariables } from "../../../../config/env/Variables/DiscordEnvVariables.js";
import type { FactoryInterface } from "../../../Core/Interface/FactoryInterface.js";

@Injectable()
export class DiscordConfigFactory implements FactoryInterface<DiscordConfig> {
  constructor(private readonly environment: ConfigService<DiscordEnvVariables, true>) {}

  create(): DiscordConfig {
    return new DiscordConfig(this.environment.get("DISCORD_TOKEN", { infer: true }));
  }
}
