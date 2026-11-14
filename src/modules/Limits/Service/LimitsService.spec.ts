import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CreationBlockReason } from "../Enum/CreationBlockReason.js";
import { InvalidChannelLimitError } from "../Error/InvalidChannelLimitError.js";
import { LimitsService } from "./LimitsService.js";

import type { CreationLimitFactsDto } from "../Dto/CreationLimitFactsDto.js";
import type { GuildLimitRepository } from "../Repository/GuildLimitRepository.js";

describe("creation limits and successful-creation cooldown", () => {
  let limits: LimitsService;

  const unconstrained: CreationLimitFactsDto = {
    guildLimit: null,
    triggerLimit: null,
    guildChannelCount: 10,
    triggerChannelCount: 10,
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(10000);
    const repository = { get: vi.fn(), set: vi.fn() } as unknown as GuildLimitRepository;
    limits = new LimitsService(repository);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("enforces both limits, including a limit lowered below the current count", () => {
    expect(limits.getCreationBlockReason("guild", "user", unconstrained)).toBeNull();

    expect(
      limits.getCreationBlockReason("guild", "user", {
        ...unconstrained,
        guildLimit: 11,
        triggerLimit: 11,
      }),
    ).toBeNull();

    expect(
      limits.getCreationBlockReason("guild", "user", { ...unconstrained, guildLimit: 10 }),
    ).toBe(CreationBlockReason.GuildLimit);

    expect(
      limits.getCreationBlockReason("guild", "user", { ...unconstrained, triggerLimit: 10 }),
    ).toBe(CreationBlockReason.TriggerLimit);

    expect(
      limits.getCreationBlockReason("guild", "user", { ...unconstrained, guildLimit: 2 }),
    ).toBe(CreationBlockReason.GuildLimit);
  });

  it("starts cooldown only on explicit success, scopes it by guild and user, and expires at five seconds", () => {
    expect(limits.getCreationBlockReason("guild", "user", unconstrained)).toBeNull();
    limits.recordSuccessfulCreation("guild", "user");

    expect(limits.getCreationBlockReason("guild", "user", unconstrained)).toBe(
      CreationBlockReason.Cooldown,
    );

    expect(limits.getCreationBlockReason("guild", "someone-else", unconstrained)).toBeNull();
    expect(limits.getCreationBlockReason("other-guild", "user", unconstrained)).toBeNull();
    vi.advanceTimersByTime(4999);

    expect(limits.getCreationBlockReason("guild", "user", unconstrained)).toBe(
      CreationBlockReason.Cooldown,
    );

    vi.advanceTimersByTime(1);
    expect(limits.getCreationBlockReason("guild", "user", unconstrained)).toBeNull();
  });

  it("represents a removed limit as null", () => {
    expect(limits.normalizeLimit(0)).toBeNull();
    expect(limits.normalizeLimit(4)).toBe(4);
  });

  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid command limit %s",
    (value) => {
      expect(() => limits.normalizeLimit(value)).toThrow(InvalidChannelLimitError);
    },
  );
});
