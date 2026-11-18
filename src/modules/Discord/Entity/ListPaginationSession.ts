import type { Locale } from "discord.js";

export class ListPaginationSession {
  constructor(
    readonly id: string,
    readonly userId: string,
    readonly guildId: string,
    readonly owner: boolean,
    readonly expiresAt: number,
    readonly locale: Locale,
    readonly pages: readonly string[],
  ) {}
}
