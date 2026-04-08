import type { ILogger } from '@neko/shared';
import { ConsoleLogger, LogLevel } from '@neko/shared';

let _rootLogger: ILogger = new ConsoleLogger('NekoModel', LogLevel.Info);

export function setRootLogger(logger: ILogger): void {
  _rootLogger = logger;
}

export function getRootLogger(): ILogger {
  return _rootLogger;
}
