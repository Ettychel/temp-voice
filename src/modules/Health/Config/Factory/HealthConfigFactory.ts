import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { HealthConfig } from "../HealthConfig.js";

import type { HealthEnvVariables } from "../../../../config/env/Variables/HealthEnvVariables.js";
import type { FactoryInterface } from "../../../Core/Interface/FactoryInterface.js";

@Injectable()
export class HealthConfigFactory implements FactoryInterface<HealthConfig> {
  constructor(private readonly environment: ConfigService<HealthEnvVariables, true>) {}

  create(): HealthConfig {
    return new HealthConfig(this.environment.get("HEALTH_FILE_PATH", { infer: true }));
  }
}
