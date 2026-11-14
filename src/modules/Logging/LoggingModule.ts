import { Module } from "@nestjs/common";
import { JsonLogger } from "./Service/JsonLogger.js";

@Module({ providers: [JsonLogger], exports: [JsonLogger] })
export class LoggingModule {}
