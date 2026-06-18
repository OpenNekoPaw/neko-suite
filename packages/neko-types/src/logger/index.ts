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
export { CapturedLogTransport } from './captured-log-transport';
export {
  emitDiagnostic,
  classifyCommonFailureReason,
  toDiagnosticError,
  type DiagnosticErrorData,
  type DiagnosticLevel,
  type RuntimeDiagnostic,
} from './diagnostic';

// Logger registry factory — eliminates boilerplate in each package
import type { ILogger } from './types';
import { LogLevel } from './types';
import { ConsoleLogger, type LogLevelRef } from './console-logger';

export interface LoggerRegistry {
  readonly setRootLogger: (logger: ILogger) => void;
  readonly getRootLogger: () => ILogger;
  readonly getLogger: (source: string) => ILogger;
}

export interface CreateWebviewLoggerRegistryOptions {
  readonly packageName: string;
  readonly defaultLevel?: LogLevel;
  readonly rootLogger?: ILogger;
}

/**
 * Create a logger registry for a package.
 *
 * Each package calls this once to get its own setRootLogger/getLogger/getRootLogger
 * functions, backed by a module-scoped root logger instance.
 *
 * When setRootLogger replaces the root, any loggers already created via getLogger()
 * are bridged to the new root's level ref so that setLevel() propagates to all.
 *
 * @param packageName Default root logger source name (e.g., 'Agent', 'Platform')
 * @param defaultLevel Default log level (defaults to Info)
 */
export function createLoggerRegistry(
  packageName: string,
  defaultLevel = LogLevel.Info,
): LoggerRegistry {
  const sharedRef: LogLevelRef = { level: defaultLevel };
  let rootLogger: ILogger = new ConsoleLogger(packageName, sharedRef);
  return {
    setRootLogger(logger: ILogger) {
      rootLogger = logger;
      if (logger instanceof ConsoleLogger) {
        // Adopt the shared ref so that pre-existing children (created before
        // setRootLogger) and the new root + its future children all share
        // the same level. setLevel() on the new root propagates everywhere.
        sharedRef.level = logger._levelRef.level;
        logger._levelRef = sharedRef;
      }
    },
    getRootLogger() {
      return rootLogger;
    },
    getLogger(source: string) {
      return rootLogger.child(source);
    },
  };
}

export function createWebviewLoggerRegistry(
  options: CreateWebviewLoggerRegistryOptions,
): LoggerRegistry {
  const registry = createLoggerRegistry(options.packageName, options.defaultLevel);
  if (options.rootLogger) {
    registry.setRootLogger(options.rootLogger);
  }
  return registry;
}
