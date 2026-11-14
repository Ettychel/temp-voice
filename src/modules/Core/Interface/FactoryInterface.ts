export interface FactoryInterface<TConfig, TArgs extends unknown[] = []> {
  create(...args: TArgs): TConfig;
}
