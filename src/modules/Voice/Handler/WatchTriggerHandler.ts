import { Inject, Injectable } from "@nestjs/common";
import { KeyedOperationCoordinator } from "../../Core/Operation/Service/KeyedOperationCoordinator.js";
import { WatchTriggerResult } from "../../Triggers/Enum/WatchTriggerResult.js";
import { TriggerService } from "../../Triggers/Service/TriggerService.js";
import { TemporaryChannelService } from "../Service/TemporaryChannelService.js";
import { VoiceEntryService } from "../Service/VoiceEntryService.js";
import { VoiceChannelGatewayToken } from "../Token/VoiceChannelGatewayToken.js";

import type { OperationAdmissionClosedError } from "../../Core/Operation/Error/OperationAdmissionClosedError.js";
import type { OperationReentryError } from "../../Core/Operation/Error/OperationReentryError.js";
import type { DatabaseOperationError } from "../../Infrastructure/Database/Error/DatabaseOperationError.js";
import type { InvalidTriggerChannelError } from "../../Triggers/Error/InvalidTriggerChannelError.js";
import type { TriggerPermissionsError } from "../../Triggers/Error/TriggerPermissionsError.js";
import type { VoiceChannelUnavailableError } from "../Error/VoiceChannelUnavailableError.js";
import type { VoiceChannelGatewayInterface } from "../Interface/VoiceChannelGatewayInterface.js";

@Injectable()
export class WatchTriggerHandler {
  constructor(
    private readonly coordinator: KeyedOperationCoordinator,
    private readonly triggers: TriggerService,
    private readonly channels: TemporaryChannelService,
    private readonly entries: VoiceEntryService,
    @Inject(VoiceChannelGatewayToken) private readonly gateway: VoiceChannelGatewayInterface,
  ) {}

  /**
   * @throws {Promise<InvalidTriggerChannelError>} The channel is unsuitable.
   * @throws {Promise<TriggerPermissionsError>} Required bot permissions are missing.
   * @throws {Promise<VoiceChannelUnavailableError>} Discord facts are unavailable.
   * @throws {Promise<DatabaseOperationError>} Reading or storing registration failed.
   * @throws {Promise<OperationReentryError>} The guild or database queue was reentered.
   * @throws {Promise<OperationAdmissionClosedError>} The application stopped accepting work.
   * @throws {Promise<unknown>}
   */
  handle(guildId: string, channelId: string): Promise<WatchTriggerResult> {
    return this.coordinator.run(guildId, async () => {
      const channel = await this.gateway.getTriggerChannel(guildId, channelId);

      const result = await this.triggers.watch(
        channel,
        await this.channels.isManaged(guildId, channelId),
      );

      if (result === WatchTriggerResult.Registered) {
        this.entries.markWatchBoundary(guildId, channelId);
      }

      return result;
    });
  }
}
