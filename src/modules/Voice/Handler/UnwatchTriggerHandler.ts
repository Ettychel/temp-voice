import { Inject, Injectable } from "@nestjs/common";
import { KeyedOperationCoordinator } from "../../Core/Operation/Service/KeyedOperationCoordinator.js";
import { TriggerService } from "../../Triggers/Service/TriggerService.js";
import { TemporaryChannelService } from "../Service/TemporaryChannelService.js";
import { VoiceEntryService } from "../Service/VoiceEntryService.js";
import { VoiceChannelGatewayToken } from "../Token/VoiceChannelGatewayToken.js";

import type { OperationAdmissionClosedError } from "../../Core/Operation/Error/OperationAdmissionClosedError.js";
import type { OperationReentryError } from "../../Core/Operation/Error/OperationReentryError.js";
import type { DatabaseOperationError } from "../../Infrastructure/Database/Error/DatabaseOperationError.js";
import type { VoiceChannelUnavailableError } from "../Error/VoiceChannelUnavailableError.js";
import type { VoiceChannelGatewayInterface } from "../Interface/VoiceChannelGatewayInterface.js";

@Injectable()
export class UnwatchTriggerHandler {
  constructor(
    private readonly coordinator: KeyedOperationCoordinator,
    private readonly triggers: TriggerService,
    private readonly channels: TemporaryChannelService,
    private readonly entries: VoiceEntryService,
    @Inject(VoiceChannelGatewayToken) private readonly gateway: VoiceChannelGatewayInterface,
  ) {}

  /**
   * @throws {Promise<DatabaseOperationError>} Removing observation failed.
   * @throws {Promise<VoiceChannelUnavailableError>} The guild is unavailable after queueing.
   * @throws {Promise<OperationReentryError>} The guild or database queue was reentered.
   * @throws {Promise<OperationAdmissionClosedError>} The application stopped accepting work.
   * @throws {Promise<unknown>}
   */
  handle(guildId: string, channelId: string): Promise<void> {
    return this.coordinator.run(guildId, async () => {
      this.gateway.assertGuildAvailable(guildId);

      await this.triggers.unwatch(
        guildId,
        channelId,
        (await this.channels.count(guildId, channelId)) > 0,
      );

      this.entries.removeWatchBoundary(guildId, channelId);
    });
  }
}
