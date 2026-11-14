import { Module } from "@nestjs/common";
import { NecordModule } from "necord";
import { CreateConfigProvider } from "../Core/Provider/CreateConfigProvider.js";
import { VoiceChannelGatewayToken } from "../Voice/Token/VoiceChannelGatewayToken.js";
import { DiscordVoiceChannelAdapter } from "./Adapter/DiscordVoiceChannelAdapter.js";
import { DiscordConfig } from "./Config/DiscordConfig.js";
import { DiscordConfigFactory } from "./Config/Factory/DiscordConfigFactory.js";
import { DiscordOptionsFactory } from "./Factory/DiscordOptionsFactory.js";
import { VoiceChannelOptionsFactory } from "./Factory/VoiceChannelOptionsFactory.js";
import { DiscordGuildStateService } from "./Service/DiscordGuildStateService.js";

const necordModule = NecordModule.forRootAsync({ useClass: DiscordOptionsFactory });

necordModule.providers!.push(
  DiscordConfigFactory,
  CreateConfigProvider(DiscordConfig, DiscordConfigFactory),
);

@Module({
  imports: [necordModule],
  providers: [
    DiscordGuildStateService,
    VoiceChannelOptionsFactory,
    DiscordVoiceChannelAdapter,
    { provide: VoiceChannelGatewayToken, useExisting: DiscordVoiceChannelAdapter },
  ],
  exports: [VoiceChannelGatewayToken, DiscordGuildStateService],
})
export class DiscordGatewayModule {}
