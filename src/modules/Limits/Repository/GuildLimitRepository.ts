import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import { DatabaseOperationExecutor } from "../../Infrastructure/Database/Service/DatabaseOperationExecutor.js";
import { GuildSettings } from "../Entity/GuildSettings.js";

import type { OperationReentryError } from "../../Core/Operation/Error/OperationReentryError.js";
import type { DatabaseOperationError } from "../../Infrastructure/Database/Error/DatabaseOperationError.js";

@Injectable()
export class GuildLimitRepository {
  constructor(
    private readonly dataSource: DataSource,
    private readonly executor: DatabaseOperationExecutor,
  ) {}

  /**
   * @throws {Promise<DatabaseOperationError>} Reading the guild limit failed.
   * @throws {Promise<OperationReentryError>} Called inside this connection's queue.
   */
  get(guildId: string): Promise<number | null> {
    return this.executor.run(async () => {
      const settings = await this.dataSource.getRepository(GuildSettings).findOneBy({ guildId });

      return settings?.channelLimit ?? null;
    });
  }

  /**
   * @throws {Promise<DatabaseOperationError>} Writing the guild limit failed.
   * @throws {Promise<OperationReentryError>} Called inside this connection's queue.
   */
  async set(guildId: string, channelLimit: number | null): Promise<void> {
    await this.executor.run(async () => {
      const repository = this.dataSource.getRepository(GuildSettings);

      if (channelLimit === null) {
        await repository.delete({ guildId });
      } else {
        await repository.upsert({ guildId, channelLimit }, ["guildId"]);
      }
    });
  }
}
