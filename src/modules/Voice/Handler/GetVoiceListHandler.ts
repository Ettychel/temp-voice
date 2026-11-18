import { Inject, Injectable } from "@nestjs/common";
import { LimitsService } from "../../Limits/Service/LimitsService.js";
import { TriggerService } from "../../Triggers/Service/TriggerService.js";
import { MAXIMUM_DELETE_ATTEMPTS } from "../Constant/MaximumDeleteAttempts.js";
import { TriggerListItemDto } from "../Dto/TriggerListItemDto.js";
import { VoiceListDto } from "../Dto/VoiceListDto.js";
import { TemporaryChannelService } from "../Service/TemporaryChannelService.js";
import { VoiceChannelGatewayToken } from "../Token/VoiceChannelGatewayToken.js";

import type { OperationReentryError } from "../../Core/Operation/Error/OperationReentryError.js";
import type { DatabaseOperationError } from "../../Infrastructure/Database/Error/DatabaseOperationError.js";
import type { VoiceChannelUnavailableError } from "../Error/VoiceChannelUnavailableError.js";
import type { VoiceChannelGatewayInterface } from "../Interface/VoiceChannelGatewayInterface.js";

@Injectable()
export class GetVoiceListHandler {
  constructor(
    private readonly triggers: TriggerService,
    private readonly channels: TemporaryChannelService,
    private readonly limits: LimitsService,
    @Inject(VoiceChannelGatewayToken) private readonly gateway: VoiceChannelGatewayInterface,
  ) {}

  /**
   * @throws {Promise<VoiceChannelUnavailableError>} The guild is unavailable.
   * @throws {Promise<DatabaseOperationError>} Reading triggers, rooms or the guild limit failed.
   * @throws {Promise<OperationReentryError>} The database queue was reentered.
   */
  async handle(guildId: string, includeGuildLimit = false): Promise<VoiceListDto> {
    this.gateway.assertGuildAvailable(guildId);

    const [triggers, channels, guildLimit] = await Promise.all([
      this.triggers.list(guildId),
      this.channels.list(guildId),
      includeGuildLimit ? this.limits.getGuildLimit(guildId) : Promise.resolve(null),
    ]);

    const active = new Set(
      triggers.filter((trigger) => trigger.isActive).map((trigger) => trigger.channelId),
    );

    const counts = new Map<string, number>();

    for (const channel of channels) {
      counts.set(channel.triggerChannelId, (counts.get(channel.triggerChannelId) ?? 0) + 1);
    }

    return new VoiceListDto(
      triggers
        .sort((a, b) => a.channelId.localeCompare(b.channelId))
        .map(
          (trigger) =>
            new TriggerListItemDto(
              trigger.channelId,
              trigger.isActive,
              trigger.channelLimit,
              counts.get(trigger.channelId) ?? 0,
            ),
        ),
      channels.length,
      channels.filter((channel) => !active.has(channel.triggerChannelId)).length,
      channels
        .filter((channel) => channel.deleteAttempts >= MAXIMUM_DELETE_ATTEMPTS)
        .map((channel) => channel.channelId)
        .sort(),
      guildLimit,
    );
  }
}
