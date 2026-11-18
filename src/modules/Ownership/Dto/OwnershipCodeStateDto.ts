import type { OwnershipCodeStateRowType } from "../Type/OwnershipCodeStateRowType.js";

export class OwnershipCodeStateDto {
  constructor(
    readonly ownerId: string | null,
    readonly codeHash: string | null,
    readonly isRedeemed: boolean,
  ) {}

  static fromRaw(state: OwnershipCodeStateRowType | undefined): OwnershipCodeStateDto {
    return new OwnershipCodeStateDto(
      state?.ownerId ?? null,
      state?.codeHash ?? null,
      Boolean(state?.isRedeemed),
    );
  }
}
