import { Injectable } from "@nestjs/common";
import { VoiceChannelState } from "../Enum/VoiceChannelState.js";
import { TemporaryChannelRepository } from "../Repository/TemporaryChannelRepository.js";

import type { OperationReentryError } from "../../Core/Operation/Error/OperationReentryError.js";
import type { DatabaseOperationError } from "../../Infrastructure/Database/Error/DatabaseOperationError.js";
import type { TemporaryChannelDto } from "../Dto/TemporaryChannelDto.js";

@Injectable()
export class TemporaryChannelService {
  constructor(private readonly repository: TemporaryChannelRepository) {}

  /**
   * @throws {Promise<DatabaseOperationError>} Reading tracked guild channels failed.
   * @throws {Promise<OperationReentryError>} The connection queue was reentered.
   */
  list(guildId: string): Promise<TemporaryChannelDto[]> {
    return this.repository.list(guildId);
  }

  /**
   * @throws {Promise<DatabaseOperationError>} Removing tracked guild channels failed.
   * @throws {Promise<OperationReentryError>} The connection queue was reentered.
   */
  clearGuild(guildId: string): Promise<void> {
    return this.repository.removeGuild(guildId);
  }

  /**
   * @throws {Promise<DatabaseOperationError>} Reading channel identity failed.
   * @throws {Promise<OperationReentryError>} Called inside this connection's queue.
   */
  async isManaged(guildId: string, channelId: string): Promise<boolean> {
    const channel = await this.repository.find(channelId);

    return channel?.guildId === guildId;
  }

  /**
   * Includes all tracked channels, irrespective of their trigger or deletion budget.
   * @throws {Promise<DatabaseOperationError>} Counting channels failed.
   * @throws {Promise<OperationReentryError>} Called inside this connection's queue.
   */
  count(guildId: string, triggerChannelId?: string): Promise<number> {
    return this.repository.count(guildId, triggerChannelId);
  }

  /**
   * @throws {Promise<DatabaseOperationError>} Reading the tracked channel failed.
   * @throws {Promise<OperationReentryError>} Called inside this connection's queue.
   */
  async get(guildId: string, channelId: string): Promise<TemporaryChannelDto | null> {
    const channel = await this.repository.find(channelId);

    return channel?.guildId === guildId ? channel : null;
  }

  /**
   * @throws {Promise<DatabaseOperationError>} Saving the new identity failed.
   * @throws {Promise<OperationReentryError>} Called inside this connection's queue.
   */
  recordCreated(
    guildId: string,
    triggerChannelId: string,
    userId: string,
    channelId: string,
  ): Promise<void> {
    return this.repository.add({
      guildId,
      triggerChannelId,
      ownerId: userId,
      channelId,
      deleteAttempts: 0,
      createdAt: Date.now(),
    });
  }

  /**
   * Only a reliably empty channel may spend its persistent deletion budget.
   * @throws {Promise<DatabaseOperationError>} Reserving the attempt failed.
   * @throws {Promise<OperationReentryError>} Called inside this connection's queue.
   */
  async reserveDeletion(channelId: string, state: VoiceChannelState): Promise<boolean> {
    return (
      state === VoiceChannelState.Empty && (await this.repository.reserveDeleteAttempt(channelId))
    );
  }

  /**
   * Called after Discord deletion or confirmed absence, never after an access error.
   * @throws {Promise<DatabaseOperationError>} Removing the identity failed.
   * @throws {Promise<OperationReentryError>} Called inside this connection's queue.
   */
  removeConfirmed(channelId: string): Promise<void> {
    return this.repository.remove(channelId);
  }
}
