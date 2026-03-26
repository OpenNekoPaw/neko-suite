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

// Logger registry factory — eliminates boilerplate in each package
import type { ILogger } from './types';
import { LogLevel } from './types';
import { ConsoleLogger } from './console-logger';

/**
 * Create a logger registry for a package.
 *
 * Each package calls this once to get its own setRootLogger/getLogger/getRootLogger
 * functions, backed by a module-scoped root logger instance.
 *
 * @param packageName Default root logger source name (e.g., 'Agent', 'Platform')
 * @param defaultLevel Default log level (defaults to Info)
 */
export function createLoggerRegistry(packageName: string, defaultLevel = LogLevel.Info) {
  let rootLogger: ILogger = new ConsoleLogger(packageName, defaultLevel);
  return {
    setRootLogger(logger: ILogger) {
      rootLogger = logger;
    },
    getRootLogger() {
      return rootLogger;
    },
    getLogger(source: string) {
      return rootLogger.child(source);
    },
  };
}
