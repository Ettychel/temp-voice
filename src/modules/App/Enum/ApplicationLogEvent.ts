export enum ApplicationLogEvent {
  Started = "application.started",
  InitializationFailed = "application.initialization.failed",
  ShutdownFailed = "application.shutdown.failed",
  CliCommandUnavailable = "cli.command.unavailable",
  CliInitializationFailed = "cli.initialization.failed",
}
