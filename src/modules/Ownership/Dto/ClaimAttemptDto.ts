export class ClaimAttemptDto {
  constructor(
    readonly failures: number,
    readonly blockedUntil: number | null,
  ) {}
}
