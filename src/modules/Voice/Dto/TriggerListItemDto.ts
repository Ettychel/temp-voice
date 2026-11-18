export class TriggerListItemDto {
  constructor(
    readonly channelId: string,
    readonly isActive: boolean,
    readonly channelLimit: number | null,
    readonly channelCount: number,
  ) {}
}
