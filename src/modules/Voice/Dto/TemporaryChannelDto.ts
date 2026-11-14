export interface TemporaryChannelDto {
  readonly channelId: string;
  readonly guildId: string;
  readonly triggerChannelId: string;
  readonly ownerId: string;
  readonly deleteAttempts: number;
  readonly createdAt: number;
}
