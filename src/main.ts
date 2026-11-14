import "reflect-metadata";
import { bootstrap } from "./bootstrap.js";
import { ConfigurationError } from "./config/env/Error/ConfigurationError.js";
import { ApplicationLogEvent } from "./modules/App/Enum/ApplicationLogEvent.js";
import { OperationLifetimeService } from "./modules/Core/Operation/Service/OperationLifetimeService.js";
import { JsonLogger } from "./modules/Logging/Service/JsonLogger.js";

let initialized = false;

try {
  const app = await bootstrap();
  initialized = true;

  app.get(JsonLogger).log({ event: ApplicationLogEvent.Started });
  await app.get(OperationLifetimeService).failure;
  process.exitCode = 1;
  await app.close();
} catch (error) {
  new JsonLogger().error({
    event: initialized
      ? ApplicationLogEvent.ShutdownFailed
      : ApplicationLogEvent.InitializationFailed,
    reason:
      error instanceof ConfigurationError
        ? error.message
        : initialized
          ? "Application shutdown failed."
          : "Application initialization failed.",
  });

  process.exit(1);
}
