import { createLoggerRegistry, LogLevel } from '@neko/shared';

const registry = createLoggerRegistry('NekoDashboard', LogLevel.Warn);

export const { getLogger } = registry;
