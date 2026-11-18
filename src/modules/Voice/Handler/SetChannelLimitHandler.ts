import { Inject, Injectable } from "@nestjs/common";
import { KeyedOperationCoordinator } from "../../Core/Operation/Service/KeyedOperationCoordinator.js";
import { LimitsService } from "../../Limits/Service/LimitsService.js";
import { TriggerService } from "../../Triggers/Service/TriggerService.js";
import { TemporaryChannelService } from "../Service/TemporaryChannelService.js";
import { VoiceChannelGatewayToken } from "../Token/VoiceChannelGatewayToken.js";

import type { OperationAdmissionClosedError } from "../../Core/Operation/Error/OperationAdmissionClosedError.js";
import type { OperationReentryError } from "../../Core/Operation/Error/OperationReentryError.js";
import type { DatabaseOperationError } from "../../Infrastructure/Database/Error/DatabaseOperationError.js";
import type { InvalidChannelLimitError } from "../../Limits/Error/InvalidChannelLimitError.js";
import type { InvalidTriggerChannelError } from "../../Triggers/Error/InvalidTriggerChannelError.js";
import type { VoiceChannelUnavailableError } from "../Error/VoiceChannelUnavailableError.js";
import type { VoiceChannelGatewayInterface } from "../Interface/VoiceChannelGatewayInterface.js";

@Injectable()
export class SetChannelLimitHandler {
  constructor(
    private readonly coordinator: KeyedOperationCoordinator,
    private readonly limits: LimitsService,
    private readonly triggers: TriggerService,
    private readonly channels: TemporaryChannelService,
    @Inject(VoiceChannelGatewayToken) private readonly gateway: VoiceChannelGatewayInterface,
  ) {}

  /**
   * @throws {Promise<InvalidChannelLimitError>} The limit is invalid.
   * @throws {Promise<InvalidTriggerChannelError>} The selected channel is unsuitable.
   * @throws {Promise<VoiceChannelUnavailableError>} Discord facts are unavailable.
   * @throws {Promise<DatabaseOperationError>} Reading or saving the limit failed.
   * @throws {Promise<OperationReentryError>} The guild or database queue was reentered.
   * @throws {Promise<OperationAdmissionClosedError>} The application stopped accepting work.
   * @throws {Promise<unknown>}
   */
  async handle(guildId: string, limit: number, channelId?: string): Promise<void> {
    if (channelId === undefined) {
      this.gateway.assertGuildAvailable(guildId);
      await this.limits.setGuildLimit(guildId, limit);

      return;
    }

    return this.coordinator.run(guildId, async () => {
      const normalizedLimit = this.limits.normalizeLimit(limit);
      const channel = await this.gateway.getTriggerChannel(guildId, channelId);

      await this.triggers.setLimit(
        channel,
        await this.channels.isManaged(guildId, channelId),
        normalizedLimit,
        (await this.channels.count(guildId, channelId)) > 0,
      );
    });
  }
}
