/** A storage operation failed without exposing SQL, parameters or driver errors. */
export class DatabaseOperationError extends Error {
  constructor(readonly isBusy: boolean) {
    super(isBusy ? "Database is temporarily busy." : "Database operation failed.");
    this.name = "DatabaseOperationError";
  }
}
