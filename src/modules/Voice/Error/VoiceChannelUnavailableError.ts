/** The requested guild/channel cannot currently be read with reliable Discord data. */
export class VoiceChannelUnavailableError extends Error {
  constructor() {
    super("The requested voice channel is unavailable.");
    this.name = "VoiceChannelUnavailableError";
  }
}
