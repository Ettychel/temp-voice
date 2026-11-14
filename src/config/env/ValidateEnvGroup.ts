import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validateSync } from "class-validator";
import { ConfigurationError } from "./Error/ConfigurationError.js";

import type { ClassConstructor } from "class-transformer";

/** @throws {ConfigurationError} The group contains invalid environment values. */
export function ValidateEnvGroup<T extends object>(
  group: ClassConstructor<T>,
  environment: Record<string, unknown>,
): T {
  const validated = plainToInstance(group, environment, {
    enableImplicitConversion: true,
    excludeExtraneousValues: true,
    exposeDefaultValues: true,
  });

  const errors = validateSync(validated, {
    skipMissingProperties: false,
    validationError: { target: false, value: false },
  });

  if (errors.length > 0) {
    throw new ConfigurationError(errors.map((error) => error.property));
  }

  return validated;
}
