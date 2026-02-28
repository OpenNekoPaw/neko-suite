/**
 * Global Logger Registry
 *
 * Provides a simple way for modules to obtain loggers without
 * constructor injection. The root logger is set once during
 * extension activation; modules call `getLogger(source)` to
 * get a child logger.
 *
 * This avoids threading ILogger through every constructor while
 * still centralizing log output to a VSCode OutputChannel.
 */

import type { ILogger } from '@neko/shared';
import { ConsoleLogger, LogLevel } from '@neko/shared';

let _rootLogger: ILogger = new ConsoleLogger('NekoCut', LogLevel.Info);

/**
 * Set the root logger (called once in activate())
 */
export function setRootLogger(logger: ILogger): void {
  _rootLogger = logger;
}

/**
 * Get a child logger for a module/service.
 *
 * @example
 * ```typescript
 * const logger = getLogger('MediaService');
 * logger.info('Stream created');
 * // Output: [NekoCut:MediaService] Stream created
 * ```
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
