import { Injectable } from "@nestjs/common";
import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import { GeneratedOwnerCodeDto } from "../Dto/GeneratedOwnerCodeDto.js";
import { OwnerCodeDto } from "../Dto/OwnerCodeDto.js";

import type { OwnerCodeKind } from "../Enum/OwnerCodeKind.js";

@Injectable()
export class OwnerCodeService {
  private static readonly ALPHABET =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  private static readonly CODE_LENGTH = 32;
  private static readonly HASH_ALGORITHM = "sha256";
  private static readonly HASH_ENCODING = "hex";

  create(kind: OwnerCodeKind, expiresAt: number | null): GeneratedOwnerCodeDto {
    const value = Array.from(
      { length: OwnerCodeService.CODE_LENGTH },
      () => OwnerCodeService.ALPHABET[randomInt(OwnerCodeService.ALPHABET.length)],
    ).join("");

    return new GeneratedOwnerCodeDto(
      value,
      new OwnerCodeDto(
        this.hash(value).toString(OwnerCodeService.HASH_ENCODING),
        kind,
        expiresAt,
        false,
      ),
    );
  }

  matches(value: string, hash: string): boolean {
    const actual = this.hash(value);
    const expected = Buffer.from(hash, OwnerCodeService.HASH_ENCODING);

    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  private hash(value: string): Buffer {
    return createHash(OwnerCodeService.HASH_ALGORITHM).update(value).digest();
  }
}
