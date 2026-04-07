/**
 * Webview Logger Registry
 *
 * Browser-side equivalent of the extension logger registry.
 * Uses ConsoleLogger from @neko/shared.
 */

import { ConsoleLogger, LogLevel } from '@neko/shared';
import type { ILogger } from '@neko/shared';

const rootLogger: ILogger = new ConsoleLogger('NekoCanvas', LogLevel.Debug);

/**
 * Get a child logger for a module/component.
 */
export function getLogger(source: string): ILogger {
  return rootLogger.child(source);
}
