import { Module } from "@nestjs/common";
import { OperationModule } from "../Core/Operation/OperationModule.js";
import { LoggingModule } from "../Logging/LoggingModule.js";
import { VoiceModule } from "../Voice/VoiceModule.js";
import { ReconciliationService } from "./Service/ReconciliationService.js";

import type { DynamicModule, Type } from "@nestjs/common";

@Module({
  imports: [OperationModule, LoggingModule],
  providers: [ReconciliationService],
  exports: [ReconciliationService],
})
export class ReconciliationModule {
  static withGateway(gatewayModule: Type<unknown>): DynamicModule {
    return { module: ReconciliationModule, imports: [VoiceModule.withGateway(gatewayModule)] };
  }
}
