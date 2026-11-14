import { Inject, Injectable } from "@nestjs/common";
import { KeyedOperationCoordinator } from "../../Core/Operation/Service/KeyedOperationCoordinator.js";
import { DatabaseOperationError } from "../../Infrastructure/Database/Error/DatabaseOperationError.js";
import { LimitsService } from "../../Limits/Service/LimitsService.js";
import { JsonLogger } from "../../Logging/Service/JsonLogger.js";
import { TriggerService } from "../../Triggers/Service/TriggerService.js";
import { VoiceChannelState } from "../Enum/VoiceChannelState.js";
import { TemporaryChannelService } from "../Service/TemporaryChannelService.js";
import { VoiceEntryService } from "../Service/VoiceEntryService.js";
import { VoiceChannelGatewayToken } from "../Token/VoiceChannelGatewayToken.js";
import { DeleteTemporaryChannelHandler } from "./DeleteTemporaryChannelHandler.js";

import type { OperationAdmissionClosedError } from "../../Core/Operation/Error/OperationAdmissionClosedError.js";
import type { OperationReentryError } from "../../Core/Operation/Error/OperationReentryError.js";
import type { InvalidTriggerChannelError } from "../../Triggers/Error/InvalidTriggerChannelError.js";
import type { TriggerPermissionsError } from "../../Triggers/Error/TriggerPermissionsError.js";
import type { VoiceEntryDto } from "../Dto/VoiceEntryDto.js";
import type { VoiceChannelMutationError } from "../Error/VoiceChannelMutationError.js";
import type { VoiceChannelUnavailableError } from "../Error/VoiceChannelUnavailableError.js";
import type { VoiceChannelGatewayInterface } from "../Interface/VoiceChannelGatewayInterface.js";

@Injectable()
export class CreateTemporaryChannelHandler {
  private static readonly LOG_EVENT = "voice.channel.creation";

  constructor(
    private readonly coordinator: KeyedOperationCoordinator,
    private readonly triggers: TriggerService,
    private readonly limits: LimitsService,
    private readonly channels: TemporaryChannelService,
    private readonly entries: VoiceEntryService,
    private readonly deletion: DeleteTemporaryChannelHandler,
    private readonly logger: JsonLogger,
    @Inject(VoiceChannelGatewayToken) private readonly gateway: VoiceChannelGatewayInterface,
  ) {}

  /**
   * @throws {Promise<InvalidTriggerChannelError>} Current trigger facts are unsuitable.
   * @throws {Promise<TriggerPermissionsError>} Current bot permissions are insufficient.
   * @throws {Promise<VoiceChannelUnavailableError>} Current Discord facts are unavailable.
   * @throws {Promise<VoiceChannelMutationError>} Creating or moving the creator failed.
   * @throws {Promise<DatabaseOperationError>} Persisting or compensating tracked state failed.
   * @throws {Promise<OperationReentryError>} A guild or database queue was reentered.
   * @throws {Promise<OperationAdmissionClosedError>} The application stopped accepting work.
   * @throws {Promise<unknown>}
   * @throws {Promise<TypeError>} Writing a diagnostic log failed.
   */
  handle(entry: VoiceEntryDto): Promise<string | null> {
    return this.coordinator.run(entry.guildId, async () => {
      if (!this.entries.claimForCreation(entry)) {
        return null;
      }

      const trigger = await this.triggers.get(entry.guildId, entry.channelId);

      if (!trigger?.isActive) {
        return null;
      }

      const reason = this.limits.getCreationBlockReason(entry.guildId, entry.userId, {
        guildLimit: await this.limits.getGuildLimit(entry.guildId),
        triggerLimit: trigger.channelLimit,
        guildChannelCount: await this.channels.count(entry.guildId),
        triggerChannelCount: await this.channels.count(entry.guildId, entry.channelId),
      });

      if (reason !== null) {
        this.logger.log({
          event: CreateTemporaryChannelHandler.LOG_EVENT,
          guildId: entry.guildId,
          userId: entry.userId,
          reason,
        });

        return null;
      }

      const channel = await this.gateway.getTriggerChannel(entry.guildId, entry.channelId);

      this.triggers.assertCanManage(
        channel,
        await this.channels.isManaged(entry.guildId, entry.channelId),
      );

      if (!(await this.isCurrent(entry))) {
        return null;
      }

      const channelId = await this.gateway.createChannel(
        entry.guildId,
        entry.channelId,
        entry.userId,
      );

      try {
        await this.channels.recordCreated(entry.guildId, entry.channelId, entry.userId, channelId);
      } catch (error) {
        if (error instanceof DatabaseOperationError && !error.isBusy) {
          this.coordinator.stopAccepting();
        }

        await this.compensateUntracked(entry.guildId, channelId);

        this.logger.error({
          event: CreateTemporaryChannelHandler.LOG_EVENT,
          guildId: entry.guildId,
          channelId,
          reason: "Channel persistence failed.",
        });

        throw error;
      }

      let current: boolean;

      try {
        current = await this.isCurrent(entry);

        if (current) {
          await this.gateway.moveMember(entry.guildId, entry.userId, channelId);
        }
      } catch (error) {
        await this.deletion.deleteInCurrentOperation(entry.guildId, channelId);
        throw error;
      }

      if (!current) {
        await this.deletion.deleteInCurrentOperation(entry.guildId, channelId);

        return null;
      }

      this.limits.recordSuccessfulCreation(entry.guildId, entry.userId);

      this.logger.log({
        event: CreateTemporaryChannelHandler.LOG_EVENT,
        guildId: entry.guildId,
        channelId,
        userId: entry.userId,
        result: "created",
      });

      return channelId;
    });
  }

  /** @throws {Promise<VoiceChannelUnavailableError>} The current voice position is unknown. */
  private async isCurrent(entry: VoiceEntryDto): Promise<boolean> {
    const inChannel = await this.gateway.isMemberInChannel(
      entry.guildId,
      entry.userId,
      entry.channelId,
    );

    return inChannel && this.entries.isEligible(entry);
  }

  /**
   * Best-effort compensation for a known Discord ID which could not be saved.
   * @throws {Promise<TypeError>}
   */
  private async compensateUntracked(guildId: string, channelId: string): Promise<void> {
    try {
      if ((await this.gateway.getChannelState(guildId, channelId)) === VoiceChannelState.Empty) {
        await this.gateway.deleteChannel(guildId, channelId);
      }
    } catch {
      this.logger.error({
        event: CreateTemporaryChannelHandler.LOG_EVENT,
        guildId,
        channelId,
        reason: "Untracked channel compensation failed.",
      });
    }
  }
}
