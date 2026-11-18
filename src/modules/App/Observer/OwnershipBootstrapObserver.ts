import { Injectable } from "@nestjs/common";
import { JsonLogger } from "../../Logging/Service/JsonLogger.js";
import { OwnershipConflictError } from "../../Ownership/Error/OwnershipConflictError.js";
import { OwnershipService } from "../../Ownership/Service/OwnershipService.js";

import type { OnModuleInit } from "@nestjs/common";
import type { OperationReentryError } from "../../Core/Operation/Error/OperationReentryError.js";
import type { DatabaseOperationError } from "../../Infrastructure/Database/Error/DatabaseOperationError.js";

@Injectable()
export class OwnershipBootstrapObserver implements OnModuleInit {
  private static readonly INITIAL_CODE_EVENT = "ownership.initial-code";
  private static readonly CONFLICT_EVENT = "ownership.initialization.conflict";

  constructor(
    private readonly ownership: OwnershipService,
    private readonly logger: JsonLogger,
  ) {}

  /**
   * Initial activation is the only code intentionally written to bot logs, before Discord login.
   * @throws {Promise<DatabaseOperationError>} Initial ownership persistence failed.
   * @throws {Promise<OperationReentryError>} The database queue was reentered.
   * @throws {Promise<unknown | TypeError>} Writing the initial code failed.
   */
  async onModuleInit(): Promise<void> {
    try {
      const code = await this.ownership.initialize();

      if (code !== null) {
        this.logger.log({ event: OwnershipBootstrapObserver.INITIAL_CODE_EVENT, result: code });
      }
    } catch (error) {
      if (!(error instanceof OwnershipConflictError)) {
        throw error;
      }

      this.logger.warn({
        event: OwnershipBootstrapObserver.CONFLICT_EVENT,
        reason: error.message,
      });
    }
  }
}
