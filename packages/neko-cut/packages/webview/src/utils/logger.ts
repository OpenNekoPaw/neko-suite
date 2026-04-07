/**
 * Webview Logger Registry
 *
 * Browser-side equivalent of the extension logger registry.
 * Uses ConsoleLogger from @neko/shared.
 */

import { ConsoleLogger, LogLevel } from '@neko/shared';
import type { ILogger } from '@neko/shared';

const rootLogger: ILogger = new ConsoleLogger('NekoCut', LogLevel.Debug);

/**
 * Get a child logger for a module/component.
 *
 * @example
 * ```typescript
 * const logger = getLogger('ThumbnailService');
 * logger.info('Cache hit', { key });
 * // Output: [NekoCut:ThumbnailService] Cache hit { key: '...' }
 * ```
 */
export function getLogger(source: string): ILogger {
  return rootLogger.child(source);
}
