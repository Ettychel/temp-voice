import { DatabaseEnvVariables } from "../Variables/DatabaseEnvVariables.js";
import { DiscordEnvVariables } from "../Variables/DiscordEnvVariables.js";
import { HealthEnvVariables } from "../Variables/HealthEnvVariables.js";

import type { ClassConstructor } from "class-transformer";

export const EnvVariableGroupsConst: readonly ClassConstructor<object>[] = [
  DatabaseEnvVariables,
  DiscordEnvVariables,
  HealthEnvVariables,
];
