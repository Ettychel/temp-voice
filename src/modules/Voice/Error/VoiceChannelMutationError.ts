/** A Discord create, move or delete operation failed without exposing SDK error data. */
export class VoiceChannelMutationError extends Error {
  constructor() {
    super("The voice channel operation failed.");
    this.name = "VoiceChannelMutationError";
  }
}
