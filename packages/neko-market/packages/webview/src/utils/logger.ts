/**
 * Webview Logger Registry
 *
 * Browser-side logger for neko-market webview.
 * Uses ConsoleLogger from @neko/shared (Layer 0, no vscode dependency).
 */

import { createWebviewLoggerRegistry, LogLevel } from '@neko/shared';

const registry = createWebviewLoggerRegistry({
  packageName: 'NekoMarket',
  defaultLevel: LogLevel.Debug,
});

export const setRootLogger = registry.setRootLogger;
export const getRootLogger = registry.getRootLogger;
export const getLogger = registry.getLogger;
