import { Check, Column, Entity, PrimaryColumn } from "typeorm";

@Entity("claim_attempts")
@Check(
  "CHK_claim_attempts_failures",
  'typeof("failures") = \'integer\' AND "failures" BETWEEN 0 AND 5',
)
export class ClaimAttempt {
  @PrimaryColumn({ name: "user_id", type: "text" })
  userId!: string;

  @Column({ type: "integer", default: 0 })
  failures!: number;

  @Column({ name: "blocked_until", type: "integer", nullable: true })
  blockedUntil!: number | null;
}
