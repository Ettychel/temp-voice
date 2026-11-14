import { Injectable } from "@nestjs/common";
import { CreationBlockReason } from "../Enum/CreationBlockReason.js";
import { InvalidChannelLimitError } from "../Error/InvalidChannelLimitError.js";
import { GuildLimitRepository } from "../Repository/GuildLimitRepository.js";

import type { OperationReentryError } from "../../Core/Operation/Error/OperationReentryError.js";
import type { DatabaseOperationError } from "../../Infrastructure/Database/Error/DatabaseOperationError.js";
import type { CreationLimitFactsDto } from "../Dto/CreationLimitFactsDto.js";

@Injectable()
export class LimitsService {
  private static readonly COOLDOWN_MS = 5000;
  private readonly cooldowns = new Map<string, Map<string, number>>();

  constructor(private readonly repository: GuildLimitRepository) {}

  /**
   * @throws {Promise<DatabaseOperationError>} Removing the guild limit failed.
   * @throws {Promise<OperationReentryError>} The connection queue was reentered.
   */
  async clearGuild(guildId: string): Promise<void> {
    await this.repository.set(guildId, null);
    this.cooldowns.delete(guildId);
  }

  /** @throws {InvalidChannelLimitError} Zero or a positive safe integer is required. */
  normalizeLimit(limit: number): number | null {
    if (!Number.isSafeInteger(limit) || limit < 0) {
      throw new InvalidChannelLimitError();
    }

    return limit === 0 ? null : limit;
  }

  /**
   * @throws {Promise<DatabaseOperationError>} Reading the limit failed.
   * @throws {Promise<OperationReentryError>} Called inside this connection's queue.
   */
  getGuildLimit(guildId: string): Promise<number | null> {
    return this.repository.get(guildId);
  }

  /**
   * Existing channels are unaffected by a lower limit.
   * @throws {Promise<InvalidChannelLimitError>} The limit is invalid.
   * @throws {Promise<DatabaseOperationError>} Writing the limit failed.
   * @throws {Promise<OperationReentryError>} Called inside this connection's queue.
   */
  async setGuildLimit(guildId: string, limit: number): Promise<void> {
    return this.repository.set(guildId, this.normalizeLimit(limit));
  }

  getCreationBlockReason(
    guildId: string,
    userId: string,
    facts: CreationLimitFactsDto,
  ): CreationBlockReason | null {
    const expiresAt = this.cooldowns.get(guildId)?.get(userId);

    if (expiresAt !== undefined && expiresAt > Date.now()) {
      return CreationBlockReason.Cooldown;
    }

    if (facts.guildLimit !== null && facts.guildChannelCount >= facts.guildLimit) {
      return CreationBlockReason.GuildLimit;
    }

    if (facts.triggerLimit !== null && facts.triggerChannelCount >= facts.triggerLimit) {
      return CreationBlockReason.TriggerLimit;
    }

    return null;
  }

  /** Called only after a channel was persisted and the creator successfully moved. */
  recordSuccessfulCreation(guildId: string, userId: string): void {
    const now = Date.now();
    const guildCooldowns = this.cooldowns.get(guildId) ?? new Map<string, number>();

    for (const [user, expiresAt] of guildCooldowns) {
      if (expiresAt <= now) {
        guildCooldowns.delete(user);
      }
    }

    guildCooldowns.set(userId, now + LimitsService.COOLDOWN_MS);
    this.cooldowns.set(guildId, guildCooldowns);
  }
}
