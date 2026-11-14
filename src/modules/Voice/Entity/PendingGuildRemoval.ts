import { Entity, PrimaryColumn } from "typeorm";

/** Persists confirmed removal until all owning modules have cleared their guild data. */
@Entity("pending_guild_removals")
export class PendingGuildRemoval {
  @PrimaryColumn({ name: "guild_id", type: "text" })
  guildId!: string;
}
