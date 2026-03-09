/**
 * Platform Logger - Global logger registry
 *
 * Default: ConsoleLogger for standalone usage.
 * Extension injects VSCode OutputChannel logger via setRootLogger().
 */

import { ConsoleLogger, LogLevel } from '@neko/shared';
import type { ILogger } from '@neko/shared';

let _rootLogger: ILogger = new ConsoleLogger('Platform', LogLevel.Info);

export function setRootLogger(logger: ILogger): void {
  _rootLogger = logger;
}

export function getLogger(source: string): ILogger {
  return _rootLogger.child(source);
}

export function getRootLogger(): ILogger {
  return _rootLogger;
}
