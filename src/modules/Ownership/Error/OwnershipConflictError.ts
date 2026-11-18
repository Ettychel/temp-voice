/** Ownership changed concurrently; retry with fresh state, without spending a claim attempt. */
export class OwnershipConflictError extends Error {
  constructor() {
    super("Ownership changed during the operation. Please retry.");
    this.name = "OwnershipConflictError";
  }
}
