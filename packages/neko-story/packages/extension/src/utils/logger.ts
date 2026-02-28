/**
 * Global Logger Registry
 *
 * Provides a simple way for modules to obtain loggers without
 * constructor injection. The root logger is set once during
 * extension activation; modules call `getLogger(source)` to
 * get a child logger.
 */

import type { ILogger } from '@neko/shared';
import { ConsoleLogger, LogLevel } from '@neko/shared';

let _rootLogger: ILogger = new ConsoleLogger('NekoStory', LogLevel.Info);

/**
 * Set the root logger (called once in activate())
 */
export function setRootLogger(logger: ILogger): void {
  _rootLogger = logger;
}

/**
 * Get a child logger for a module/service.
 */
export function getLogger(source: string): ILogger {
  return _rootLogger.child(source);
}

/**
 * Get the root logger directly (for extension.ts top-level logs)
 */
export function getRootLogger(): ILogger {
  return _rootLogger;
}
