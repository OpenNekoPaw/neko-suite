import { createOperationToolAdapterRegistry } from '@neko/shared';
import type { IOperationToolAdapterRegistry } from '@neko/shared';
import { createTimelineElementUpdateAdapter } from './timelineElementUpdateAdapter';
import { createCanvasNodeUpdateAdapter } from './canvasNodeUpdateAdapter';
import { createModelElementUpdateAdapter } from './modelElementUpdateAdapter';

export interface DefaultOperationToolAdapterRegistryOptions {
  readonly now?: () => number;
}

export function createDefaultOperationToolAdapterRegistry(
  options: DefaultOperationToolAdapterRegistryOptions = {},
): IOperationToolAdapterRegistry {
  const registry = createOperationToolAdapterRegistry();
  registry.register(createTimelineElementUpdateAdapter({ now: options.now }));
  registry.register(createCanvasNodeUpdateAdapter({ now: options.now }));
  registry.register(createModelElementUpdateAdapter({ now: options.now }));
  return registry;
}
