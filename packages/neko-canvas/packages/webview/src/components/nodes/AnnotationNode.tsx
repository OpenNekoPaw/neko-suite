/**
 * AnnotationNode - Annotation/note node component
 * Displays text annotations with inline editing support
 */

import type { AnnotationCanvasNode, CanvasViewport } from '@neko/shared';
import { BaseNode } from './BaseNode';
import { EditableText } from '../common/EditableText';
import { t } from '../../i18n';

// =============================================================================
// Types
// =============================================================================

export interface AnnotationNodeProps {
  node: AnnotationCanvasNode;
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
  onUpdateData?: (nodeId: string, data: Partial<AnnotationCanvasNode['data']>) => void;
}

// =============================================================================
// Component
// =============================================================================

export function AnnotationNode({
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
}: AnnotationNodeProps) {
  const { content, style } = node.data;
  const fontSize = style?.fontSize || 14;
  const color = style?.color || 'var(--control-fg)';

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
        {/* Header */}
        <div className="px-3 py-1.5 border-b border-[var(--node-border)] bg-yellow-900/20">
          <div className="flex items-center gap-2">
            <span className="text-sm">📝</span>
            <span className="text-xs text-yellow-500/80 uppercase font-medium">
              {t('node.note')}
            </span>
          </div>
        </div>

        {/* Content area - editable */}
        <div className="flex-1 p-3 overflow-auto">
          <EditableText
            value={content || ''}
            onChange={(val) => onUpdateData?.(node.id, { content: val })}
            multiline
            placeholder={t('node.editPlaceholder')}
            className="whitespace-pre-wrap break-words"
            style={{ fontSize: `${fontSize}px`, color, lineHeight: 1.5 }}
            disabled={node.locked}
          />
        </div>
      </div>
    </BaseNode>
  );
}
