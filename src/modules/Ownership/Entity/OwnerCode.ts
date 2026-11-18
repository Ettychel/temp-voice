import { Check, Column, Entity, PrimaryColumn } from "typeorm";
import { OwnerCodeKind } from "../Enum/OwnerCodeKind.js";

@Entity("owner_codes")
@Check("CHK_owner_codes_singleton", '"id" = 1')
export class OwnerCode {
  static readonly SINGLETON_ID = 1;

  @PrimaryColumn({ type: "integer" })
  id: number = OwnerCode.SINGLETON_ID;

  @Column({ type: "text" })
  hash!: string;

  @Column({ type: "simple-enum", enum: OwnerCodeKind })
  kind!: OwnerCodeKind;

  @Column({ name: "expires_at", type: "integer", nullable: true })
  expiresAt!: number | null;

  @Column({ name: "is_redeemed", type: "boolean", default: false })
  isRedeemed!: boolean;
}
