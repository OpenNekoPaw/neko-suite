/**
 * SceneGroupNode - A semantic scene container that wraps ordered ShotNodes.
 * Renders as a dashed-border container with scene metadata in the header.
 * Child ShotNodes remain in canvasData.nodes; shotIds stores order only.
 */

import type { SceneGroupCanvasNode, CanvasViewport } from '@neko/shared';
import { BaseNode } from './BaseNode';
import { EditableText } from '../common/EditableText';

// =============================================================================
// Types
// =============================================================================

export interface SceneGroupNodeProps {
  node: SceneGroupCanvasNode;
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
  onUpdateData?: (nodeId: string, data: Partial<SceneGroupCanvasNode['data']>) => void;
}

// =============================================================================
// Component
// =============================================================================

export function SceneGroupNode({
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
}: SceneGroupNodeProps) {
  const { sceneTitle, sceneNumber, location, timeOfDay, shotIds } = node.data;

  const subtitle = [location, timeOfDay].filter(Boolean).join(' · ');

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
      <div className="flex flex-col h-full text-xs">
        {/* ── Header ── */}
        <div
          className="flex items-start gap-2 px-3 py-2 flex-shrink-0"
          style={{
            borderBottom: '1px dashed var(--node-divider)',
            backgroundColor: 'var(--node-header-bg)',
          }}
        >
          {/* Scene number badge */}
          <div
            className="flex-shrink-0 w-6 h-6 rounded flex items-center justify-center font-mono font-bold text-xs"
            style={{ backgroundColor: '#3b82f620', color: '#3b82f6' }}
          >
            {sceneNumber}
          </div>

          <div className="flex-1 min-w-0">
            <EditableText
              value={sceneTitle}
              onChange={(val) => onUpdateData?.(node.id, { sceneTitle: val })}
              placeholder="场景标题"
              className="font-medium"
              style={{ color: 'var(--node-fg)', fontSize: 12 }}
              disabled={node.locked}
            />
            {subtitle && (
              <div
                className="truncate mt-0.5"
                style={{ color: 'var(--node-fg-secondary)', fontSize: 10 }}
              >
                {subtitle}
              </div>
            )}
          </div>

          {/* Shot count */}
          <div
            className="flex-shrink-0 text-xs"
            style={{ color: 'var(--node-fg-secondary)' }}
            title={`${shotIds.length} 个镜头`}
          >
            {shotIds.length} 镜
          </div>
        </div>

        {/* ── Horizontal shot strip placeholder ── */}
        {/* ShotNodes are rendered independently on the canvas; this area
            shows a summary strip when the group is collapsed or zoomed out. */}
        <div
          className="flex-1 flex items-center justify-center"
          style={{ color: 'var(--node-fg-secondary)', opacity: 0.4 }}
        >
          {shotIds.length === 0 ? (
            <span>拖入 ShotNode 到此场景</span>
          ) : (
            <div className="flex gap-1 items-center">
              {shotIds.slice(0, 8).map((id, i) => (
                <div
                  key={id}
                  className="w-4 h-5 rounded-sm flex-shrink-0"
                  style={{
                    backgroundColor: 'var(--node-border)',
                    opacity: 0.5 + (i / shotIds.length) * 0.5,
                  }}
                />
              ))}
              {shotIds.length > 8 && <span style={{ fontSize: 9 }}>+{shotIds.length - 8}</span>}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div
          className="px-3 py-1 flex items-center justify-between flex-shrink-0"
          style={{
            borderTop: '1px dashed var(--node-divider)',
            backgroundColor: 'var(--node-header-bg)',
          }}
        >
          <span style={{ color: 'var(--node-fg-secondary)' }}>SCENE</span>
          <span style={{ color: 'var(--node-fg-secondary)' }}>🎥</span>
        </div>
      </div>
    </BaseNode>
  );
}
