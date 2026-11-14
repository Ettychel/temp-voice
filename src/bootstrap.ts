import { NestFactory } from "@nestjs/core";
import { AppModule } from "./modules/App/AppModule.js";
import { JsonLogger } from "./modules/Logging/Service/JsonLogger.js";

import type { INestApplicationContext } from "@nestjs/common";

/**
 * Creates the standalone context without opening an HTTP listener.
 * @throws {Promise<Error>} Configuration or Nest initialization failed.
 */
export async function bootstrap(): Promise<INestApplicationContext> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: new JsonLogger(),
    abortOnError: false,
  });

  app.useLogger(app.get(JsonLogger));
  app.enableShutdownHooks();

  return app;
}
