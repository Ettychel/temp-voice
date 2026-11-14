import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import { DatabaseOperationExecutor } from "../../Infrastructure/Database/Service/DatabaseOperationExecutor.js";
import { PendingGuildRemoval } from "../Entity/PendingGuildRemoval.js";

import type { OperationReentryError } from "../../Core/Operation/Error/OperationReentryError.js";
import type { DatabaseOperationError } from "../../Infrastructure/Database/Error/DatabaseOperationError.js";

@Injectable()
export class GuildRemovalRepository {
  constructor(
    private readonly dataSource: DataSource,
    private readonly executor: DatabaseOperationExecutor,
  ) {}

  /**
   * @throws {Promise<DatabaseOperationError>} Saving confirmed removal failed.
   * @throws {Promise<OperationReentryError>} The connection queue was reentered.
   */
  async mark(guildId: string): Promise<void> {
    await this.executor.run(async () => {
      await this.dataSource
        .getRepository(PendingGuildRemoval)
        .createQueryBuilder()
        .insert()
        .values({ guildId })
        .orIgnore()
        .execute();
    });
  }

  /**
   * @throws {Promise<DatabaseOperationError>} Reading unfinished removals failed.
   * @throws {Promise<OperationReentryError>} The connection queue was reentered.
   */
  pending(): Promise<string[]> {
    return this.executor.run(async () =>
      (await this.dataSource.getRepository(PendingGuildRemoval).find()).map((row) => row.guildId),
    );
  }

  /**
   * @throws {Promise<DatabaseOperationError>} Completing confirmed removal failed.
   * @throws {Promise<OperationReentryError>} The connection queue was reentered.
   */
  async complete(guildId: string): Promise<void> {
    await this.executor.run(async () => {
      await this.dataSource.getRepository(PendingGuildRemoval).delete({ guildId });
    });
  }
}
