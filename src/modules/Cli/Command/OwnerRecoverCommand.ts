import { Command, CommandRunner } from "nest-commander";
import { DatabaseOperationError } from "../../Infrastructure/Database/Error/DatabaseOperationError.js";
import { JsonLogger } from "../../Logging/Service/JsonLogger.js";
import { OwnershipConflictError } from "../../Ownership/Error/OwnershipConflictError.js";
import { OwnershipService } from "../../Ownership/Service/OwnershipService.js";

@Command({
  name: "owner:recover",
  description: "Revoke bot ownership and print a new one-time recovery code.",
})
export class OwnerRecoverCommand extends CommandRunner {
  private static readonly FAILURE_EVENT = "ownership.recovery.failed";

  constructor(
    private readonly ownership: OwnershipService,
    private readonly logger: JsonLogger,
  ) {
    super();
  }

  /** Reject unexpected arguments and unwind Commander exits before closing the CLI context. */
  override setCommand(command: Parameters<CommandRunner["setCommand"]>[0]): this {
    return super.setCommand(command.allowExcessArguments(false).exitOverride());
  }

  /**
   * Print the code only after commit; handled failures set a nonzero CLI exit code.
   * @throws {Promise<TypeError>} Writing a safe diagnostic failed.
   */
  async run(): Promise<void> {
    try {
      const code = await this.ownership.recover();
      console.log(code);
    } catch (error) {
      this.logger.error({
        event: OwnerRecoverCommand.FAILURE_EVENT,
        reason:
          error instanceof DatabaseOperationError || error instanceof OwnershipConflictError
            ? error.message
            : "Owner recovery failed.",
      });

      process.exitCode = 1;
    }
  }
}
