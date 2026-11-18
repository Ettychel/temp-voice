import { Injectable } from "@nestjs/common";
import { DatabaseLogger } from "../../Infrastructure/Database/Adapter/DatabaseLogger.js";
import { DatabaseConfig } from "../../Infrastructure/Database/Config/DatabaseConfig.js";
import { InitialSchema1794586991484 } from "../../Infrastructure/Database/Migration/1794586991484-InitialSchema.js";
import { PendingGuildRemoval1794594323530 } from "../../Infrastructure/Database/Migration/1794594323530-PendingGuildRemoval.js";
import { GuildSettings } from "../../Limits/Entity/GuildSettings.js";
import { BotOwner } from "../../Ownership/Entity/BotOwner.js";
import { ClaimAttempt } from "../../Ownership/Entity/ClaimAttempt.js";
import { OwnerCode } from "../../Ownership/Entity/OwnerCode.js";
import { VoiceTrigger } from "../../Triggers/Entity/VoiceTrigger.js";
import { PendingGuildRemoval } from "../../Voice/Entity/PendingGuildRemoval.js";
import { TemporaryChannel } from "../../Voice/Entity/TemporaryChannel.js";

import type { TypeOrmModuleOptions, TypeOrmOptionsFactory } from "@nestjs/typeorm";
import type { DataSourceOptions } from "typeorm";

/** Composition root: combines connection settings with the application's schema. */
@Injectable()
export class DatabaseOptionsFactory implements TypeOrmOptionsFactory {
  constructor(private readonly config: DatabaseConfig) {}

  createTypeOrmOptions(): Extract<DataSourceOptions, { type: "better-sqlite3" }> &
    TypeOrmModuleOptions {
    return {
      type: "better-sqlite3",
      database: this.config.path,
      entities: [
        GuildSettings,
        VoiceTrigger,
        TemporaryChannel,
        PendingGuildRemoval,
        BotOwner,
        OwnerCode,
        ClaimAttempt,
      ],
      migrations: [InitialSchema1794586991484, PendingGuildRemoval1794594323530],
      migrationsRun: false,
      synchronize: false,
      enableWAL: true,
      timeout: 1000,
      logging: false,
      logger: new DatabaseLogger(),
      retryAttempts: 1,
    };
  }
}
