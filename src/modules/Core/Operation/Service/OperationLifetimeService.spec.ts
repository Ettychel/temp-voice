import { afterEach, describe, expect, it, vi } from "vitest";
import { OperationAdmissionClosedError } from "../Error/OperationAdmissionClosedError.js";
import { OperationShutdownTimeoutError } from "../Error/OperationShutdownTimeoutError.js";
import { KeyedOperationCoordinator } from "./KeyedOperationCoordinator.js";
import { OperationLifetimeService } from "./OperationLifetimeService.js";

describe("operation shutdown", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("drains an executing operation while rejecting waiting and new operations", async () => {
    const coordinator = new KeyedOperationCoordinator();
    const lifetime = new OperationLifetimeService(coordinator);
    let release!: () => void;
    let started!: () => void;

    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    const start = new Promise<void>((resolve) => {
      started = resolve;
    });

    const active = coordinator.run("guild", async () => {
      started();
      await gate;
    });

    await start;

    const queued = expect(coordinator.run("guild", async () => {})).rejects.toBeInstanceOf(
      OperationAdmissionClosedError,
    );

    let closed = false;

    const shutdown = lifetime.beforeApplicationShutdown().then(() => {
      closed = true;
    });

    await expect(coordinator.run("another-guild", async () => {})).rejects.toBeInstanceOf(
      OperationAdmissionClosedError,
    );

    expect(closed).toBe(false);
    release();
    await active;
    await queued;
    await shutdown;
    expect(closed).toBe(true);
  });

  it("does not report successful shutdown when an operation exceeds 15 seconds", async () => {
    vi.useFakeTimers();
    const coordinator = new KeyedOperationCoordinator();
    const lifetime = new OperationLifetimeService(coordinator);
    let started!: () => void;

    const start = new Promise<void>((resolve) => {
      started = resolve;
    });

    void coordinator.run("guild", async () => {
      started();
      await new Promise<void>(() => {});
    });

    await start;

    const rejection = expect(lifetime.beforeApplicationShutdown()).rejects.toBeInstanceOf(
      OperationShutdownTimeoutError,
    );

    await vi.advanceTimersByTimeAsync(15000);
    await rejection;
    expect(coordinator.isAcceptingOperations).toBe(false);
  });
});
