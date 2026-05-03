import { createOperationToolAdapterRegistry } from '@neko/shared';
import type { IOperationToolAdapterRegistry } from '@neko/shared';
import { createCanvasNodeUpdateAdapter } from './canvas-node-update-adapter';
import { createModelElementUpdateAdapter } from './model-element-update-adapter';
import { createTimelineElementUpdateAdapter } from './timeline-element-update-adapter';

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
