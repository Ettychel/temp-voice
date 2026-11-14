import { Injectable } from "@nestjs/common";
import { KeyedOperationCoordinator } from "../../Core/Operation/Service/KeyedOperationCoordinator.js";
import { TriggerService } from "../../Triggers/Service/TriggerService.js";
import { TemporaryChannelService } from "../Service/TemporaryChannelService.js";
import { VoiceEntryService } from "../Service/VoiceEntryService.js";

import type { OperationAdmissionClosedError } from "../../Core/Operation/Error/OperationAdmissionClosedError.js";
import type { OperationReentryError } from "../../Core/Operation/Error/OperationReentryError.js";
import type { DatabaseOperationError } from "../../Infrastructure/Database/Error/DatabaseOperationError.js";

@Injectable()
export class UnwatchTriggerHandler {
  constructor(
    private readonly coordinator: KeyedOperationCoordinator,
    private readonly triggers: TriggerService,
    private readonly channels: TemporaryChannelService,
    private readonly entries: VoiceEntryService,
  ) {}

  /**
   * @throws {Promise<DatabaseOperationError>} Removing observation failed.
   * @throws {Promise<OperationReentryError>} The guild or database queue was reentered.
   * @throws {Promise<OperationAdmissionClosedError>} The application stopped accepting work.
   * @throws {Promise<unknown>}
   */
  handle(guildId: string, channelId: string): Promise<void> {
    return this.coordinator.run(guildId, async () => {
      await this.triggers.unwatch(
        guildId,
        channelId,
        (await this.channels.count(guildId, channelId)) > 0,
      );

      this.entries.removeWatchBoundary(guildId, channelId);
    });
  }
}
