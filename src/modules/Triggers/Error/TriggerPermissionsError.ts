/** The bot cannot create and manage a complete copy of the voice trigger. */
export class TriggerPermissionsError extends Error {
  constructor() {
    super("The bot does not have the permissions required for this trigger.");
    this.name = "TriggerPermissionsError";
  }
}
