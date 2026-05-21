/**
 * Unified Node Type Descriptors
 *
 * Single source of truth for node type metadata: label, icon, tag, and default size.
 */

import type { NodeTypeDescriptorRegistry } from './nodeTypeDescriptor';
import { createCoreNodeTypeDescriptors } from '../../subsystems/core/descriptors';
import { createStoryboardNodeTypeDescriptors } from '../../subsystems/storyboard/descriptors';

export function createBuiltInNodeTypeDescriptors(): NodeTypeDescriptorRegistry {
  return {
    ...createCoreNodeTypeDescriptors(),
    ...createStoryboardNodeTypeDescriptors(),
  };
}
