import type { ClaimResult } from "../Enum/ClaimResult.js";

export class ClaimResultDto {
  constructor(
    readonly result: ClaimResult,
    readonly blockedUntil: number | null,
  ) {}
}
