import { Module } from "@nestjs/common";
import { OperationModule } from "../Core/Operation/OperationModule.js";
import { LoggingModule } from "../Logging/LoggingModule.js";
import { OwnershipModule } from "../Ownership/OwnershipModule.js";
import { ReconciliationModule } from "../Reconciliation/ReconciliationModule.js";
import { VoiceModule } from "../Voice/VoiceModule.js";
import { ListPaginationController } from "./Controller/ListPaginationController.js";
import { OwnerCommandController } from "./Controller/OwnerCommandController.js";
import { VoiceCommandController } from "./Controller/VoiceCommandController.js";
import { DiscordGatewayModule } from "./DiscordGatewayModule.js";
import { CommandExceptionFilter } from "./Filter/CommandExceptionFilter.js";
import { OwnerCommandGuard } from "./Guard/OwnerCommandGuard.js";
import { VoiceCommandGuard } from "./Guard/VoiceCommandGuard.js";
import { OwnerAutocompleteInterceptor } from "./Interceptor/OwnerAutocompleteInterceptor.js";
import { CommandRegistrationObserver } from "./Observer/CommandRegistrationObserver.js";
import { DiscordEventObserver } from "./Observer/DiscordEventObserver.js";
import { CommandOptionsPipe } from "./Pipe/CommandOptionsPipe.js";
import { CommandListService } from "./Service/CommandListService.js";
import { CommandReplyService } from "./Service/CommandReplyService.js";
import { CommandTargetService } from "./Service/CommandTargetService.js";

@Module({
  imports: [
    DiscordGatewayModule,
    ReconciliationModule.withGateway(DiscordGatewayModule),
    OperationModule,
    LoggingModule,
    OwnershipModule,
    VoiceModule.withGateway(DiscordGatewayModule),
  ],
  providers: [
    DiscordEventObserver,
    CommandRegistrationObserver,
    VoiceCommandController,
    OwnerCommandController,
    ListPaginationController,
    CommandTargetService,
    CommandReplyService,
    CommandListService,
    CommandOptionsPipe,
    CommandExceptionFilter,
    VoiceCommandGuard,
    OwnerCommandGuard,
    OwnerAutocompleteInterceptor,
  ],
})
export class DiscordModule {}
