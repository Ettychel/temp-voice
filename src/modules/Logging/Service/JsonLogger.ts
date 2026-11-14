import { Injectable } from "@nestjs/common";

import type { LoggerService, LogLevel } from "@nestjs/common";
import type { JsonLogContextDto } from "../Dto/JsonLogContextDto.js";

/** Callers supply safe messages, never secrets or raw third-party objects. */
@Injectable()
export class JsonLogger implements LoggerService {
  private static readonly DEFAULT_EVENT = "application.message";
  private static readonly CONTEXT_FIELDS: readonly (keyof JsonLogContextDto)[] = [
    "event",
    "guildId",
    "channelId",
    "userId",
    "result",
    "reason",
  ];

  /**
   * @throws {TypeError}
   */
  log(message: unknown, ..._optionalParams: unknown[]): void {
    this.write("log", message);
  }

  /**
   * @throws {TypeError}
   */
  error(message: unknown, ..._optionalParams: unknown[]): void {
    this.write("error", message);
  }

  /**
   * @throws {TypeError}
   */
  warn(message: unknown, ..._optionalParams: unknown[]): void {
    this.write("warn", message);
  }

  /**
   * @throws {TypeError}
   */
  debug(message: unknown, ..._optionalParams: unknown[]): void {
    this.write("debug", message);
  }

  /**
   * @throws {TypeError}
   */
  verbose(message: unknown, ..._optionalParams: unknown[]): void {
    this.write("verbose", message);
  }

  /**
   * @throws {TypeError}
   */
  fatal(message: unknown, ..._optionalParams: unknown[]): void {
    this.write("fatal", message);
  }

  /**
   * @throws {TypeError}
   */
  private write(level: LogLevel, message: unknown): void {
    const context: Record<string, string> = { event: JsonLogger.DEFAULT_EVENT };

    if (typeof message === "string") {
      context.message = message;
    } else if (
      typeof message === "object" &&
      message !== null &&
      "event" in message &&
      typeof message.event === "string"
    ) {
      for (const field of JsonLogger.CONTEXT_FIELDS) {
        const value: unknown = Reflect.get(message, field);

        if (typeof value === "string") {
          context[field] = value;
        }
      }
    }

    console.log(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        level,
        ...context,
      }),
    );
  }
}
