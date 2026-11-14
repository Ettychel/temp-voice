import { sprintf } from "sprintf-js";
import { Check, Column, Entity, Index, PrimaryColumn } from "typeorm";
import { MAXIMUM_DELETE_ATTEMPTS } from "../Constant/MaximumDeleteAttempts.js";

@Entity("temporary_channels")
@Index("IDX_temporary_channels_guild", ["guildId"])
@Index("IDX_temporary_channels_trigger", ["guildId", "triggerChannelId"])
@Index("IDX_temporary_channels_owner", ["ownerId"])
@Check(
  "CHK_temporary_channels_attempts",
  sprintf(
    'typeof("delete_attempts") = \'integer\' AND "delete_attempts" BETWEEN 0 AND %(maximum)d',
    { maximum: MAXIMUM_DELETE_ATTEMPTS },
  ),
)
export class TemporaryChannel {
  @PrimaryColumn({ name: "channel_id", type: "text" })
  channelId!: string;

  @Column({ name: "guild_id", type: "text" })
  guildId!: string;

  @Column({ name: "trigger_channel_id", type: "text" })
  triggerChannelId!: string;

  @Column({ name: "owner_id", type: "text" })
  ownerId!: string;

  @Column({ name: "delete_attempts", type: "integer", default: 0 })
  deleteAttempts!: number;

  @Column({ name: "created_at", type: "integer" })
  createdAt!: number;
}
