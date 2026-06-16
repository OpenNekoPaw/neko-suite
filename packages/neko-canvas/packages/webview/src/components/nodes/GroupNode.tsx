/**
 * GroupNode - Group container node component
 * Displays a dashed container with child node list and label
 */

import type { CanvasViewport, GroupCanvasNode, CanvasNode } from '@neko/shared';
import { getContainerChildIds } from '@neko/shared';
import { toCodiconClassName, type CodiconName } from '@neko/ui/icons';
import { BaseNode } from './BaseNode';
import { t } from '../../i18n';

// =============================================================================
// Types
// =============================================================================

export interface GroupNodeProps {
  node: GroupCanvasNode;
  allNodes: CanvasNode[];
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
  onUpdateData?: (nodeId: string, data: Record<string, unknown>) => void;
}

// =============================================================================
// Constants
// =============================================================================

const NODE_TYPE_ICONS: Record<string, CodiconName> = {
  media: 'symbol-misc',
  storyboard: 'symbol-structure',
  annotation: 'edit',
  text: 'symbol-misc',
  artboard: 'symbol-color',
  group: 'symbol-namespace',
};

// =============================================================================
// Component
// =============================================================================

export function GroupNode({
  node,
  allNodes,
  viewport,
  isSelected,
  onSelect,
  onDrag,
  onMove,
  onResize,
  onResizeEnd,
  onConnectionStart,
}: GroupNodeProps) {
  const { label, color } = node.data;
  const childIds = getContainerChildIds(node);
  const groupColor = color || '#6b7280';

  // Resolve child nodes
  const childNodes = childIds
    .map((id) => allNodes.find((n) => n.id === id))
    .filter((n): n is CanvasNode => n != null);

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
      className="group-node"
    >
      <div
        className="w-full h-full flex flex-col"
        style={{
          backgroundColor: `${groupColor}10`,
          borderColor: groupColor,
        }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-2 px-3 py-1.5 text-xs border-b"
          style={{
            backgroundColor: `${groupColor}20`,
            borderColor: `${groupColor}40`,
            color: 'var(--toolbar-fg)',
          }}
        >
          <span
            className={toCodiconClassName('symbol-namespace')}
            style={{ color: groupColor }}
            aria-hidden="true"
          />
          <span className="font-medium truncate">{label || t('node.group')}</span>
          <span
            className="ml-auto text-[10px] px-1.5 py-0.5 rounded"
            style={{
              backgroundColor: `${groupColor}20`,
              color: 'var(--toolbar-fg-secondary)',
            }}
          >
            {childNodes.length}
          </span>
        </div>

        {/* Child node list */}
        <div className="flex-1 overflow-auto px-2 py-1.5 space-y-0.5">
          {childNodes.length === 0 ? (
            <div
              className="text-[10px] text-center py-2 italic"
              style={{ color: 'var(--toolbar-fg-secondary)' }}
            >
              {t('group.empty')}
            </div>
          ) : (
            childNodes.map((child) => <ChildNodeItem key={child.id} node={child} />)
          )}
        </div>
      </div>
    </BaseNode>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

function ChildNodeItem({ node }: { node: CanvasNode }) {
  const nodeType = node.type as string;
  const icon = NODE_TYPE_ICONS[nodeType] ?? 'circle-large-filled';
  const data = node.data as Record<string, unknown>;
  const name =
    (data.label as string) ?? (data.title as string) ?? (data.name as string) ?? `${nodeType}`;

  return (
    <div
      className="flex items-center gap-1.5 px-1.5 py-0.5 rounded text-[10px] truncate"
      style={{
        color: 'var(--toolbar-fg)',
        backgroundColor: 'var(--control-bg)',
      }}
    >
      <span className={`${toCodiconClassName(icon)} text-[10px] opacity-70`} aria-hidden="true" />
      <span className="truncate">{name}</span>
    </div>
  );
}
