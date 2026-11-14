export interface JsonLogContextDto {
  readonly event: string;
  readonly guildId?: string;
  readonly channelId?: string;
  readonly userId?: string;
  readonly result?: string;
  readonly reason?: string;
}
