import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ValidateEnv } from "../../config/env/ValidateEnv.js";
import { OperationModule } from "../Core/Operation/OperationModule.js";
import { CreateConfigProvider } from "../Core/Provider/CreateConfigProvider.js";
import { DiscordModule } from "../Discord/DiscordModule.js";
import { HealthConfigFactory } from "../Health/Config/Factory/HealthConfigFactory.js";
import { HealthConfig } from "../Health/Config/HealthConfig.js";
import { DatabaseConfig } from "../Infrastructure/Database/Config/DatabaseConfig.js";
import { DatabaseConfigFactory } from "../Infrastructure/Database/Config/Factory/DatabaseConfigFactory.js";
import { DatabaseModule } from "../Infrastructure/Database/DatabaseModule.js";
import { LoggingModule } from "../Logging/LoggingModule.js";
import { OwnershipModule } from "../Ownership/OwnershipModule.js";
import { DatabaseOptionsFactory } from "./Factory/DatabaseOptionsFactory.js";
import { OwnershipBootstrapObserver } from "./Observer/OwnershipBootstrapObserver.js";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, validate: ValidateEnv }),
    DatabaseModule.forRootAsync({
      useClass: DatabaseOptionsFactory,
      extraProviders: [
        DatabaseConfigFactory,
        CreateConfigProvider(DatabaseConfig, DatabaseConfigFactory),
      ],
    }),
    LoggingModule,
    OperationModule,
    OwnershipModule,
    DiscordModule,
  ],
  providers: [
    HealthConfigFactory,
    CreateConfigProvider(HealthConfig, HealthConfigFactory),
    OwnershipBootstrapObserver,
  ],
})
export class AppModule {}
