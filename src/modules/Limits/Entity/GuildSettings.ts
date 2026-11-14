import { Check, Column, Entity, PrimaryColumn } from "typeorm";

@Entity("guild_settings")
@Check(
  "CHK_guild_settings_limit",
  '"channel_limit" IS NULL OR (typeof("channel_limit") = \'integer\' AND "channel_limit" > 0)',
)
export class GuildSettings {
  @PrimaryColumn({ name: "guild_id", type: "text" })
  guildId!: string;

  @Column({ name: "channel_limit", type: "integer", nullable: true })
  channelLimit!: number | null;
}
