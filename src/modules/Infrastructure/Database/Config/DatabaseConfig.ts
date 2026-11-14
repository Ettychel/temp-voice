export class DatabaseConfig {
  constructor(private readonly _path: string) {}

  get path(): string {
    return this._path;
  }
}
