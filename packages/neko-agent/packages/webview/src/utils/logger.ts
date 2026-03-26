/**
 * Webview Logger Registry
 *
 * Browser-side logger for neko-agent webview.
 * Uses ConsoleLogger from @neko/shared with Debug level.
 */
import { createLoggerRegistry, LogLevel } from '@neko/shared';

const registry = createLoggerRegistry('NekoAgent', LogLevel.Debug);

export const { getLogger } = registry;
export const rootLogger = registry.getRootLogger();
