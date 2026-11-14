import { EnvVariableGroupsConst } from "./Const/EnvVariableGroupsConst.js";
import { ValidateEnvGroup } from "./ValidateEnvGroup.js";

import type { ConfigurationError } from "./Error/ConfigurationError.js";
import type { EnvironmentVariablesType } from "./Type/EnvironmentVariablesType.js";

/** @throws {ConfigurationError} At least one environment group is invalid. */
export function ValidateEnv(environment: Record<string, unknown>): EnvironmentVariablesType {
  const groups = EnvVariableGroupsConst.map((group) => ValidateEnvGroup(group, environment));

  return Object.assign({}, ...groups) as EnvironmentVariablesType;
}
