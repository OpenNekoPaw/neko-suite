/**
 * SceneGroupNode - A semantic scene container that wraps ordered ShotNodes.
 * Renders as a dashed-border container with scene metadata in the header.
 * Child ShotNodes remain in canvasData.nodes; shotIds stores order only.
 * Managed shots are displayed as a thumbnail grid inside this node.
 */

import { useMemo, useState } from 'react';
import type { SceneGroupCanvasNode, CanvasViewport, ShotScale } from '@neko/shared';
import { BaseNode } from './BaseNode';
import { EditableText } from '../common/EditableText';
import { InlineInput, InlineSelect, TIME_OF_DAY } from '../common/InlineControls';
import { t } from '../../i18n';

// =============================================================================
// Types
// =============================================================================

export interface ShotThumbnailData {
  id: string;
  shotNumber?: number;
  shotScale?: ShotScale;
  generatedImage?: string;
  generationStatus?: string;
  visualDescription?: string;
}

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
  shots?: ShotThumbnailData[];
  onReorderShots?: (sceneId: string, shotIds: string[]) => void;
  onDetachShot?: (sceneId: string, shotId: string) => void;
  onShotThumbnailClick?: (shotId: string) => void;
}

// =============================================================================
// Constants
// =============================================================================

const SHOT_SCALE_SHORT: Record<string, string> = {
  ECU: 'ECU',
  CU: 'CU',
  MCU: 'MCU',
  MS: 'MS',
  MLS: 'MLS',
  LS: 'LS',
  VLS: 'VLS',
  ELS: 'ELS',
};

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
  onDetachShot,
  onShotThumbnailClick,
}: SceneGroupNodeProps) {
  const { sceneTitle, sceneNumber, location, timeOfDay, shotIds } = node.data;
  const [draggedShotId, setDraggedShotId] = useState<string | null>(null);
  const [hoveredShotId, setHoveredShotId] = useState<string | null>(null);
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
              placeholder={t('scene.titlePlaceholder')}
              className="font-medium flex-1 min-w-0 truncate"
              style={{ color: 'var(--node-fg)', fontSize: 12 }}
              disabled={node.locked}
            />
            <div
              className="flex-shrink-0 text-xs"
              style={{ color: 'var(--node-fg-secondary)' }}
              title={t('scene.shotCountTitle', { count: shotIds.length })}
            >
              {t('scene.shotCountCompact', { count: shotIds.length })}
            </div>
          </div>
          {/* Row 2: controls */}
          <div className="flex items-center gap-1.5 mt-1">
            <InlineInput
              value={location ?? ''}
              onChange={(v) => onUpdateData?.(node.id, { location: v || undefined })}
              placeholder={t('scene.locationPlaceholder')}
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
              {t('scene.assignShots')} {selectedShotCount > 0 ? `(${selectedShotCount})` : ''}
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
              {t('scene.batchGenerate')}
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
              {t('scene.autoLayout')}
            </button>
          </div>
        </div>

        {/* ── Shot thumbnail grid ── */}
        <div
          className="flex-1 overflow-auto px-2 py-2"
          style={{ color: 'var(--node-fg-secondary)' }}
        >
          {shotIds.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <span style={{ opacity: 0.4 }}>{t('scene.emptyHint')}</span>
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                gap: 6,
              }}
            >
              {orderedShots.map((shot, i) => (
                <div
                  key={shot.id}
                  draggable={!node.locked}
                  onMouseDown={(e) => e.stopPropagation()}
                  onMouseEnter={() => setHoveredShotId(shot.id)}
                  onMouseLeave={() => setHoveredShotId(null)}
                  onClick={(e) => {
                    e.stopPropagation();
                    onShotThumbnailClick?.(shot.id);
                  }}
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
                  className="relative rounded-md overflow-hidden"
                  style={{
                    border:
                      draggedShotId === shot.id
                        ? '1.5px solid #3b82f6'
                        : '1px solid var(--node-border)',
                    backgroundColor: 'var(--node-surface)',
                    cursor: node.locked ? 'default' : 'pointer',
                    opacity: draggedShotId === shot.id ? 0.6 : 1,
                  }}
                  title={shot.visualDescription || t('scene.shotThumbnailHint')}
                >
                  {/* Thumbnail image area */}
                  <div
                    className="relative flex items-center justify-center overflow-hidden"
                    style={{ height: 72, backgroundColor: 'var(--node-surface)' }}
                  >
                    {shot.generationStatus === 'generating' ? (
                      <div
                        className="w-4 h-4 rounded-full border-2 border-t-transparent animate-spin"
                        style={{ borderColor: '#3b82f688', borderTopColor: 'transparent' }}
                      />
                    ) : shot.generatedImage ? (
                      <img
                        src={shot.generatedImage}
                        alt={`Shot ${shot.shotNumber ?? i + 1}`}
                        className="w-full h-full object-cover"
                        draggable={false}
                      />
                    ) : (
                      <span style={{ fontSize: 18, opacity: 0.2 }}>⌘</span>
                    )}

                    {/* Status dot */}
                    {shot.generationStatus && shot.generationStatus !== 'idle' && (
                      <div
                        className="absolute top-1 right-1 w-2 h-2 rounded-full"
                        style={{
                          backgroundColor:
                            shot.generationStatus === 'done'
                              ? '#22c55e'
                              : shot.generationStatus === 'error'
                                ? '#ef4444'
                                : shot.generationStatus === 'generating'
                                  ? '#3b82f6'
                                  : '#f59e0b',
                        }}
                      />
                    )}

                    {/* Detach button on hover */}
                    {!node.locked && hoveredShotId === shot.id && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDetachShot?.(node.id, shot.id);
                        }}
                        className="absolute top-0.5 left-0.5 flex items-center justify-center"
                        style={{
                          width: 16,
                          height: 16,
                          fontSize: 10,
                          lineHeight: 1,
                          borderRadius: 3,
                          border: 'none',
                          background: 'rgba(0,0,0,0.5)',
                          color: '#fff',
                          cursor: 'pointer',
                        }}
                        title={t('scene.detachShotTitle')}
                      >
                        ×
                      </button>
                    )}
                  </div>

                  {/* Footer: shot number + scale */}
                  <div
                    className="flex items-center justify-between px-1.5 py-1"
                    style={{
                      borderTop: '1px solid var(--node-border)',
                      backgroundColor: 'var(--control-bg)',
                    }}
                  >
                    <span className="font-mono" style={{ fontSize: 9, color: 'var(--neko-fg)' }}>
                      #{String(shot.shotNumber ?? i + 1).padStart(2, '0')}
                    </span>
                    {shot.shotScale && (
                      <span
                        style={{
                          fontSize: 8,
                          color: 'var(--node-fg-secondary)',
                          backgroundColor: 'var(--node-header-bg)',
                          padding: '0 3px',
                          borderRadius: 2,
                        }}
                      >
                        {SHOT_SCALE_SHORT[shot.shotScale] ?? shot.shotScale}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </BaseNode>
  );
}
