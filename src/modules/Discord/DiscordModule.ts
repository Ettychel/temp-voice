import { Module } from "@nestjs/common";
import { OperationModule } from "../Core/Operation/OperationModule.js";
import { LoggingModule } from "../Logging/LoggingModule.js";
import { ReconciliationModule } from "../Reconciliation/ReconciliationModule.js";
import { DiscordGatewayModule } from "./DiscordGatewayModule.js";
import { DiscordEventObserver } from "./Observer/DiscordEventObserver.js";

@Module({
  imports: [
    DiscordGatewayModule,
    ReconciliationModule.withGateway(DiscordGatewayModule),
    OperationModule,
    LoggingModule,
  ],
  providers: [DiscordEventObserver],
})
export class DiscordModule {}
