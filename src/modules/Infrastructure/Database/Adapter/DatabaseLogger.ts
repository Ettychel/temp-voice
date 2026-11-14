import { AbstractLogger } from "typeorm";
import { JsonLogger } from "../../../Logging/Service/JsonLogger.js";

import type { LogLevel } from "typeorm";

/** Keeps driver SQL, parameters and raw migration errors out of application logs. */
export class DatabaseLogger extends AbstractLogger {
  private readonly logger = new JsonLogger();

  constructor() {
    super(["error", "warn"]);
  }

  /**
   * @throws {TypeError}
   */
  protected writeLog(level: LogLevel): void {
    if (level === "error") {
      this.logger.error("Database query failed.");
    } else if (level === "warn") {
      this.logger.warn("Database reported a warning.");
    } else {
      this.logger.log("Database reported a migration event.");
    }
  }
}
