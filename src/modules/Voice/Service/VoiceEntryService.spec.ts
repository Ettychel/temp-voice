import { describe, expect, it } from "vitest";
import { VoiceEntryService } from "./VoiceEntryService.js";

import type { VoiceTransitionDto } from "../Dto/VoiceTransitionDto.js";

const join: VoiceTransitionDto = {
  guildId: "guild",
  userId: "user",
  previousChannelId: null,
  channelId: "trigger",
  isBot: false,
};

describe("voice entry identity", () => {
  it("does not activate from bots or events without a channel transition", () => {
    const entries = new VoiceEntryService();
    entries.markWatchBoundary("guild", "trigger");
    expect(entries.record({ ...join, isBot: true })).toBeNull();
    const original = entries.record(join)!;
    expect(entries.record({ ...join, previousChannelId: "trigger" })).toBeNull();
    expect(entries.isEligible(original)).toBe(true);
  });

  it("invalidates the old entrance when the user leaves and returns to the same trigger", () => {
    const entries = new VoiceEntryService();
    entries.markWatchBoundary("guild", "trigger");
    const original = entries.record(join)!;
    expect(entries.isEligible(original)).toBe(true);
    expect(entries.record({ ...join, previousChannelId: "trigger", channelId: null })).toBeNull();
    expect(entries.isEligible(original)).toBe(false);
    const returned = entries.record(join)!;
    expect(entries.isEligible(original)).toBe(false);
    expect(entries.isEligible(returned)).toBe(true);
  });

  it("does not turn pre-watch or pre-rewatch presence into a new entrance", () => {
    const entries = new VoiceEntryService();
    const old = entries.record(join)!;
    entries.markWatchBoundary("guild", "trigger");
    expect(entries.isEligible(old)).toBe(false);
    const afterWatch = entries.record({ ...join, userId: "new-user" })!;
    expect(entries.isEligible(afterWatch)).toBe(true);
    entries.removeWatchBoundary("guild", "trigger");
    expect(entries.isEligible(afterWatch)).toBe(false);
    entries.markWatchBoundary("guild", "trigger");
    expect(entries.isEligible(afterWatch)).toBe(false);
  });

  it("keeps voice transitions independent across guilds", () => {
    const entries = new VoiceEntryService();
    entries.markWatchBoundary("guild", "trigger");
    entries.markWatchBoundary("other-guild", "trigger");
    const first = entries.record(join)!;
    const second = entries.record({ ...join, guildId: "other-guild" })!;
    entries.record({ ...join, channelId: null, previousChannelId: "trigger" });
    expect(entries.isEligible(first)).toBe(false);
    expect(entries.isEligible(second)).toBe(true);
  });
});
