import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import { DatabaseOperationExecutor } from "../../Infrastructure/Database/Service/DatabaseOperationExecutor.js";
import { MAXIMUM_DELETE_ATTEMPTS } from "../Constant/MaximumDeleteAttempts.js";
import { TemporaryChannel } from "../Entity/TemporaryChannel.js";

import type { OperationReentryError } from "../../Core/Operation/Error/OperationReentryError.js";
import type { DatabaseOperationError } from "../../Infrastructure/Database/Error/DatabaseOperationError.js";
import type { TemporaryChannelDto } from "../Dto/TemporaryChannelDto.js";

@Injectable()
export class TemporaryChannelRepository {
  constructor(
    private readonly dataSource: DataSource,
    private readonly executor: DatabaseOperationExecutor,
  ) {}

  /**
   * @throws {Promise<DatabaseOperationError>} Reading tracked guild channels failed.
   * @throws {Promise<OperationReentryError>} The connection queue was reentered.
   */
  list(guildId: string): Promise<TemporaryChannelDto[]> {
    return this.executor.run(async () =>
      (await this.dataSource.getRepository(TemporaryChannel).findBy({ guildId })).map(
        (channel) => ({ ...channel }),
      ),
    );
  }

  /**
   * @throws {Promise<DatabaseOperationError>} Removing tracked guild channels failed.
   * @throws {Promise<OperationReentryError>} The connection queue was reentered.
   */
  async removeGuild(guildId: string): Promise<void> {
    await this.executor.run(async () => {
      await this.dataSource.getRepository(TemporaryChannel).delete({ guildId });
    });
  }

  /**
   * @throws {Promise<DatabaseOperationError>} The channel could not be saved.
   * @throws {Promise<OperationReentryError>} Called inside this connection's queue.
   */
  async add(channel: TemporaryChannelDto): Promise<void> {
    await this.executor.run(async () => {
      await this.dataSource.getRepository(TemporaryChannel).insert(channel);
    });
  }

  /**
   * @throws {Promise<DatabaseOperationError>} The channel could not be read.
   * @throws {Promise<OperationReentryError>} Called inside this connection's queue.
   */
  find(channelId: string): Promise<TemporaryChannelDto | null> {
    return this.executor.run(async () => {
      const channel = await this.dataSource
        .getRepository(TemporaryChannel)
        .findOneBy({ channelId });

      return channel === null ? null : { ...channel };
    });
  }

  /**
   * Counts all tracked channels, including orphans and exhausted deletion budgets.
   * @throws {Promise<DatabaseOperationError>} The count could not be read.
   * @throws {Promise<OperationReentryError>} Called inside this connection's queue.
   */
  count(guildId: string, triggerChannelId?: string): Promise<number> {
    return this.executor.run(() =>
      this.dataSource.getRepository(TemporaryChannel).countBy({
        guildId,
        ...(triggerChannelId === undefined ? {} : { triggerChannelId }),
      }),
    );
  }

  /**
   * Atomically spends one attempt before the caller makes its Discord request.
   * @throws {Promise<DatabaseOperationError>} The attempt could not be reserved.
   * @throws {Promise<OperationReentryError>} Called inside this connection's queue.
   */
  reserveDeleteAttempt(channelId: string): Promise<boolean> {
    return this.executor.run(async () => {
      const result = await this.dataSource
        .getRepository(TemporaryChannel)
        .createQueryBuilder()
        .update()
        .set({ deleteAttempts: () => '"delete_attempts" + 1' })
        .where('"channel_id" = :channelId', { channelId })
        .andWhere('"delete_attempts" < :maximum', { maximum: MAXIMUM_DELETE_ATTEMPTS })
        .execute();

      return result.affected === 1;
    });
  }

  /**
   * @throws {Promise<DatabaseOperationError>} The record could not be removed.
   * @throws {Promise<OperationReentryError>} Called inside this connection's queue.
   */
  async remove(channelId: string): Promise<void> {
    await this.executor.run(async () => {
      await this.dataSource.getRepository(TemporaryChannel).delete({ channelId });
    });
  }
}
