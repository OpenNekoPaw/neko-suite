/**
 * Webview Logger Registry
 *
 * Browser-side logger for neko-agent webview.
 * Uses ConsoleLogger from @neko/shared.
 */

import { ConsoleLogger, LogLevel } from '@neko/shared';
import type { ILogger } from '@neko/shared';

const rootLogger: ILogger = new ConsoleLogger('NekoAgent', LogLevel.Debug);

export function getLogger(source: string): ILogger {
  return rootLogger.child(source);
}

export { rootLogger };
