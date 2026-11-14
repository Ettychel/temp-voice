import { Module } from "@nestjs/common";
import { OperationModule } from "../Core/Operation/OperationModule.js";
import { LimitsModule } from "../Limits/LimitsModule.js";
import { LoggingModule } from "../Logging/LoggingModule.js";
import { TriggersModule } from "../Triggers/TriggersModule.js";
import { CreateTemporaryChannelHandler } from "./Handler/CreateTemporaryChannelHandler.js";
import { DeleteTemporaryChannelHandler } from "./Handler/DeleteTemporaryChannelHandler.js";
import { ReconcileGuildHandler } from "./Handler/ReconcileGuildHandler.js";
import { RemoveGuildHandler } from "./Handler/RemoveGuildHandler.js";
import { SetChannelLimitHandler } from "./Handler/SetChannelLimitHandler.js";
import { SynchronizeTriggerHandler } from "./Handler/SynchronizeTriggerHandler.js";
import { UnwatchTriggerHandler } from "./Handler/UnwatchTriggerHandler.js";
import { WatchTriggerHandler } from "./Handler/WatchTriggerHandler.js";
import { GuildRemovalRepository } from "./Repository/GuildRemovalRepository.js";
import { TemporaryChannelRepository } from "./Repository/TemporaryChannelRepository.js";
import { TemporaryChannelService } from "./Service/TemporaryChannelService.js";
import { VoiceEntryService } from "./Service/VoiceEntryService.js";

import type { DynamicModule, Type } from "@nestjs/common";

@Module({
  imports: [OperationModule, LimitsModule, LoggingModule, TriggersModule],
  providers: [
    TemporaryChannelRepository,
    TemporaryChannelService,
    VoiceEntryService,
    WatchTriggerHandler,
    UnwatchTriggerHandler,
    SetChannelLimitHandler,
    SynchronizeTriggerHandler,
    CreateTemporaryChannelHandler,
    DeleteTemporaryChannelHandler,
    ReconcileGuildHandler,
    RemoveGuildHandler,
    GuildRemovalRepository,
  ],
  exports: [
    VoiceEntryService,
    WatchTriggerHandler,
    UnwatchTriggerHandler,
    SetChannelLimitHandler,
    SynchronizeTriggerHandler,
    CreateTemporaryChannelHandler,
    DeleteTemporaryChannelHandler,
    ReconcileGuildHandler,
    RemoveGuildHandler,
  ],
})
export class VoiceModule {
  /** The supplied module exports VoiceChannelGatewayToken with its concrete adapter. */
  static withGateway(gatewayModule: Type<unknown>): DynamicModule {
    return { module: VoiceModule, imports: [gatewayModule] };
  }
}
