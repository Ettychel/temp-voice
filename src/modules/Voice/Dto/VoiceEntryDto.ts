export interface VoiceEntryDto {
  readonly guildId: string;
  readonly userId: string;
  readonly channelId: string;
  readonly sequence: number;
  readonly generation: number;
}
