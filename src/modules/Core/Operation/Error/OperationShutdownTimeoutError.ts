/** Accepted operations did not finish before the process shutdown deadline. */
export class OperationShutdownTimeoutError extends Error {
  constructor() {
    super("Active operations did not finish within the shutdown deadline.");
    this.name = "OperationShutdownTimeoutError";
  }
}
