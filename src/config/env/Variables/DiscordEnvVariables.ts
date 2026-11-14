import { Expose } from "class-transformer";
import { IsString, Matches } from "class-validator";

export class DiscordEnvVariables {
  private static readonly NON_BLANK_PATTERN = /\S/;

  @Expose()
  @IsString()
  @Matches(DiscordEnvVariables.NON_BLANK_PATTERN)
  DISCORD_TOKEN!: string;
}
