import { Injectable } from "@nestjs/common";

@Injectable()
export class DiscordGuildStateService {
  private readonly epochs = new Map<string, number>();
  private readonly available = new Set<string>();

  markAvailable(guildId: string): boolean {
    if (this.available.has(guildId)) {
      return false;
    }

    this.epochs.set(guildId, (this.epochs.get(guildId) ?? 0) + 1);
    this.available.add(guildId);

    return true;
  }

  invalidate(guildId: string): void {
    this.available.delete(guildId);
  }

  getEpoch(guildId: string): number | undefined {
    return this.available.has(guildId) ? this.epochs.get(guildId) : undefined;
  }

  isCurrent(guildId: string, epoch: number): boolean {
    return this.getEpoch(guildId) === epoch;
  }
}
