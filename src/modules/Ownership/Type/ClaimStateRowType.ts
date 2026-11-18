export type ClaimStateRowType = {
  readonly codeHash: string;
  readonly codeExpiresAt: number | null;
  readonly isRedeemed: number;
  readonly failures: number | null;
  readonly blockedUntil: number | null;
};
