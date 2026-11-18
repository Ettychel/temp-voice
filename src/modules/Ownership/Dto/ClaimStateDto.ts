import type { ClaimAttempt } from "../Entity/ClaimAttempt.js";
import type { ClaimStateRowType } from "../Type/ClaimStateRowType.js";

export class ClaimStateDto {
  constructor(
    readonly codeHash: string | null,
    readonly codeExpiresAt: number | null,
    readonly isRedeemed: boolean,
    readonly failures: number | null,
    readonly blockedUntil: number | null,
  ) {}

  static fromRaw(
    state: ClaimStateRowType | undefined,
    attempt: ClaimAttempt | null = null,
  ): ClaimStateDto {
    return new ClaimStateDto(
      state?.codeHash ?? null,
      state?.codeExpiresAt ?? null,
      Boolean(state?.isRedeemed),
      state?.failures ?? attempt?.failures ?? null,
      state?.blockedUntil ?? attempt?.blockedUntil ?? null,
    );
  }
}
