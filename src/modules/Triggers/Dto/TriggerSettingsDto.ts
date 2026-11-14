export interface TriggerSettingsDto {
  readonly guildId: string;
  readonly channelId: string;
  readonly isActive: boolean;
  readonly channelLimit: number | null;
  readonly createdAt: number;
}
