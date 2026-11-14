export interface VoiceTransitionDto {
  readonly guildId: string;
  readonly userId: string;
  readonly previousChannelId: string | null;
  readonly channelId: string | null;
  readonly isBot: boolean;
}
