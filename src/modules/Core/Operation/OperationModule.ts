import { Module } from "@nestjs/common";
import { KeyedOperationCoordinator } from "./Service/KeyedOperationCoordinator.js";
import { OperationLifetimeService } from "./Service/OperationLifetimeService.js";

@Module({
  providers: [KeyedOperationCoordinator, OperationLifetimeService],
  exports: [KeyedOperationCoordinator, OperationLifetimeService],
})
export class OperationModule {}
