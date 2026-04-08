/**
 * SceneGroupNode - A semantic scene container that wraps ordered ShotNodes.
 * Renders as a dashed-border container with scene metadata in the header.
 * Child ShotNodes remain in canvasData.nodes; shotIds stores order only.
 */

import type { SceneGroupCanvasNode, CanvasViewport } from '@neko/shared';
import { BaseNode } from './BaseNode';
import { EditableText } from '../common/EditableText';
import { InlineInput, InlineSelect, TIME_OF_DAY } from '../common/InlineControls';

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
  selectedShotCount?: number;
  onAssignSelectedShots?: (sceneId: string) => void;
  onAutoLayoutShots?: (sceneId: string) => void;
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
  selectedShotCount = 0,
  onAssignSelectedShots,
  onAutoLayoutShots,
}: SceneGroupNodeProps) {
  const { sceneTitle, sceneNumber, location, timeOfDay, shotIds } = node.data;

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
          className="px-3 py-2 flex-shrink-0"
          style={{
            borderBottom: '1px dashed var(--node-divider)',
            backgroundColor: 'var(--node-header-bg)',
          }}
        >
          {/* Row 1: type tag + scene number + title + shot count */}
          <div className="flex items-center gap-1.5">
            <span
              className="px-1.5 py-0.5 rounded text-xs font-medium flex-shrink-0"
              style={{ backgroundColor: '#22c55e20', color: '#22c55e' }}
            >
              SCENE
            </span>
            <div
              className="flex-shrink-0 w-5 h-5 rounded flex items-center justify-center font-mono font-bold"
              style={{ backgroundColor: '#3b82f620', color: '#3b82f6', fontSize: 10 }}
            >
              {sceneNumber}
            </div>
            <EditableText
              value={sceneTitle}
              onChange={(val) => onUpdateData?.(node.id, { sceneTitle: val })}
              placeholder="场景标题"
              className="font-medium flex-1 min-w-0 truncate"
              style={{ color: 'var(--node-fg)', fontSize: 12 }}
              disabled={node.locked}
            />
            <div
              className="flex-shrink-0 text-xs"
              style={{ color: 'var(--node-fg-secondary)' }}
              title={`${shotIds.length} 个镜头`}
            >
              {shotIds.length} 镜
            </div>
          </div>
          {/* Row 2: controls */}
          <div className="flex items-center gap-1.5 mt-1">
            <InlineInput
              value={location ?? ''}
              onChange={(v) => onUpdateData?.(node.id, { location: v || undefined })}
              placeholder="地点"
              width={80}
            />
            <InlineSelect
              value={timeOfDay ?? ''}
              options={TIME_OF_DAY}
              onChange={(v) => onUpdateData?.(node.id, { timeOfDay: v || undefined })}
              width={64}
            />
            <div className="flex-1" />
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAssignSelectedShots?.(node.id);
              }}
              disabled={selectedShotCount === 0}
              style={{
                fontSize: 9,
                padding: '2px 6px',
                borderRadius: 3,
                border: '1px solid var(--node-border)',
                backgroundColor: 'transparent',
                color:
                  selectedShotCount > 0 ? 'var(--neko-fg)' : 'var(--node-fg-secondary)',
                cursor: selectedShotCount > 0 ? 'pointer' : 'not-allowed',
                opacity: selectedShotCount > 0 ? 1 : 0.5,
              }}
            >
              纳管 {selectedShotCount > 0 ? `(${selectedShotCount})` : ''}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAutoLayoutShots?.(node.id);
              }}
              disabled={shotIds.length === 0}
              style={{
                fontSize: 9,
                padding: '2px 6px',
                borderRadius: 3,
                border: '1px solid var(--node-border)',
                backgroundColor: 'transparent',
                color: shotIds.length > 0 ? 'var(--neko-fg)' : 'var(--node-fg-secondary)',
                cursor: shotIds.length > 0 ? 'pointer' : 'not-allowed',
                opacity: shotIds.length > 0 ? 1 : 0.5,
              }}
            >
              整理布局
            </button>
          </div>
        </div>

        {/* ── Horizontal shot strip placeholder ── */}
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
      </div>
    </BaseNode>
  );
}
