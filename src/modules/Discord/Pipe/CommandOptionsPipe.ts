import { Injectable } from "@nestjs/common";

import type { ArgumentMetadata, PipeTransform } from "@nestjs/common";

@Injectable()
export class CommandOptionsPipe implements PipeTransform {
  /** @throws {Error} Instantiating the command's declared options class failed. */
  transform(value: object, metadata: ArgumentMetadata): object {
    return Object.assign(new metadata.metatype!(), value);
  }
}
