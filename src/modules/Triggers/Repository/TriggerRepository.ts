import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import { DatabaseOperationExecutor } from "../../Infrastructure/Database/Service/DatabaseOperationExecutor.js";
import { VoiceTrigger } from "../Entity/VoiceTrigger.js";

import type { OperationReentryError } from "../../Core/Operation/Error/OperationReentryError.js";
import type { DatabaseOperationError } from "../../Infrastructure/Database/Error/DatabaseOperationError.js";
import type { TriggerSettingsDto } from "../Dto/TriggerSettingsDto.js";

@Injectable()
export class TriggerRepository {
  constructor(
    private readonly dataSource: DataSource,
    private readonly executor: DatabaseOperationExecutor,
  ) {}

  /**
   * @throws {Promise<DatabaseOperationError>} Reading guild configurations failed.
   * @throws {Promise<OperationReentryError>} The connection queue was reentered.
   */
  list(guildId: string): Promise<TriggerSettingsDto[]> {
    return this.executor.run(async () =>
      (await this.dataSource.getRepository(VoiceTrigger).findBy({ guildId })).map((settings) => ({
        ...settings,
      })),
    );
  }

  /**
   * @throws {Promise<DatabaseOperationError>} Removing guild configurations failed.
   * @throws {Promise<OperationReentryError>} The connection queue was reentered.
   */
  async removeGuild(guildId: string): Promise<void> {
    await this.executor.run(async () => {
      await this.dataSource.getRepository(VoiceTrigger).delete({ guildId });
    });
  }

  /**
   * @throws {Promise<DatabaseOperationError>} Reading the trigger failed.
   * @throws {Promise<OperationReentryError>} Called inside this connection's queue.
   */
  find(guildId: string, channelId: string): Promise<TriggerSettingsDto | null> {
    return this.executor.run(async () => {
      const settings = await this.dataSource
        .getRepository(VoiceTrigger)
        .findOneBy({ guildId, channelId });

      return settings === null ? null : { ...settings };
    });
  }

  /**
   * Activates a trigger while retaining its existing limit and creation date.
   * @throws {Promise<DatabaseOperationError>} Writing the registration failed.
   * @throws {Promise<OperationReentryError>} Called inside this connection's queue.
   */
  async activate(guildId: string, channelId: string, createdAt: number): Promise<void> {
    await this.executor.run(async () => {
      await this.dataSource
        .getRepository(VoiceTrigger)
        .createQueryBuilder()
        .insert()
        .values({ guildId, channelId, isActive: true, channelLimit: null, createdAt })
        .orUpdate(["is_active"], ["guild_id", "channel_id"])
        .execute();
    });
  }

  /**
   * Configuring a limit alone does not activate a new trigger.
   * @throws {Promise<DatabaseOperationError>} Writing the limit failed.
   * @throws {Promise<OperationReentryError>} Called inside this connection's queue.
   */
  async setLimit(
    guildId: string,
    channelId: string,
    channelLimit: number | null,
    createdAt: number,
  ): Promise<void> {
    await this.executor.run(async () => {
      await this.dataSource
        .getRepository(VoiceTrigger)
        .createQueryBuilder()
        .insert()
        .values({ guildId, channelId, isActive: false, channelLimit, createdAt })
        .orUpdate(["channel_limit"], ["guild_id", "channel_id"])
        .execute();
    });
  }

  /**
   * @throws {Promise<DatabaseOperationError>} Removing active observation failed.
   * @throws {Promise<OperationReentryError>} Called inside this connection's queue.
   */
  async deactivate(guildId: string, channelId: string): Promise<void> {
    await this.executor.run(async () => {
      await this.dataSource
        .getRepository(VoiceTrigger)
        .update({ guildId, channelId }, { isActive: false });
    });
  }

  /**
   * Only this module's settings are removed; temporary channels have no cascading relation.
   * @throws {Promise<DatabaseOperationError>} Removing the configuration failed.
   * @throws {Promise<OperationReentryError>} Called inside this connection's queue.
   */
  async remove(guildId: string, channelId: string): Promise<void> {
    await this.executor.run(async () => {
      await this.dataSource.getRepository(VoiceTrigger).delete({ guildId, channelId });
    });
  }
}
