import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { ConfigurationError } from "./config/env/Error/ConfigurationError.js";
import { ApplicationLogEvent } from "./modules/App/Enum/ApplicationLogEvent.js";
import { CliModule } from "./modules/Cli/CliModule.js";
import { JsonLogger } from "./modules/Logging/Service/JsonLogger.js";

try {
  const app = await NestFactory.createApplicationContext(CliModule, {
    logger: new JsonLogger(),
    abortOnError: false,
  });

  try {
    app.get(JsonLogger).error({
      event: ApplicationLogEvent.CliCommandUnavailable,
      reason: "Operator commands are not implemented yet.",
    });

    process.exitCode = 1;
  } finally {
    await app.close();
  }
} catch (error) {
  new JsonLogger().error({
    event: ApplicationLogEvent.CliInitializationFailed,
    reason: error instanceof ConfigurationError ? error.message : "CLI initialization failed.",
  });

  process.exitCode = 1;
}
