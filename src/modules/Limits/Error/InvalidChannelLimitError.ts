/** A channel limit must be a nonnegative safe integer; zero removes the limit. */
export class InvalidChannelLimitError extends Error {
  constructor() {
    super("Channel limit must be a nonnegative safe integer.");
    this.name = "InvalidChannelLimitError";
  }
}
