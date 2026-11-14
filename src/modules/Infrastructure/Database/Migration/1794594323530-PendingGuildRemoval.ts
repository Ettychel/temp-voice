import type { MigrationInterface, QueryRunner } from "typeorm";

export class PendingGuildRemoval1794594323530 implements MigrationInterface {
  name = "PendingGuildRemoval1794594323530";

  /** @throws {Promise<Error>} A schema statement failed; the migration is rolled back. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "pending_guild_removals" ("guild_id" text PRIMARY KEY NOT NULL)`,
    );
  }

  /** @throws {Promise<Error>} A schema rollback statement failed. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "pending_guild_removals"`);
  }
}
