import { Module } from "@nestjs/common";
import { TriggerRepository } from "./Repository/TriggerRepository.js";
import { TriggerService } from "./Service/TriggerService.js";

@Module({ providers: [TriggerRepository, TriggerService], exports: [TriggerService] })
export class TriggersModule {}
