import { ConsoleLogger, LogLevel } from '@neko/shared';
import type { ILogger } from '@neko/shared';

let rootLogger: ILogger = new ConsoleLogger('NekoPreview', LogLevel.Info);

export function setRootLogger(logger: ILogger): void {
  rootLogger = logger;
}

export function getRootLogger(): ILogger {
  return rootLogger;
}

export function getLogger(source: string): ILogger {
  return rootLogger.child(source);
}
