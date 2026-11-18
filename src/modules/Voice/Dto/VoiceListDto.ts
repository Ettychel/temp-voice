import type { TriggerListItemDto } from "./TriggerListItemDto.js";

export class VoiceListDto {
  constructor(
    readonly triggers: readonly TriggerListItemDto[],
    readonly totalCount: number,
    readonly orphanCount: number,
    readonly problemChannelIds: readonly string[],
    readonly guildLimit: number | null,
  ) {}
}
