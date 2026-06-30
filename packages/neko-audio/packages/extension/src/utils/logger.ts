import type { ILogger } from '@neko/shared';
import { createLoggerRegistry } from '@neko/shared';

const registry = createLoggerRegistry('NekoAudio');

export function setRootLogger(logger: ILogger): void {
  registry.setRootLogger(logger);
}

export function getRootLogger(): ILogger {
  return registry.getRootLogger();
}

export function getLogger(source: string): ILogger {
  return registry.getLogger(source);
}
