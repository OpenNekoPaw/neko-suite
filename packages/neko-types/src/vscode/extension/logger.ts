/**
 * VSCode OutputChannel Logger Transport
 *
 * Layer 1: Requires vscode API (Extension Host only).
 * Import via: @neko/shared/vscode/extension
 */

import * as vscode from 'vscode';
import { LogLevel, type ILogTransport, type LogEntry } from '../../logger/types';
import { ConsoleLogger } from '../../logger/console-logger';

const LEVEL_LABELS: Record<LogLevel, string> = {
  [LogLevel.Debug]: 'DEBUG',
  [LogLevel.Info]: 'INFO',
  [LogLevel.Warn]: 'WARN',
  [LogLevel.Error]: 'ERROR',
  [LogLevel.Off]: 'OFF',
};

/**
 * OutputChannel transport - writes structured logs to VSCode Output panel
 */
export class OutputChannelTransport implements ILogTransport {
  constructor(private readonly channel: vscode.OutputChannel) {}

  write(entry: LogEntry): void {
    const ts = new Date(entry.timestamp).toISOString().slice(11, 23);
    const level = LEVEL_LABELS[entry.level] ?? 'INFO';
    this.channel.appendLine(
      `[${ts}] [${level}] [${entry.source}] ${entry.message}`,
    );
    if (entry.error?.stack) {
      this.channel.appendLine(entry.error.stack);
    }
  }

  dispose(): void {
    this.channel.dispose();
  }
}

/**
 * Create a logger backed by a VSCode OutputChannel
 *
 * Usage in extension activate():
 * ```typescript
 * const logger = createVSCodeLogger('Neko Cut', 'NekoCut', context);
 * logger.info('Extension activated');
 *
 * const exportLogger = logger.child('Export');
 * exportLogger.info('Export started');
 * ```
 *
 * @param channelName - Display name in VSCode Output panel dropdown
 * @param source - Log source prefix
 * @param context - Extension context (for disposal)
 * @param level - Minimum log level (default: Info)
 */
export function createVSCodeLogger(
  channelName: string,
  source: string,
  context: vscode.ExtensionContext,
  level: LogLevel = LogLevel.Info,
): ConsoleLogger {
  const channel = vscode.window.createOutputChannel(channelName);
  context.subscriptions.push(channel);
  return new ConsoleLogger(source, level, [
    new OutputChannelTransport(channel),
  ]);
}
