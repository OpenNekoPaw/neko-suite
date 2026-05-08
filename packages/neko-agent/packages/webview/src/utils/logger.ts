/**
 * Webview Logger Registry
 *
 * Browser-side logger for neko-agent webview.
 * Uses ConsoleLogger from @neko/shared with Warn level.
 */
import { createLoggerRegistry, LogLevel } from '@neko/shared';

const registry = createLoggerRegistry('NekoAgent', LogLevel.Warn);

export const { getLogger } = registry;
