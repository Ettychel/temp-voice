export class DiscordConfig {
  constructor(private readonly _token: string) {}

  get token(): string {
    return this._token;
  }
}
