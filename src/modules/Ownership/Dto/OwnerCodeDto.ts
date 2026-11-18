import type { OwnerCodeKind } from "../Enum/OwnerCodeKind.js";

export class OwnerCodeDto {
  constructor(
    readonly hash: string,
    readonly kind: OwnerCodeKind,
    readonly expiresAt: number | null,
    readonly isRedeemed: boolean,
  ) {}
}
