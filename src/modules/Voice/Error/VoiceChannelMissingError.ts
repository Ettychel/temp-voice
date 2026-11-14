import { VoiceChannelUnavailableError } from "./VoiceChannelUnavailableError.js";

/** A direct API response confirmed channel absence in a currently available guild. */
export class VoiceChannelMissingError extends VoiceChannelUnavailableError {
  constructor() {
    super();
    this.name = "VoiceChannelMissingError";
  }
}
