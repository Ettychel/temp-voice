import { Check, Column, Entity, PrimaryColumn } from "typeorm";

@Entity("bot_owner")
@Check("CHK_bot_owner_singleton", '"id" = 1')
export class BotOwner {
  static readonly SINGLETON_ID = 1;

  @PrimaryColumn({ type: "integer" })
  id: number = BotOwner.SINGLETON_ID;

  @Column({ name: "user_id", type: "text" })
  userId!: string;
}
