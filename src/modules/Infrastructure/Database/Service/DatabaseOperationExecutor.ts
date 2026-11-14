import { QueryFailedError } from "typeorm";
import { OperationReentryError } from "../../../Core/Operation/Error/OperationReentryError.js";
import { KeyedOperationCoordinator } from "../../../Core/Operation/Service/KeyedOperationCoordinator.js";
import { DatabaseOperationError } from "../Error/DatabaseOperationError.js";

/** One instance per SQLite connection; callbacks contain only repository work. */
export class DatabaseOperationExecutor {
  private static readonly CONNECTION_KEY = "connection";
  private static readonly SQLITE_BUSY_PREFIX = "SQLITE_BUSY";
  private readonly coordinator = new KeyedOperationCoordinator();

  /**
   * Serializes a complete short repository operation, including its transaction.
   * Never perform Discord requests or call another queued repository method here.
   * @throws {Promise<OperationReentryError>} The operation reenters this executor.
   * @throws {Promise<DatabaseOperationError>} SQLite failed; busy is a technical failure.
   */
  async run<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await this.coordinator.run(DatabaseOperationExecutor.CONNECTION_KEY, operation);
    } catch (error) {
      if (error instanceof OperationReentryError) {
        throw error;
      }

      const driverError: unknown = error instanceof QueryFailedError ? error.driverError : error;

      const isBusy =
        typeof driverError === "object" &&
        driverError !== null &&
        "code" in driverError &&
        typeof driverError.code === "string" &&
        driverError.code.startsWith(DatabaseOperationExecutor.SQLITE_BUSY_PREFIX);

      throw new DatabaseOperationError(isBusy);
    }
  }
}
