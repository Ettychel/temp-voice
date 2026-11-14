import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { DatabaseConfig } from "../DatabaseConfig.js";

import type { DatabaseEnvVariables } from "../../../../../config/env/Variables/DatabaseEnvVariables.js";
import type { FactoryInterface } from "../../../../Core/Interface/FactoryInterface.js";

@Injectable()
export class DatabaseConfigFactory implements FactoryInterface<DatabaseConfig> {
  constructor(private readonly environment: ConfigService<DatabaseEnvVariables, true>) {}

  create(): DatabaseConfig {
    return new DatabaseConfig(this.environment.get("DATABASE_PATH", { infer: true }));
  }
}
