/**
 * NekoEngine Extension Logger Registry
 *
 * Global logger access for module-level code.
 * Initialized in activate() with a VSCode OutputChannel logger.
 * Falls back to ConsoleLogger before initialization.
 */

import { ConsoleLogger, LogLevel } from '@neko/shared';
import type { ILogger } from '@neko/shared';

let rootLogger: ILogger = new ConsoleLogger('NekoEngine', LogLevel.Info);

export function setRootLogger(logger: ILogger): void {
  rootLogger = logger;
}

export function getRootLogger(): ILogger {
  return rootLogger;
}

export function getLogger(source: string): ILogger {
  return rootLogger.child(source);
}
