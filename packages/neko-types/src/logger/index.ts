/**
 * Logger Module
 *
 * Unified logging abstraction for all Neko Suite packages.
 *
 * Layer 0 (this module): ILogger interface + ConsoleLogger default
 * Layer 1 (vscode/extension/logger): OutputChannelTransport for Extension Host
 */
export { LogLevel } from './types';
export type { ILogger, ILogTransport, LogEntry, LoggerFactory } from './types';
export { ConsoleLogger, ConsoleTransport } from './console-logger';
