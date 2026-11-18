import { Module } from "@nestjs/common";
import { OwnershipRepository } from "./Repository/OwnershipRepository.js";
import { OwnerCodeService } from "./Service/OwnerCodeService.js";
import { OwnershipService } from "./Service/OwnershipService.js";

@Module({
  providers: [OwnershipRepository, OwnerCodeService, OwnershipService],
  exports: [OwnershipService],
})
export class OwnershipModule {}
