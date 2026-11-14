import { Expose, Transform } from "class-transformer";
import { IsString, Matches, NotContains } from "class-validator";
import { resolve } from "node:path";
import { ResolveEnvPath } from "../Transform/ResolveEnvPath.js";

export class DatabaseEnvVariables {
  private static readonly NON_BLANK_PATTERN = /\S/;

  @Expose()
  @Transform(ResolveEnvPath)
  @IsString()
  @Matches(DatabaseEnvVariables.NON_BLANK_PATTERN)
  @NotContains("\0")
  DATABASE_PATH: string = resolve("./data/temp-voice.sqlite");
}
