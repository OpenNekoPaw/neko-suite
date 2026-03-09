/**
 * Neko Tools Logger - Global logger registry
 *
 * Extension initializes via createVSCodeLogger() in activate().
 * All modules use getLogger('ModuleName') for scoped logging.
 */

import { ConsoleLogger, LogLevel } from '@neko/shared';
import type { ILogger } from '@neko/shared';

let _rootLogger: ILogger = new ConsoleLogger('NekoTools', LogLevel.Info);

export function setRootLogger(logger: ILogger): void {
  _rootLogger = logger;
}

export function getLogger(source: string): ILogger {
  return _rootLogger.child(source);
}

export function getRootLogger(): ILogger {
  return _rootLogger;
}
