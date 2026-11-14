import { Inject, Injectable } from "@nestjs/common";
import { KeyedOperationCoordinator } from "../../Core/Operation/Service/KeyedOperationCoordinator.js";
import { JsonLogger } from "../../Logging/Service/JsonLogger.js";
import { TriggerService } from "../../Triggers/Service/TriggerService.js";
import { ChannelDeletionResult } from "../Enum/ChannelDeletionResult.js";
import { VoiceChannelState } from "../Enum/VoiceChannelState.js";
import { TemporaryChannelService } from "../Service/TemporaryChannelService.js";
import { VoiceChannelGatewayToken } from "../Token/VoiceChannelGatewayToken.js";

import type { OperationAdmissionClosedError } from "../../Core/Operation/Error/OperationAdmissionClosedError.js";
import type { OperationReentryError } from "../../Core/Operation/Error/OperationReentryError.js";
import type { DatabaseOperationError } from "../../Infrastructure/Database/Error/DatabaseOperationError.js";
import type { VoiceChannelGatewayInterface } from "../Interface/VoiceChannelGatewayInterface.js";

interface ChannelDeletionTask {
  execution?: Promise<ChannelDeletionResult>;
  queued?: Promise<ChannelDeletionResult>;
}

@Injectable()
export class DeleteTemporaryChannelHandler {
  private static readonly LOG_EVENT = "voice.channel.deletion";
  private readonly pending = new Map<string, Map<string, ChannelDeletionTask>>();

  constructor(
    private readonly coordinator: KeyedOperationCoordinator,
    private readonly channels: TemporaryChannelService,
    private readonly triggers: TriggerService,
    private readonly logger: JsonLogger,
    @Inject(VoiceChannelGatewayToken) private readonly gateway: VoiceChannelGatewayInterface,
  ) {}

  /**
   * @throws {Promise<DatabaseOperationError>} Reading or updating tracked state failed.
   * @throws {Promise<OperationReentryError>} The guild or database queue was reentered.
   * @throws {Promise<OperationAdmissionClosedError>} The application stopped accepting work.
   * @throws {Promise<unknown>}
   */
  handle(guildId: string, channelId: string): Promise<ChannelDeletionResult> {
    const task = this.getTask(guildId, channelId);
    const existing = task.queued ?? task.execution;

    if (existing) {
      return existing;
    }

    task.queued = this.coordinator
      .run(guildId, () => this.executeTask(guildId, channelId, task))
      .finally(() => this.releaseTask(guildId, channelId, task));

    return task.queued;
  }

  /**
   * Caller already owns the guild operation; rollback must not reacquire that queue.
   * @throws {Promise<DatabaseOperationError>} Reading or updating tracked state failed.
   * @throws {Promise<OperationReentryError>} A database queue was reentered.
   * @throws {Promise<TypeError>} Writing a diagnostic log failed.
   */
  deleteInCurrentOperation(guildId: string, channelId: string): Promise<ChannelDeletionResult> {
    const task = this.getTask(guildId, channelId);
    const execution = this.executeTask(guildId, channelId, task);

    if (task.queued) {
      return execution;
    }

    return execution.finally(() => this.releaseTask(guildId, channelId, task));
  }

  private getTask(guildId: string, channelId: string): ChannelDeletionTask {
    const guildTasks = this.pending.get(guildId) ?? new Map<string, ChannelDeletionTask>();
    const task = guildTasks.get(channelId) ?? {};
    guildTasks.set(channelId, task);
    this.pending.set(guildId, guildTasks);

    return task;
  }

  private releaseTask(guildId: string, channelId: string, task: ChannelDeletionTask): void {
    const guildTasks = this.pending.get(guildId);

    if (guildTasks?.get(channelId) === task) {
      guildTasks.delete(channelId);

      if (guildTasks.size === 0) {
        this.pending.delete(guildId);
      }
    }
  }

  /**
   * @throws {Promise<DatabaseOperationError>} Reading or updating tracked state failed.
   * @throws {Promise<OperationReentryError>} A database queue was reentered.
   * @throws {Promise<TypeError>} Writing a diagnostic log failed.
   */
  private executeTask(
    guildId: string,
    channelId: string,
    task: ChannelDeletionTask,
  ): Promise<ChannelDeletionResult> {
    task.execution ??= this.deleteTracked(guildId, channelId);

    return task.execution;
  }

  /**
   * @throws {Promise<DatabaseOperationError>} Reading or updating tracked state failed.
   * @throws {Promise<OperationReentryError>} A database queue was reentered.
   * @throws {Promise<TypeError>} Writing a diagnostic log failed.
   */
  private async deleteTracked(guildId: string, channelId: string): Promise<ChannelDeletionResult> {
    const channel = await this.channels.get(guildId, channelId);

    if (channel === null) {
      return ChannelDeletionResult.NotTracked;
    }

    let state = await this.readState(guildId, channelId);

    if (state === VoiceChannelState.Unknown) {
      return ChannelDeletionResult.Unknown;
    }

    if (state === VoiceChannelState.Occupied) {
      return ChannelDeletionResult.Occupied;
    }

    if (state !== VoiceChannelState.Missing) {
      if (!(await this.channels.reserveDeletion(channelId, state))) {
        return ChannelDeletionResult.Exhausted;
      }

      state = await this.readState(guildId, channelId);

      if (state === VoiceChannelState.Occupied) {
        return ChannelDeletionResult.Occupied;
      }

      if (state === VoiceChannelState.Unknown) {
        return ChannelDeletionResult.Unknown;
      }

      if (state !== VoiceChannelState.Missing) {
        try {
          await this.gateway.deleteChannel(guildId, channelId);
        } catch {
          this.logger.warn({
            event: DeleteTemporaryChannelHandler.LOG_EVENT,
            guildId,
            channelId,
            result: ChannelDeletionResult.Failed,
          });

          return ChannelDeletionResult.Failed;
        }
      }
    }

    await this.channels.removeConfirmed(channelId);

    await this.triggers.cleanup(
      guildId,
      channel.triggerChannelId,
      (await this.channels.count(guildId, channel.triggerChannelId)) > 0,
    );

    return state === VoiceChannelState.Missing
      ? ChannelDeletionResult.ConfirmedMissing
      : ChannelDeletionResult.Deleted;
  }

  private async readState(guildId: string, channelId: string): Promise<VoiceChannelState> {
    try {
      return await this.gateway.getChannelState(guildId, channelId);
    } catch {
      return VoiceChannelState.Unknown;
    }
  }
}
