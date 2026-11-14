import { Injectable } from "@nestjs/common";
import { KeyedOperationCoordinator } from "../../Core/Operation/Service/KeyedOperationCoordinator.js";
import { TriggerService } from "../../Triggers/Service/TriggerService.js";
import { TemporaryChannelService } from "../Service/TemporaryChannelService.js";
import { VoiceEntryService } from "../Service/VoiceEntryService.js";

import type { OperationAdmissionClosedError } from "../../Core/Operation/Error/OperationAdmissionClosedError.js";
import type { OperationReentryError } from "../../Core/Operation/Error/OperationReentryError.js";
import type { DatabaseOperationError } from "../../Infrastructure/Database/Error/DatabaseOperationError.js";

@Injectable()
export class SynchronizeTriggerHandler {
  constructor(
    private readonly coordinator: KeyedOperationCoordinator,
    private readonly triggers: TriggerService,
    private readonly channels: TemporaryChannelService,
    private readonly entries: VoiceEntryService,
  ) {}

  /**
   * Gateway or SDK notification confirms deletion without a visibility-dependent lookup.
   * @throws {Promise<DatabaseOperationError>} Clearing confirmed channel deletion failed.
   * @throws {Promise<OperationReentryError>} The guild or database queue was reentered.
   * @throws {Promise<OperationAdmissionClosedError>} The application stopped accepting work.
   * @throws {Promise<unknown>}
   */
  channelDeleted(guildId: string, channelId: string): Promise<void> {
    return this.coordinator.run(guildId, async () => {
      const channel = await this.channels.get(guildId, channelId);
      await this.triggers.removeDeleted(guildId, channelId);
      this.entries.removeWatchBoundary(guildId, channelId);

      if (channel !== null) {
        await this.channels.removeConfirmed(channelId);

        await this.triggers.cleanup(
          guildId,
          channel.triggerChannelId,
          (await this.channels.count(guildId, channel.triggerChannelId)) > 0,
        );
      }
    });
  }

  /**
   * @throws {Promise<DatabaseOperationError>} Removing observation from the AFK channel failed.
   * @throws {Promise<OperationReentryError>} The guild or database queue was reentered.
   * @throws {Promise<OperationAdmissionClosedError>} The application stopped accepting work.
   * @throws {Promise<unknown>}
   */
  afkChanged(guildId: string, channelId: string | null): Promise<void> {
    if (channelId === null) {
      return Promise.resolve();
    }

    return this.coordinator.run(guildId, async () => {
      await this.triggers.unwatch(
        guildId,
        channelId,
        (await this.channels.count(guildId, channelId)) > 0,
      );

      this.entries.removeWatchBoundary(guildId, channelId);
    });
  }

  /**
   * @throws {Promise<DatabaseOperationError>} Cleaning the unused configuration failed.
   * @throws {Promise<OperationReentryError>} The guild or database queue was reentered.
   * @throws {Promise<OperationAdmissionClosedError>} The application stopped accepting work.
   * @throws {Promise<unknown>}
   */
  cleanup(guildId: string, channelId: string): Promise<void> {
    return this.coordinator.run(guildId, async () => {
      await this.triggers.cleanup(
        guildId,
        channelId,
        (await this.channels.count(guildId, channelId)) > 0,
      );
    });
  }
}
