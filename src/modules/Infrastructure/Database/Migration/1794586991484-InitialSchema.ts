import type { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1794586991484 implements MigrationInterface {
  name = "InitialSchema1794586991484";

  /** @throws {Promise<Error>} A schema statement failed; the migration is rolled back. */
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "guild_settings" ("guild_id" text PRIMARY KEY NOT NULL, "channel_limit" integer, CONSTRAINT "CHK_guild_settings_limit" CHECK ("channel_limit" IS NULL OR (typeof("channel_limit") = 'integer' AND "channel_limit" > 0)))`,
    );

    await queryRunner.query(
      `CREATE TABLE "bot_owner" ("id" integer PRIMARY KEY NOT NULL, "user_id" text NOT NULL, CONSTRAINT "CHK_bot_owner_singleton" CHECK ("id" = 1))`,
    );

    await queryRunner.query(
      `CREATE TABLE "claim_attempts" ("user_id" text PRIMARY KEY NOT NULL, "failures" integer NOT NULL DEFAULT (0), "blocked_until" integer, CONSTRAINT "CHK_claim_attempts_failures" CHECK (typeof("failures") = 'integer' AND "failures" BETWEEN 0 AND 5))`,
    );

    await queryRunner.query(
      `CREATE TABLE "owner_codes" ("id" integer PRIMARY KEY NOT NULL, "hash" text NOT NULL, "kind" varchar CHECK( "kind" IN ('initial','transfer','recovery') ) NOT NULL, "expires_at" integer, CONSTRAINT "CHK_owner_codes_singleton" CHECK ("id" = 1))`,
    );

    await queryRunner.query(
      `CREATE TABLE "voice_triggers" ("guild_id" text NOT NULL, "channel_id" text NOT NULL, "is_active" boolean NOT NULL DEFAULT (0), "channel_limit" integer, "created_at" integer NOT NULL, CONSTRAINT "CHK_voice_triggers_active" CHECK ("is_active" IN (0, 1)), CONSTRAINT "CHK_voice_triggers_limit" CHECK ("channel_limit" IS NULL OR (typeof("channel_limit") = 'integer' AND "channel_limit" > 0)), PRIMARY KEY ("guild_id", "channel_id"))`,
    );

    await queryRunner.query(
      `CREATE TABLE "temporary_channels" ("channel_id" text PRIMARY KEY NOT NULL, "guild_id" text NOT NULL, "trigger_channel_id" text NOT NULL, "owner_id" text NOT NULL, "delete_attempts" integer NOT NULL DEFAULT (0), "created_at" integer NOT NULL, CONSTRAINT "CHK_temporary_channels_attempts" CHECK (typeof("delete_attempts") = 'integer' AND "delete_attempts" BETWEEN 0 AND 3))`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_temporary_channels_owner" ON "temporary_channels" ("owner_id") `,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_temporary_channels_trigger" ON "temporary_channels" ("guild_id", "trigger_channel_id") `,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_temporary_channels_guild" ON "temporary_channels" ("guild_id") `,
    );
  }

  /** @throws {Promise<Error>} A schema rollback statement failed. */
  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_temporary_channels_guild"`);
    await queryRunner.query(`DROP INDEX "IDX_temporary_channels_trigger"`);
    await queryRunner.query(`DROP INDEX "IDX_temporary_channels_owner"`);
    await queryRunner.query(`DROP TABLE "temporary_channels"`);
    await queryRunner.query(`DROP TABLE "voice_triggers"`);
    await queryRunner.query(`DROP TABLE "owner_codes"`);
    await queryRunner.query(`DROP TABLE "claim_attempts"`);
    await queryRunner.query(`DROP TABLE "bot_owner"`);
    await queryRunner.query(`DROP TABLE "guild_settings"`);
  }
}
