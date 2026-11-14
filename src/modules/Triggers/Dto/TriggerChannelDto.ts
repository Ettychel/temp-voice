import type { ChannelType } from "discord.js";

/** Current Discord facts, fetched by the scenario after waiting for the guild queue. */
export interface TriggerChannelDto {
  readonly guildId: string;
  readonly channelId: string;
  readonly type: ChannelType;
  readonly isAfk: boolean;
  /** Includes the required bot permissions and the ability to copy all overwrites. */
  readonly canManage: boolean;
}
