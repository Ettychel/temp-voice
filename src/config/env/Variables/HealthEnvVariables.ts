import { Expose, Transform } from "class-transformer";
import { IsString, Matches, NotContains } from "class-validator";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ResolveEnvPath } from "../Transform/ResolveEnvPath.js";

export class HealthEnvVariables {
  private static readonly NON_BLANK_PATTERN = /\S/;

  @Expose()
  @Transform(ResolveEnvPath)
  @IsString()
  @Matches(HealthEnvVariables.NON_BLANK_PATTERN)
  @NotContains("\0")
  HEALTH_FILE_PATH: string = join(tmpdir(), "temp-voice-health.json");
}
