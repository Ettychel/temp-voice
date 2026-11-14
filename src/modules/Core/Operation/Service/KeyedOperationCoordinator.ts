import { AsyncLocalStorage } from "node:async_hooks";
import { OperationAdmissionClosedError } from "../Error/OperationAdmissionClosedError.js";
import { OperationReentryError } from "../Error/OperationReentryError.js";

export class KeyedOperationCoordinator {
  private readonly pending = new Map<string, Promise<void>>();
  private readonly activeKeys = new AsyncLocalStorage<ReadonlySet<string>>();
  private accepting = true;

  get isAcceptingOperations(): boolean {
    return this.accepting;
  }

  stopAccepting(): void {
    this.accepting = false;
  }

  /**
   * SDK event notifications are independent operations even when emitted inside REST callbacks.
   * @throws {unknown} Propagates synchronous callback errors unchanged; returned promises are not awaited.
   */
  outsideOperationContext<T>(operation: () => T): T {
    return this.activeKeys.exit(operation);
  }

  /** Stop admission before awaiting; tails include all work already accepted for each key. */
  async waitForIdle(): Promise<void> {
    await Promise.all(this.pending.values());
  }

  /**
   * Runs operations in arrival order per key; other keys execute independently.
   * @throws {Promise<OperationReentryError>} The caller already holds this key.
   * @throws {Promise<OperationAdmissionClosedError>} Operation admission was closed.
   * @throws {Promise<unknown>} Propagates the operation's rejection unchanged.
   */
  async run<T>(key: string, operation: () => Promise<T>): Promise<T> {
    if (!this.accepting) {
      throw new OperationAdmissionClosedError();
    }

    const heldKeys = this.activeKeys.getStore();

    if (heldKeys?.has(key)) {
      throw new OperationReentryError();
    }

    const previous = this.pending.get(key);
    let release!: () => void;

    const current = new Promise<void>((resolve) => {
      release = resolve;
    });

    this.pending.set(key, current);
    await previous;

    try {
      if (!this.accepting) {
        throw new OperationAdmissionClosedError();
      }

      return await this.activeKeys.run(new Set([...(heldKeys ?? []), key]), operation);
    } finally {
      release();

      if (this.pending.get(key) === current) {
        this.pending.delete(key);
      }
    }
  }
}
