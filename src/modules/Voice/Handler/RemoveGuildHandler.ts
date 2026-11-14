import { Injectable } from "@nestjs/common";
import { KeyedOperationCoordinator } from "../../Core/Operation/Service/KeyedOperationCoordinator.js";
import { LimitsService } from "../../Limits/Service/LimitsService.js";
import { TriggerService } from "../../Triggers/Service/TriggerService.js";
import { GuildRemovalRepository } from "../Repository/GuildRemovalRepository.js";
import { TemporaryChannelService } from "../Service/TemporaryChannelService.js";

import type { OperationAdmissionClosedError } from "../../Core/Operation/Error/OperationAdmissionClosedError.js";
import type { OperationReentryError } from "../../Core/Operation/Error/OperationReentryError.js";
import type { DatabaseOperationError } from "../../Infrastructure/Database/Error/DatabaseOperationError.js";

@Injectable()
export class RemoveGuildHandler {
  constructor(
    private readonly coordinator: KeyedOperationCoordinator,
    private readonly removals: GuildRemovalRepository,
    private readonly channels: TemporaryChannelService,
    private readonly triggers: TriggerService,
    private readonly limits: LimitsService,
  ) {}

  /**
   * Call only for confirmed removal, never cache omission or temporary unavailability.
   * @throws {Promise<DatabaseOperationError>} Cleanup failed; its marker remains for restart.
   * @throws {Promise<OperationReentryError>} A queue was reentered.
   * @throws {Promise<OperationAdmissionClosedError>} Admission is closed.
   * @throws {Promise<unknown>}
   */
  handle(guildId: string): Promise<void> {
    return this.coordinator.run(guildId, async () => {
      await this.removals.mark(guildId);
      await this.channels.clearGuild(guildId);
      await this.triggers.clearGuild(guildId);
      await this.limits.clearGuild(guildId);
      await this.removals.complete(guildId);
    });
  }

  /**
   * @throws {Promise<DatabaseOperationError>} Restoring cleanup failed before Discord login.
   * @throws {Promise<OperationReentryError>} A queue was reentered.
   * @throws {Promise<OperationAdmissionClosedError>} Admission is closed.
   * @throws {Promise<unknown>} Propagates an operation failure.
   */
  async restorePending(availableGuildId?: string): Promise<void> {
    for (const guildId of await this.removals.pending()) {
      if (availableGuildId === undefined || availableGuildId === guildId) {
        await this.handle(guildId);
      }
    }
  }
}
