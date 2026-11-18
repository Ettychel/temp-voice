import { Module } from "@nestjs/common";
import { DatabaseOptionsModule } from "../App/DatabaseOptionsModule.js";
import { DatabaseOptionsFactory } from "../App/Factory/DatabaseOptionsFactory.js";
import { DatabaseModule } from "../Infrastructure/Database/DatabaseModule.js";
import { LoggingModule } from "../Logging/LoggingModule.js";
import { OwnershipModule } from "../Ownership/OwnershipModule.js";
import { OwnerRecoverCommand } from "./Command/OwnerRecoverCommand.js";

@Module({
  imports: [
    DatabaseOptionsModule,
    LoggingModule,
    DatabaseModule.forRootAsync({
      imports: [DatabaseOptionsModule],
      useExisting: DatabaseOptionsFactory,
    }),
    OwnershipModule,
  ],
  providers: [OwnerRecoverCommand],
})
export class CliModule {}
