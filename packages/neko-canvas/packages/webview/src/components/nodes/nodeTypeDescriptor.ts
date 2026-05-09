/**
 * Node Type Descriptor — unified metadata for each canvas node type.
 *
 * Converges three previously scattered definitions into a single source of truth:
 *   - Display label i18n key (was in PropertyPanel.tsx:getNodeTypeLabel)
 *   - Toolbar icon           (was in CanvasToolbar.tsx inline emoji)
 *   - Default creation size  (was in nodeFactory.ts switch cases)
 *
 * Property panel renderers remain in PropertyPanel.tsx to avoid circular imports
 * (PropertyPanel depends on i18n + form helpers that would create a cycle).
 */

import type { CanvasNodeType } from '@neko/shared';

// =============================================================================
// Types
// =============================================================================

export interface NodeDefaultSize {
  width: number;
  height: number;
}

export interface NodeTypeDescriptor {
  /** Canvas node type (matches CanvasNodeType union) */
  type: CanvasNodeType;
  /** i18n key for the display label, resolved via t() at render time */
  labelKey: string;
  /** Toolbar icon emoji string */
  icon: string;
  /** Default size when creating a new node of this type */
  defaultSize: NodeDefaultSize;
}

/**
 * Complete registry of all node type descriptors.
 */
export type NodeTypeDescriptorRegistry = Record<CanvasNodeType, NodeTypeDescriptor>;

// =============================================================================
// Accessor utilities
// =============================================================================

/**
 * Resolve the i18n display label for a node type.
 */
export function getNodeLabel(
  registry: NodeTypeDescriptorRegistry,
  type: CanvasNodeType,
  t: (key: string) => string,
): string {
  const descriptor = registry[type];
  return descriptor ? t(descriptor.labelKey) : type;
}

/**
 * Get the default size for a node type.
 */
export function getNodeDefaultSize(
  registry: NodeTypeDescriptorRegistry,
  type: CanvasNodeType,
): NodeDefaultSize {
  const descriptor = registry[type];
  return descriptor ? descriptor.defaultSize : { width: 200, height: 100 };
}
