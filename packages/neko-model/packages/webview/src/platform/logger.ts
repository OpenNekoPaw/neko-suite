import { createLoggerRegistry } from '@neko/shared';

const registry = createLoggerRegistry('NekoModelWebview');

export const setRootLogger = registry.setRootLogger;
export const getRootLogger = registry.getRootLogger;
export const getLogger = registry.getLogger;
