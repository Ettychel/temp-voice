import type { OwnerCodeDto } from "./OwnerCodeDto.js";

export class GeneratedOwnerCodeDto {
  constructor(
    readonly value: string,
    readonly stored: OwnerCodeDto,
  ) {}
}
