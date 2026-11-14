import { Injectable } from "@nestjs/common";
import { ChannelType } from "discord.js";
import { WatchTriggerResult } from "../Enum/WatchTriggerResult.js";
import { InvalidTriggerChannelError } from "../Error/InvalidTriggerChannelError.js";
import { TriggerPermissionsError } from "../Error/TriggerPermissionsError.js";
import { TriggerRepository } from "../Repository/TriggerRepository.js";

import type { OperationReentryError } from "../../Core/Operation/Error/OperationReentryError.js";
import type { DatabaseOperationError } from "../../Infrastructure/Database/Error/DatabaseOperationError.js";
import type { TriggerChannelDto } from "../Dto/TriggerChannelDto.js";
import type { TriggerSettingsDto } from "../Dto/TriggerSettingsDto.js";

@Injectable()
export class TriggerService {
  constructor(private readonly repository: TriggerRepository) {}

  /**
   * @throws {Promise<DatabaseOperationError>} Reading guild configurations failed.
   * @throws {Promise<OperationReentryError>} The connection queue was reentered.
   */
  list(guildId: string): Promise<TriggerSettingsDto[]> {
    return this.repository.list(guildId);
  }

  /**
   * @throws {Promise<DatabaseOperationError>} Removing guild configurations failed.
   * @throws {Promise<OperationReentryError>} The connection queue was reentered.
   */
  clearGuild(guildId: string): Promise<void> {
    return this.repository.removeGuild(guildId);
  }

  /**
   * @throws {Promise<DatabaseOperationError>} Reading settings failed.
   * @throws {Promise<OperationReentryError>} Called inside this connection's queue.
   */
  get(guildId: string, channelId: string): Promise<TriggerSettingsDto | null> {
    return this.repository.find(guildId, channelId);
  }

  /**
   * @throws {Promise<InvalidTriggerChannelError>} The channel is unsuitable.
   * @throws {Promise<TriggerPermissionsError>} Required bot permissions are missing.
   * @throws {Promise<DatabaseOperationError>} Reading or activating the trigger failed.
   * @throws {Promise<OperationReentryError>} Called inside this connection's queue.
   */
  async watch(channel: TriggerChannelDto, isTemporary: boolean): Promise<WatchTriggerResult> {
    this.assertCanManage(channel, isTemporary);

    const settings = await this.repository.find(channel.guildId, channel.channelId);

    if (settings?.isActive) {
      return WatchTriggerResult.AlreadyActive;
    }

    await this.repository.activate(channel.guildId, channel.channelId, Date.now());

    return WatchTriggerResult.Registered;
  }

  /**
   * @throws {Promise<DatabaseOperationError>} Changing observation failed.
   * @throws {Promise<OperationReentryError>} Called inside this connection's queue.
   */
  async unwatch(guildId: string, channelId: string, hasRelatedChannels: boolean): Promise<void> {
    const settings = await this.repository.find(guildId, channelId);

    if (settings === null) {
      return;
    }

    if (settings.channelLimit === null && !hasRelatedChannels) {
      await this.repository.remove(guildId, channelId);
    } else if (settings.isActive) {
      await this.repository.deactivate(guildId, channelId);
    }
  }

  /**
   * Stores a limit normalized by LimitsService; registration is unchanged.
   * @throws {Promise<InvalidTriggerChannelError>} The channel is unsuitable.
   * @throws {Promise<DatabaseOperationError>} Changing the configuration failed.
   * @throws {Promise<OperationReentryError>} Called inside this connection's queue.
   */
  async setLimit(
    channel: TriggerChannelDto,
    isTemporary: boolean,
    limit: number | null,
    hasRelatedChannels: boolean,
  ): Promise<void> {
    this.assertSuitable(channel, isTemporary);
    const settings = await this.repository.find(channel.guildId, channel.channelId);

    if (limit === null && !settings?.isActive && !hasRelatedChannels) {
      await this.repository.remove(channel.guildId, channel.channelId);
    } else {
      await this.repository.setLimit(channel.guildId, channel.channelId, limit, Date.now());
    }
  }

  /**
   * Physical deletion also clears the individual limit.
   * @throws {Promise<DatabaseOperationError>} Removing settings failed.
   * @throws {Promise<OperationReentryError>} Called inside this connection's queue.
   */
  removeDeleted(guildId: string, channelId: string): Promise<void> {
    return this.repository.remove(guildId, channelId);
  }

  /**
   * @throws {Promise<DatabaseOperationError>} Reading or cleaning settings failed.
   * @throws {Promise<OperationReentryError>} Called inside this connection's queue.
   */
  async cleanup(guildId: string, channelId: string, hasRelatedChannels: boolean): Promise<void> {
    const settings = await this.repository.find(guildId, channelId);

    if (settings && !settings.isActive && settings.channelLimit === null && !hasRelatedChannels) {
      await this.repository.remove(guildId, channelId);
    }
  }

  /**
   * Reused immediately before creation with current facts.
   * @throws {InvalidTriggerChannelError} The channel is unsuitable.
   * @throws {TriggerPermissionsError} Required bot permissions are missing.
   */
  assertCanManage(channel: TriggerChannelDto, isTemporary: boolean): void {
    this.assertSuitable(channel, isTemporary);

    if (!channel.canManage) {
      throw new TriggerPermissionsError();
    }
  }

  /** @throws {InvalidTriggerChannelError} Only a suitable ordinary voice channel can be configured. */
  private assertSuitable(channel: TriggerChannelDto, isTemporary: boolean): void {
    if (channel.type !== ChannelType.GuildVoice || channel.isAfk || isTemporary) {
      throw new InvalidTriggerChannelError();
    }
  }
}
