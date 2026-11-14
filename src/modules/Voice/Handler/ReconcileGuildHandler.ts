import { Inject, Injectable } from "@nestjs/common";
import { ChannelType } from "discord.js";
import { KeyedOperationCoordinator } from "../../Core/Operation/Service/KeyedOperationCoordinator.js";
import { TriggerService } from "../../Triggers/Service/TriggerService.js";
import { VoiceChannelMissingError } from "../Error/VoiceChannelMissingError.js";
import { VoiceChannelUnavailableError } from "../Error/VoiceChannelUnavailableError.js";
import { TemporaryChannelService } from "../Service/TemporaryChannelService.js";
import { VoiceEntryService } from "../Service/VoiceEntryService.js";
import { VoiceChannelGatewayToken } from "../Token/VoiceChannelGatewayToken.js";
import { DeleteTemporaryChannelHandler } from "./DeleteTemporaryChannelHandler.js";

import type { OperationAdmissionClosedError } from "../../Core/Operation/Error/OperationAdmissionClosedError.js";
import type { OperationReentryError } from "../../Core/Operation/Error/OperationReentryError.js";
import type { DatabaseOperationError } from "../../Infrastructure/Database/Error/DatabaseOperationError.js";
import type { GuildVoiceSnapshotDto } from "../Dto/GuildVoiceSnapshotDto.js";
import type { VoiceChannelGatewayInterface } from "../Interface/VoiceChannelGatewayInterface.js";

@Injectable()
export class ReconcileGuildHandler {
  constructor(
    private readonly coordinator: KeyedOperationCoordinator,
    private readonly triggers: TriggerService,
    private readonly channels: TemporaryChannelService,
    private readonly entries: VoiceEntryService,
    private readonly deletion: DeleteTemporaryChannelHandler,
    @Inject(VoiceChannelGatewayToken) private readonly gateway: VoiceChannelGatewayInterface,
  ) {}

  /**
   * Traverses registered IDs; absence in a filtered channel list is never used as proof.
   * @throws {Promise<DatabaseOperationError>} Loading or reconciling saved state failed.
   * @throws {Promise<OperationReentryError>} A queue was reentered.
   * @throws {Promise<OperationAdmissionClosedError>} Admission is closed.
   * @throws {Promise<unknown>}
   * @throws {Promise<TypeError>} Writing a deletion diagnostic failed.
   */
  handle(snapshot: GuildVoiceSnapshotDto): Promise<boolean> {
    return this.coordinator.run(snapshot.guildId, async () => {
      for (const trigger of await this.triggers.list(snapshot.guildId)) {
        if (!this.entries.isCurrentSnapshot(snapshot)) {
          return false;
        }

        try {
          const channel = await this.gateway.getTriggerChannel(snapshot.guildId, trigger.channelId);

          if (!this.entries.isCurrentSnapshot(snapshot)) {
            return false;
          }

          if (channel.type !== ChannelType.GuildVoice || channel.isAfk) {
            await this.triggers.unwatch(
              snapshot.guildId,
              trigger.channelId,
              (await this.channels.count(snapshot.guildId, trigger.channelId)) > 0,
            );
          } else if (trigger.isActive) {
            this.entries.restoreWatchBoundary(snapshot, trigger.channelId);
          }
        } catch (error) {
          if (!this.entries.isCurrentSnapshot(snapshot)) {
            return false;
          }

          if (error instanceof VoiceChannelMissingError) {
            await this.triggers.removeDeleted(snapshot.guildId, trigger.channelId);
          } else if (error instanceof VoiceChannelUnavailableError) {
            if (trigger.isActive) {
              this.entries.restoreWatchBoundary(snapshot, trigger.channelId);
            }
          } else {
            throw error;
          }
        }

        await this.triggers.cleanup(
          snapshot.guildId,
          trigger.channelId,
          (await this.channels.count(snapshot.guildId, trigger.channelId)) > 0,
        );
      }

      for (const channel of await this.channels.list(snapshot.guildId)) {
        if (!this.entries.isCurrentSnapshot(snapshot)) {
          return false;
        }

        await this.deletion.deleteInCurrentOperation(snapshot.guildId, channel.channelId);
      }

      return this.entries.isCurrentSnapshot(snapshot);
    });
  }
}
