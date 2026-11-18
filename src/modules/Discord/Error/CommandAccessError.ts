/** The interaction context or caller permissions do not allow this command. */
export class CommandAccessError extends Error {
  constructor() {
    super("This interaction is not allowed.");
    this.name = "CommandAccessError";
  }
}
