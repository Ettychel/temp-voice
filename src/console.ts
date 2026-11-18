import "reflect-metadata";
import { CommandFactory } from "nest-commander";
import { ConfigurationError } from "./config/env/Error/ConfigurationError.js";
import { ApplicationLogEvent } from "./modules/App/Enum/ApplicationLogEvent.js";
import { CliModule } from "./modules/Cli/CliModule.js";
import { JsonLogger } from "./modules/Logging/Service/JsonLogger.js";

try {
  await CommandFactory.run(CliModule, {
    abortOnError: false,
    /** @throws {Error} Unwind Commander exits so CommandFactory can close the context. */
    errorHandler: (error) => {
      throw error;
    },
    /** @throws {Error} Unexpected command execution errors reach the safe startup handler. */
    serviceErrorHandler: (error) => {
      if ("exitCode" in error && typeof error.exitCode === "number") {
        process.exitCode = error.exitCode;

        return;
      }

      throw error;
    },
  });
} catch (error) {
  new JsonLogger().error({
    event: ApplicationLogEvent.CliInitializationFailed,
    reason: error instanceof ConfigurationError ? error.message : "CLI initialization failed.",
  });

  process.exitCode = 1;
}
