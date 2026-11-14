/** New or queued work cannot start after operation admission has been closed. */
export class OperationAdmissionClosedError extends Error {
  constructor() {
    super("The application no longer accepts new operations.");
    this.name = "OperationAdmissionClosedError";
  }
}
