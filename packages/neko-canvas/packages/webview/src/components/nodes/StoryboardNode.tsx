/**
 * StoryboardNode - Storyboard node component
 * Displays storyboard information with editable title and description
 */

import type { StoryboardCanvasNode, CanvasViewport } from '@neko/shared';
import { BaseNode } from './BaseNode';
import { EditableText } from '../common/EditableText';
import { t } from '../../i18n';

// =============================================================================
// Types
// =============================================================================

export interface StoryboardNodeProps {
  node: StoryboardCanvasNode;
  viewport: CanvasViewport;
  isSelected: boolean;
  onSelect?: (nodeId: string, multi: boolean) => void;
  onDrag?: (nodeId: string, position: { x: number; y: number }) => void;
  onMove?: (nodeId: string, position: { x: number; y: number }) => void;
  onResize?: (
    nodeId: string,
    size: { width: number; height: number },
    position: { x: number; y: number },
  ) => void;
  onResizeEnd?: (
    nodeId: string,
    size: { width: number; height: number },
    position: { x: number; y: number },
  ) => void;
  onConnectionStart?: (nodeId: string, anchor: string, e: React.MouseEvent) => void;
  onUpdateData?: (nodeId: string, data: Partial<StoryboardCanvasNode['data']>) => void;
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
  onDrag,
  onMove,
  onResize,
  onResizeEnd,
  onConnectionStart,
  onUpdateData,
}: StoryboardNodeProps) {
  const { title, description, duration, color } = node.data;

  return (
    <BaseNode
      node={node}
      viewport={viewport}
      isSelected={isSelected}
      onSelect={onSelect}
      onDrag={onDrag}
      onMove={onMove}
      onResize={onResize}
      onResizeEnd={onResizeEnd}
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
            <div className="flex-1 min-w-0">
              <EditableText
                value={title}
                onChange={(val) => onUpdateData?.(node.id, { title: val })}
                placeholder={t('node.editPlaceholder')}
                className="text-sm font-medium truncate"
                style={{ color: 'var(--toolbar-fg)' }}
                disabled={node.locked}
              />
            </div>
            {/* Duration badge */}
            {duration && (
              <div
                className="text-xs flex-shrink-0"
                style={{ color: 'var(--toolbar-fg-secondary)' }}
              >
                {formatDuration(duration)}
              </div>
            )}
          </div>
        </div>

        {/* Description area - editable */}
        <div className="flex-1 p-3 overflow-hidden">
          <EditableText
            value={description || ''}
            onChange={(val) => onUpdateData?.(node.id, { description: val })}
            multiline
            placeholder={t('node.descPlaceholder')}
            className="text-xs line-clamp-4"
            style={{ color: 'var(--toolbar-fg-secondary)' }}
            disabled={node.locked}
          />
        </div>

        {/* Footer */}
        <div className="px-3 py-1.5 border-t border-[var(--node-border)] bg-black/20">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase" style={{ color: 'var(--toolbar-fg-secondary)' }}>
              {t('node.storyboard')}
            </span>
            <span className="text-xs" style={{ color: 'var(--toolbar-fg-secondary)' }}>
              📋
            </span>
          </div>
        </div>
      </div>
    </BaseNode>
  );
}
