export class HealthConfig {
  constructor(private readonly _path: string) {}

  get path(): string {
    return this._path;
  }
}
