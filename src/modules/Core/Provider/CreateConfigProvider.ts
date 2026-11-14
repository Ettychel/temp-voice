import type { FactoryProvider, Type } from "@nestjs/common";
import type { FactoryInterface } from "../Interface/FactoryInterface.js";

export function CreateConfigProvider<TConfig, TFactory extends FactoryInterface<TConfig>>(
  config: Type<TConfig>,
  factory: Type<TFactory>,
): FactoryProvider<TConfig> {
  return {
    provide: config,
    useFactory: (configFactory: TFactory) => configFactory.create(),
    inject: [factory],
  };
}
