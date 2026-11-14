export interface CreationLimitFactsDto {
  readonly guildLimit: number | null;
  readonly triggerLimit: number | null;
  readonly guildChannelCount: number;
  readonly triggerChannelCount: number;
}
