/**
 * Webview Logger Registry
 *
 * Browser-side logger for neko-market webview.
 * Uses ConsoleLogger from @neko/shared (Layer 0, no vscode dependency).
 */

import { ConsoleLogger, LogLevel } from '@neko/shared';
import type { ILogger } from '@neko/shared';

const rootLogger: ILogger = new ConsoleLogger('NekoMarket', LogLevel.Debug);

export function getLogger(source: string): ILogger {
  return rootLogger.child(source);
}

export { rootLogger };
