/**
 * Global Logger Registry
 *
 * Provides module-level logger access without constructor injection.
 * Root logger is set once during extension activation; modules call
 * `getLogger(source)` to get a child logger.
 */

import type { ILogger } from '@neko/shared';
import { createLoggerRegistry } from '@neko/shared';

const registry = createLoggerRegistry('NekoSketch');

/** Set the root logger (called once in activate()) */
export function setRootLogger(logger: ILogger): void {
  registry.setRootLogger(logger);
}

/** Get a child logger for a module/service */
export function getLogger(source: string): ILogger {
  return registry.getLogger(source);
}

/** Get the root logger directly (for extension.ts top-level logs) */
export function getRootLogger(): ILogger {
  return registry.getRootLogger();
}
