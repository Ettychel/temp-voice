import { Check, Column, Entity, PrimaryColumn } from "typeorm";

@Entity("voice_triggers")
@Check(
  "CHK_voice_triggers_limit",
  '"channel_limit" IS NULL OR (typeof("channel_limit") = \'integer\' AND "channel_limit" > 0)',
)
@Check("CHK_voice_triggers_active", '"is_active" IN (0, 1)')
export class VoiceTrigger {
  @PrimaryColumn({ name: "guild_id", type: "text" })
  guildId!: string;

  @PrimaryColumn({ name: "channel_id", type: "text" })
  channelId!: string;

  @Column({ name: "is_active", type: "boolean", default: false })
  isActive!: boolean;

  @Column({ name: "channel_limit", type: "integer", nullable: true })
  channelLimit!: number | null;

  @Column({ name: "created_at", type: "integer" })
  createdAt!: number;
}
