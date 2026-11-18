/** The caller is not the current global owner. */
export class OwnerAccessDeniedError extends Error {
  constructor() {
    super("Only the current bot owner can perform this operation.");
    this.name = "OwnerAccessDeniedError";
  }
}
