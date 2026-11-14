/** The channel is not GuildVoice, is AFK, or is already a managed temporary channel. */
export class InvalidTriggerChannelError extends Error {
  constructor() {
    super("This channel cannot be used as a trigger.");
    this.name = "InvalidTriggerChannelError";
  }
}
