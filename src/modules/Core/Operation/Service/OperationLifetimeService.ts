import { Injectable } from "@nestjs/common";
import { OperationShutdownTimeoutError } from "../Error/OperationShutdownTimeoutError.js";
import { KeyedOperationCoordinator } from "./KeyedOperationCoordinator.js";

import type { BeforeApplicationShutdown } from "@nestjs/common";

@Injectable()
export class OperationLifetimeService implements BeforeApplicationShutdown {
  private static readonly SHUTDOWN_TIMEOUT_MS = 15000;
  private resolveFailure!: () => void;
  readonly failure: Promise<void>;

  constructor(private readonly coordinator: KeyedOperationCoordinator) {
    this.failure = new Promise<void>((resolve) => {
      this.resolveFailure = resolve;
    });
  }

  fail(): void {
    this.coordinator.stopAccepting();
    this.resolveFailure();
  }

  /** @throws {Promise<OperationShutdownTimeoutError>} Shutdown must terminate unsuccessfully. */
  async beforeApplicationShutdown(): Promise<void> {
    this.coordinator.stopAccepting();
    let timer!: NodeJS.Timeout;

    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new OperationShutdownTimeoutError()),
        OperationLifetimeService.SHUTDOWN_TIMEOUT_MS,
      );
    });

    try {
      await Promise.race([this.coordinator.waitForIdle(), timeout]);
    } finally {
      clearTimeout(timer);
    }
  }
}
