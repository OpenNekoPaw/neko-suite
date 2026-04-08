/**
 * SceneGroupNode - A semantic scene container that wraps ordered ShotNodes.
 * Renders as a dashed-border container with scene metadata in the header.
 * Child ShotNodes remain in canvasData.nodes; shotIds stores order only.
 */

import { useMemo, useState } from 'react';
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
  onBatchGenerateShots?: (sceneId: string) => void;
  shots?: Array<{ id: string; shotNumber?: number }>;
  onReorderShots?: (sceneId: string, shotIds: string[]) => void;
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
  onBatchGenerateShots,
  shots = [],
  onReorderShots,
}: SceneGroupNodeProps) {
  const { sceneTitle, sceneNumber, location, timeOfDay, shotIds } = node.data;
  const [draggedShotId, setDraggedShotId] = useState<string | null>(null);
  const orderedShots = useMemo(() => {
    const shotMap = new Map(shots.map((shot) => [shot.id, shot]));
    return shotIds
      .map((shotId) => shotMap.get(shotId))
      .filter((shot): shot is NonNullable<typeof shot> => Boolean(shot));
  }, [shotIds, shots]);

  const handleShotDrop = (targetShotId: string) => {
    if (!draggedShotId || draggedShotId === targetShotId) return;
    const fromIndex = shotIds.indexOf(draggedShotId);
    const toIndex = shotIds.indexOf(targetShotId);
    if (fromIndex < 0 || toIndex < 0) return;

    const nextShotIds = [...shotIds];
    nextShotIds.splice(fromIndex, 1);
    nextShotIds.splice(toIndex, 0, draggedShotId);
    onReorderShots?.(node.id, nextShotIds);
  };

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
                color: selectedShotCount > 0 ? 'var(--neko-fg)' : 'var(--node-fg-secondary)',
                cursor: selectedShotCount > 0 ? 'pointer' : 'not-allowed',
                opacity: selectedShotCount > 0 ? 1 : 0.5,
              }}
            >
              纳管 {selectedShotCount > 0 ? `(${selectedShotCount})` : ''}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onBatchGenerateShots?.(node.id);
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
              批量生成
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
          className="flex-1 flex items-center justify-center px-2 py-2"
          style={{ color: 'var(--node-fg-secondary)' }}
        >
          {shotIds.length === 0 ? (
            <span style={{ opacity: 0.4 }}>拖入 ShotNode 到此场景</span>
          ) : (
            <div className="flex flex-wrap gap-1.5 items-center justify-center">
              {orderedShots.map((shot, i) => (
                <div
                  key={shot.id}
                  draggable={!node.locked}
                  onMouseDown={(e) => e.stopPropagation()}
                  onDragStart={(e) => {
                    e.stopPropagation();
                    setDraggedShotId(shot.id);
                    e.dataTransfer.effectAllowed = 'move';
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleShotDrop(shot.id);
                    setDraggedShotId(null);
                  }}
                  onDragEnd={() => setDraggedShotId(null)}
                  className="px-2 py-1 rounded-md flex items-center gap-1.5"
                  style={{
                    backgroundColor:
                      draggedShotId === shot.id ? 'rgba(59,130,246,0.18)' : 'var(--control-bg)',
                    border: '1px solid var(--node-border)',
                    color: 'var(--neko-fg)',
                    opacity: 0.6 + (i / Math.max(shotIds.length, 1)) * 0.4,
                    cursor: node.locked ? 'default' : 'grab',
                  }}
                  title={`镜头 ${shot.shotNumber ?? i + 1}`}
                >
                  <span style={{ fontSize: 9, opacity: 0.6 }}>⋮⋮</span>
                  <span className="font-mono" style={{ fontSize: 10 }}>
                    #{String(shot.shotNumber ?? i + 1).padStart(2, '0')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </BaseNode>
  );
}
