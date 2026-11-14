import { resolve } from "node:path";

import type { TransformFnParams } from "class-transformer";

/**
 * Normalizes valid path strings; validators reject invalid input unchanged.
 * @throws {TypeError}
 */
export function ResolveEnvPath(params: TransformFnParams): unknown {
  const value: unknown = params.value;

  if (typeof value !== "string" || value.trim().length === 0 || value.includes("\0")) {
    return value;
  }

  return resolve(value);
}
