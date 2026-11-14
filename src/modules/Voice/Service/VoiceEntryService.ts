import { Injectable } from "@nestjs/common";

import type { GuildVoiceSnapshotDto } from "../Dto/GuildVoiceSnapshotDto.js";
import type { VoiceEntryDto } from "../Dto/VoiceEntryDto.js";
import type { VoiceTransitionDto } from "../Dto/VoiceTransitionDto.js";

/** Captures transitions immediately on event receipt, before any guild queue wait. */
@Injectable()
export class VoiceEntryService {
  private readonly sequences = new Map<string, number>();
  private readonly generations = new Map<string, number>();
  private readonly entries = new Map<string, Map<string, VoiceEntryDto>>();
  private readonly watchBoundaries = new Map<string, Map<string, number>>();
  private readonly claimedEntries = new WeakSet<VoiceEntryDto>();

  record(transition: VoiceTransitionDto): VoiceEntryDto | null {
    if (transition.previousChannelId === transition.channelId) {
      return null;
    }

    const sequence = (this.sequences.get(transition.guildId) ?? 0) + 1;
    this.sequences.set(transition.guildId, sequence);
    const guildEntries = this.entries.get(transition.guildId) ?? new Map<string, VoiceEntryDto>();
    this.entries.set(transition.guildId, guildEntries);

    if (transition.channelId === null || transition.isBot) {
      guildEntries.delete(transition.userId);

      return null;
    }

    const entry: VoiceEntryDto = {
      guildId: transition.guildId,
      userId: transition.userId,
      channelId: transition.channelId,
      sequence,
      generation: this.generations.get(transition.guildId) ?? 0,
    };

    guildEntries.set(transition.userId, entry);

    return entry;
  }

  markWatchBoundary(guildId: string, channelId: string): void {
    const guildBoundaries = this.watchBoundaries.get(guildId) ?? new Map<string, number>();
    guildBoundaries.set(channelId, this.sequences.get(guildId) ?? 0);
    this.watchBoundaries.set(guildId, guildBoundaries);
  }

  removeWatchBoundary(guildId: string, channelId: string): void {
    this.watchBoundaries.get(guildId)?.delete(channelId);
  }

  isEligible(entry: VoiceEntryDto): boolean {
    const current = this.entries.get(entry.guildId)?.get(entry.userId);
    const boundary = this.watchBoundaries.get(entry.guildId)?.get(entry.channelId);

    return (
      boundary !== undefined &&
      entry.sequence > boundary &&
      current?.sequence === entry.sequence &&
      entry.generation === (this.generations.get(entry.guildId) ?? 0) &&
      current.channelId === entry.channelId
    );
  }

  /** Claims a transition once; duplicate delivery never becomes a new voice entrance. */
  claimForCreation(entry: VoiceEntryDto): boolean {
    if (!this.isEligible(entry)) {
      return false;
    }

    const current = this.entries.get(entry.guildId)!.get(entry.userId)!;

    if (this.claimedEntries.has(current)) {
      return false;
    }

    this.claimedEntries.add(current);

    return true;
  }

  beginSnapshot(guildId: string): GuildVoiceSnapshotDto {
    const generation = (this.generations.get(guildId) ?? 0) + 1;
    this.generations.set(guildId, generation);
    this.entries.delete(guildId);
    this.watchBoundaries.delete(guildId);

    return { guildId, generation, sequence: this.sequences.get(guildId) ?? 0 };
  }

  isCurrentSnapshot(snapshot: GuildVoiceSnapshotDto): boolean {
    return this.generations.get(snapshot.guildId) === snapshot.generation;
  }

  restoreWatchBoundary(snapshot: GuildVoiceSnapshotDto, channelId: string): void {
    if (this.isCurrentSnapshot(snapshot)) {
      const boundaries = this.watchBoundaries.get(snapshot.guildId) ?? new Map<string, number>();
      boundaries.set(channelId, snapshot.sequence);
      this.watchBoundaries.set(snapshot.guildId, boundaries);
    }
  }
}
