import type { DatabaseEnvVariables } from "../Variables/DatabaseEnvVariables.js";
import type { DiscordEnvVariables } from "../Variables/DiscordEnvVariables.js";
import type { HealthEnvVariables } from "../Variables/HealthEnvVariables.js";

export type EnvironmentVariablesType = DatabaseEnvVariables &
  DiscordEnvVariables &
  HealthEnvVariables;
