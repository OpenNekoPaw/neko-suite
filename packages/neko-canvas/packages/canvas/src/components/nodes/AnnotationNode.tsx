/**
 * AnnotationNode - Annotation/note node component
 * Displays text annotations with customizable styling
 */

import type { AnnotationCanvasNode, CanvasViewport } from '@uniedit/shared';
import { BaseNode } from './BaseNode';

// =============================================================================
// Types
// =============================================================================

export interface AnnotationNodeProps {
  node: AnnotationCanvasNode;
  viewport: CanvasViewport;
  isSelected: boolean;
  onSelect?: (nodeId: string, multi: boolean) => void;
  onMove?: (nodeId: string, position: { x: number; y: number }) => void;
  onConnectionStart?: (nodeId: string, anchor: string) => void;
}

// =============================================================================
// Component
// =============================================================================

export function AnnotationNode({
  node,
  viewport,
  isSelected,
  onSelect,
  onMove,
  onConnectionStart,
}: AnnotationNodeProps) {
  const { content, style } = node.data;
  const fontSize = style?.fontSize || 14;
  const color = style?.color || '#cccccc';

  return (
    <BaseNode
      node={node}
      viewport={viewport}
      isSelected={isSelected}
      onSelect={onSelect}
      onMove={onMove}
      onConnectionStart={onConnectionStart}
    >
      <div className="flex flex-col h-full">
        {/* Header */}
        <div className="px-3 py-1.5 border-b border-[var(--node-border)] bg-yellow-900/20">
          <div className="flex items-center gap-2">
            <span className="text-sm">📝</span>
            <span className="text-xs text-yellow-500/80 uppercase font-medium">
              Note
            </span>
          </div>
        </div>

        {/* Content area */}
        <div className="flex-1 p-3 overflow-auto">
          <p
            className="whitespace-pre-wrap break-words"
            style={{
              fontSize: `${fontSize}px`,
              color,
              lineHeight: 1.5,
            }}
          >
            {content || 'Empty note'}
          </p>
        </div>
      </div>
    </BaseNode>
  );
}
