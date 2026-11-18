import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ValidateEnvGroup } from "../../config/env/ValidateEnvGroup.js";
import { DatabaseEnvVariables } from "../../config/env/Variables/DatabaseEnvVariables.js";
import { CreateConfigProvider } from "../Core/Provider/CreateConfigProvider.js";
import { DatabaseConfig } from "../Infrastructure/Database/Config/DatabaseConfig.js";
import { DatabaseConfigFactory } from "../Infrastructure/Database/Config/Factory/DatabaseConfigFactory.js";
import { DatabaseOptionsFactory } from "./Factory/DatabaseOptionsFactory.js";

import type { ConfigurationError } from "../../config/env/Error/ConfigurationError.js";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      /** @throws {ConfigurationError} Database settings are invalid. */
      validate: (environment) => ValidateEnvGroup(DatabaseEnvVariables, environment),
    }),
  ],
  providers: [
    DatabaseConfigFactory,
    CreateConfigProvider(DatabaseConfig, DatabaseConfigFactory),
    DatabaseOptionsFactory,
  ],
  exports: [DatabaseOptionsFactory],
})
export class DatabaseOptionsModule {}
