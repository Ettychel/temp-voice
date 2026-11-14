import { sprintf } from "sprintf-js";

/** Environment validation failed; values and credentials are never included. */
export class ConfigurationError extends Error {
  private static readonly MESSAGE = "Invalid configuration: %(settings)s.";

  constructor(settings: readonly string[]) {
    super(sprintf(ConfigurationError.MESSAGE, { settings: settings.join(", ") }));
    this.name = "ConfigurationError";
  }
}
