/** An operation attempted to acquire a coordinator key it already holds. */
export class OperationReentryError extends Error {
  constructor() {
    super("An operation cannot acquire the same queue recursively.");
    this.name = "OperationReentryError";
  }
}
