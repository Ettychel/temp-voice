/** The selected guild/channel does not belong to the bot's available voice configuration. */
export class InvalidCommandTargetError extends Error {
  constructor() {
    super("The selected guild or voice channel is unavailable.");
    this.name = "InvalidCommandTargetError";
  }
}
