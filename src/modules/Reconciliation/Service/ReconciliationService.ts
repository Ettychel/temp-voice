import { Injectable } from "@nestjs/common";
import { OperationAdmissionClosedError } from "../../Core/Operation/Error/OperationAdmissionClosedError.js";
import { KeyedOperationCoordinator } from "../../Core/Operation/Service/KeyedOperationCoordinator.js";
import { OperationLifetimeService } from "../../Core/Operation/Service/OperationLifetimeService.js";
import { DatabaseOperationError } from "../../Infrastructure/Database/Error/DatabaseOperationError.js";
import { JsonLogger } from "../../Logging/Service/JsonLogger.js";
import { InvalidTriggerChannelError } from "../../Triggers/Error/InvalidTriggerChannelError.js";
import { TriggerPermissionsError } from "../../Triggers/Error/TriggerPermissionsError.js";
import { VoiceChannelMutationError } from "../../Voice/Error/VoiceChannelMutationError.js";
import { VoiceChannelUnavailableError } from "../../Voice/Error/VoiceChannelUnavailableError.js";
import { CreateTemporaryChannelHandler } from "../../Voice/Handler/CreateTemporaryChannelHandler.js";
import { DeleteTemporaryChannelHandler } from "../../Voice/Handler/DeleteTemporaryChannelHandler.js";
import { ReconcileGuildHandler } from "../../Voice/Handler/ReconcileGuildHandler.js";
import { RemoveGuildHandler } from "../../Voice/Handler/RemoveGuildHandler.js";
import { SynchronizeTriggerHandler } from "../../Voice/Handler/SynchronizeTriggerHandler.js";
import { VoiceEntryService } from "../../Voice/Service/VoiceEntryService.js";

import type { OnModuleInit } from "@nestjs/common";
import type { OperationReentryError } from "../../Core/Operation/Error/OperationReentryError.js";
import type { GuildVoiceSnapshotDto } from "../../Voice/Dto/GuildVoiceSnapshotDto.js";
import type { VoiceEntryDto } from "../../Voice/Dto/VoiceEntryDto.js";
import type { VoiceTransitionDto } from "../../Voice/Dto/VoiceTransitionDto.js";

interface GuildReconciliationState {
  snapshot: GuildVoiceSnapshotDto;
  ready: boolean;
  pendingEntries: Map<string, VoiceEntryDto>;
  pendingDepartures: Set<string>;
  restoring?: Promise<void>;
}

@Injectable()
export class ReconciliationService implements OnModuleInit {
  private static readonly LOG_EVENT = "voice.reconciliation";
  private readonly guilds = new Map<string, GuildReconciliationState>();

  constructor(
    private readonly entries: VoiceEntryService,
    private readonly reconciliation: ReconcileGuildHandler,
    private readonly creation: CreateTemporaryChannelHandler,
    private readonly deletion: DeleteTemporaryChannelHandler,
    private readonly synchronization: SynchronizeTriggerHandler,
    private readonly removal: RemoveGuildHandler,
    private readonly coordinator: KeyedOperationCoordinator,
    private readonly lifetime: OperationLifetimeService,
    private readonly logger: JsonLogger,
  ) {}

  /**
   * @throws {Promise<DatabaseOperationError>} Restoring confirmed cleanup failed before login.
   * @throws {Promise<OperationReentryError>} A queue was reentered.
   * @throws {Promise<OperationAdmissionClosedError>} Admission is closed.
   * @throws {Promise<unknown>} An unexpected cleanup operation failed.
   */
  async onModuleInit(): Promise<void> {
    await this.removal.restorePending();
  }

  isReady(guildId: string): boolean {
    const state = this.guilds.get(guildId);

    return (
      this.coordinator.isAcceptingOperations &&
      state?.ready === true &&
      this.entries.isCurrentSnapshot(state.snapshot)
    );
  }

  invalidateGuild(guildId: string): void {
    this.entries.beginSnapshot(guildId);
    this.guilds.delete(guildId);
  }

  /** @throws {Promise<TypeError>} Writing a failure diagnostic failed. */
  restoreGuild(guildId: string): Promise<void> {
    let state = this.guilds.get(guildId);

    if (state?.ready) {
      return Promise.resolve();
    }

    if (state?.restoring) {
      return state.restoring;
    }

    if (!state) {
      state = {
        snapshot: this.entries.beginSnapshot(guildId),
        ready: false,
        pendingEntries: new Map(),
        pendingDepartures: new Set(),
      };

      this.guilds.set(guildId, state);
    }

    const current = state;

    current.restoring = this.restore(current)
      .catch((error: unknown) => this.failed(guildId, error))
      .finally(() => {
        current.restoring = undefined;
      });

    return current.restoring;
  }

  /**
   * @throws {Promise<TypeError>}
   */
  async observeVoiceTransition(transition: VoiceTransitionDto): Promise<void> {
    const state = this.guilds.get(transition.guildId);

    if (
      !state ||
      !this.coordinator.isAcceptingOperations ||
      transition.previousChannelId === transition.channelId
    ) {
      return;
    }

    const entry = this.entries.record(transition);

    if (!state.ready) {
      if (transition.previousChannelId !== null) {
        state.pendingDepartures.add(transition.previousChannelId);
      }

      if (entry) {
        state.pendingEntries.set(entry.userId, entry);
      }

      if (!state.restoring) {
        await this.restoreGuild(transition.guildId);
      }

      return;
    }

    try {
      if (transition.previousChannelId !== null) {
        await this.deletion.handle(transition.guildId, transition.previousChannelId);
      }

      if (entry) {
        await this.creation.handle(entry);
      }
    } catch (error) {
      this.failed(transition.guildId, error);
    }
  }

  /**
   * @throws {Promise<TypeError>}
   */
  async channelDeleted(guildId: string, channelId: string): Promise<void> {
    try {
      await this.synchronization.channelDeleted(guildId, channelId);
    } catch (error) {
      this.failed(guildId, error);
    }
  }

  /**
   * @throws {Promise<TypeError>}
   */
  async channelChanged(guildId: string, channelId: string): Promise<void> {
    if (this.isReady(guildId)) {
      try {
        await this.deletion.handle(guildId, channelId);
      } catch (error) {
        this.failed(guildId, error);
      }
    }
  }

  /**
   * @throws {Promise<TypeError>}
   */
  async afkChanged(guildId: string, channelId: string | null): Promise<void> {
    try {
      await this.synchronization.afkChanged(guildId, channelId);
    } catch (error) {
      this.failed(guildId, error);
    }
  }

  /**
   * @throws {Promise<TypeError>}
   */
  async confirmedGuildRemoval(guildId: string): Promise<void> {
    this.invalidateGuild(guildId);

    try {
      await this.removal.handle(guildId);
    } catch (error) {
      this.failed(guildId, error);
    }
  }

  /**
   * @throws {Promise<DatabaseOperationError>} Loading or reconciling saved state failed.
   * @throws {Promise<OperationReentryError>} A queue was reentered.
   * @throws {Promise<OperationAdmissionClosedError>} Admission is closed.
   * @throws {Promise<TypeError>} Writing a diagnostic failed.
   * @throws {Promise<unknown>} Propagates an operation failure.
   */
  private async restore(state: GuildReconciliationState): Promise<void> {
    // Finish a previous confirmed removal before accepting a re-invited guild.
    await this.removal.restorePending(state.snapshot.guildId);

    if (
      !(await this.reconciliation.handle(state.snapshot)) ||
      this.guilds.get(state.snapshot.guildId) !== state
    ) {
      return;
    }

    state.ready = true;
    const pending: Promise<unknown>[] = [];

    for (const channelId of state.pendingDepartures) {
      pending.push(this.deletion.handle(state.snapshot.guildId, channelId));
    }

    for (const entry of state.pendingEntries.values()) {
      pending.push(this.creation.handle(entry));
    }

    state.pendingDepartures.clear();
    state.pendingEntries.clear();

    await Promise.all(
      pending.map((operation) =>
        operation.catch((error: unknown) => this.failed(state.snapshot.guildId, error)),
      ),
    );

    if (this.guilds.get(state.snapshot.guildId) === state && this.isReady(state.snapshot.guildId)) {
      this.logger.log({
        event: ReconciliationService.LOG_EVENT,
        guildId: state.snapshot.guildId,
        result: "completed",
      });
    }
  }

  /**
   * @throws {TypeError}
   */
  private failed(guildId: string, error: unknown): void {
    if (error instanceof OperationAdmissionClosedError) {
      return;
    }

    this.logger.error({
      event: ReconciliationService.LOG_EVENT,
      guildId,
      reason: "Voice operation failed.",
    });

    if (error instanceof DatabaseOperationError) {
      if (!error.isBusy) {
        this.lifetime.fail();
      }
    } else if (!(
      error instanceof VoiceChannelUnavailableError ||
      error instanceof VoiceChannelMutationError ||
      error instanceof InvalidTriggerChannelError ||
      error instanceof TriggerPermissionsError
    )) {
      this.lifetime.fail();
    }
  }
}
