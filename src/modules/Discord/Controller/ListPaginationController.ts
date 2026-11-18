import { Injectable, UseFilters } from "@nestjs/common";
import { Button, ComponentParam, Context } from "necord";
import { CommandExceptionFilter } from "../Filter/CommandExceptionFilter.js";
import { CommandListService } from "../Service/CommandListService.js";

import type { ButtonContext } from "necord";
import type { OperationReentryError } from "../../Core/Operation/Error/OperationReentryError.js";
import type { DatabaseOperationError } from "../../Infrastructure/Database/Error/DatabaseOperationError.js";
import type { OwnerAccessDeniedError } from "../../Ownership/Error/OwnerAccessDeniedError.js";
import type { CommandAccessError } from "../Error/CommandAccessError.js";
import type { InvalidCommandTargetError } from "../Error/InvalidCommandTargetError.js";

@Injectable()
@UseFilters(CommandExceptionFilter)
export class ListPaginationController {
  constructor(private readonly lists: CommandListService) {}

  /**
   * @throws {Promise<CommandAccessError>} The caller, context or requested page action is not allowed.
   * @throws {Promise<OperationReentryError>} The database queue was reentered.
   * @throws {Promise<DatabaseOperationError>} Reading current ownership failed.
   * @throws {Promise<OwnerAccessDeniedError>} The author is no longer the current owner.
   * @throws {Promise<InvalidCommandTargetError>} The guild is no longer available.
   * @throws {Promise<unknown>} Discord acknowledgment, formatting or reply failed.
   */
  @Button(CommandListService.BUTTON_PATTERN)
  async turn(
    @Context() [interaction]: ButtonContext,
    @ComponentParam("session") session: string,
    @ComponentParam("page") page: string,
  ): Promise<void> {
    await this.lists.turn(interaction, session, page);
  }
}
