/**
 * StoryboardNode - Storyboard node component
 * Displays storyboard information with title, description, and duration
 */

import type { StoryboardCanvasNode, CanvasViewport } from '@uniedit/shared';
import { BaseNode } from './BaseNode';

// =============================================================================
// Types
// =============================================================================

export interface StoryboardNodeProps {
  node: StoryboardCanvasNode;
  viewport: CanvasViewport;
  isSelected: boolean;
  onSelect?: (nodeId: string, multi: boolean) => void;
  onMove?: (nodeId: string, position: { x: number; y: number }) => void;
  onConnectionStart?: (nodeId: string, anchor: string) => void;
}

// =============================================================================
// Helpers
// =============================================================================

function formatDuration(seconds?: number): string {
  if (!seconds) return '';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

// =============================================================================
// Component
// =============================================================================

export function StoryboardNode({
  node,
  viewport,
  isSelected,
  onSelect,
  onMove,
  onConnectionStart,
}: StoryboardNodeProps) {
  const { title, description, duration, color } = node.data;

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
        {/* Header with color accent */}
        <div
          className="px-3 py-2 border-b border-[var(--node-border)]"
          style={{ backgroundColor: color ? `${color}20` : undefined }}
        >
          <div className="flex items-center gap-2">
            {/* Color indicator */}
            {color && (
              <div
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: color }}
              />
            )}
            <div className="text-sm font-medium text-gray-200 truncate flex-1">
              {title}
            </div>
            {/* Duration badge */}
            {duration && (
              <div className="text-xs text-gray-400 flex-shrink-0">
                {formatDuration(duration)}
              </div>
            )}
          </div>
        </div>

        {/* Description area */}
        <div className="flex-1 p-3 overflow-hidden">
          {description ? (
            <p className="text-xs text-gray-400 line-clamp-4">
              {description}
            </p>
          ) : (
            <p className="text-xs text-gray-600 italic">
              No description
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="px-3 py-1.5 border-t border-[var(--node-border)] bg-black/20">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500 uppercase">Storyboard</span>
            <span className="text-xs text-gray-500">📋</span>
          </div>
        </div>
      </div>
    </BaseNode>
  );
}
