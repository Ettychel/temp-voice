import { Module } from "@nestjs/common";
import { GuildLimitRepository } from "./Repository/GuildLimitRepository.js";
import { LimitsService } from "./Service/LimitsService.js";

@Module({ providers: [GuildLimitRepository, LimitsService], exports: [LimitsService] })
export class LimitsModule {}
