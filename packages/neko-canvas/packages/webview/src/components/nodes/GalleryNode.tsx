/**
 * GalleryNode - Multi-view character reference sheet.
 * Supports presets: 3-view, 4-view, 9-expression, 8-turnaround, scene-views.
 * Each cell can be independently generated and used as IP-Adapter reference.
 */

import type { GalleryCanvasNode, GalleryCell, GalleryPreset, CanvasViewport } from '@neko/shared';
import { GALLERY_PRESET_CONFIGS } from '@neko/shared';
import { BaseNode } from './BaseNode';
import { EditableText } from '../common/EditableText';
import { InlineSelect, GALLERY_PRESETS } from '../common/InlineControls';

// =============================================================================
// Types
// =============================================================================

export interface GalleryNodeProps {
  node: GalleryCanvasNode;
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
  onUpdateData?: (nodeId: string, data: Partial<GalleryCanvasNode['data']>) => void;
  // Generation is triggered via right-click context menu, not directly on the node
}

// =============================================================================
// Sub-components
// =============================================================================

function CellOverlay({ status }: { status: GalleryCell['generationStatus'] }) {
  if (status === 'generating') {
    return (
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{ backgroundColor: '#00000060' }}
      >
        <div
          className="w-5 h-5 rounded-full border-2"
          style={{
            borderColor: '#3b82f688',
            borderTopColor: 'transparent',
            animation: 'spin 0.8s linear infinite',
          }}
        />
      </div>
    );
  }
  if (status === 'error') {
    return (
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{ backgroundColor: '#ef444430' }}
      >
        <span style={{ color: '#ef4444', fontSize: 10 }}>失败</span>
      </div>
    );
  }
  return null;
}

function GalleryCellView({ cell }: { cell: GalleryCell }) {
  return (
    <div
      className="relative overflow-hidden flex flex-col"
      style={{
        border: '1px solid var(--node-border)',
        borderRadius: 4,
        backgroundColor: 'var(--node-surface)',
        minHeight: 60,
      }}
      title={cell.label}
    >
      {/* Image or placeholder */}
      {cell.image ? (
        <img
          src={cell.image}
          alt={cell.label}
          className="w-full h-full object-cover flex-1"
          draggable={false}
        />
      ) : (
        <div
          className="flex-1 flex flex-col items-center justify-center gap-0.5"
          style={{
            color: 'var(--node-fg-secondary)',
            opacity: 0.4,
          }}
        >
          <span style={{ fontSize: 18 }}>+</span>
          <span style={{ fontSize: 9 }}>{cell.label}</span>
        </div>
      )}

      {/* Status overlay */}
      <CellOverlay status={cell.generationStatus} />

      {/* Label bar */}
      <div
        className="absolute bottom-0 left-0 right-0 px-1"
        style={{
          backgroundColor: '#00000060',
          fontSize: 8,
          color: '#fff',
          lineHeight: '14px',
          opacity: cell.image ? 1 : 0,
          transition: 'opacity 0.15s',
        }}
      >
        {cell.label}
        {cell.costumeLabel && ` · ${cell.costumeLabel}`}
      </div>
    </div>
  );
}

// =============================================================================
// Component
// =============================================================================

export function GalleryNode({
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
}: GalleryNodeProps) {
  const { preset, rows, cols, cells, characterName } = node.data;

  const doneCount = cells.filter((c) => c.generationStatus === 'done').length;

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
        {/* ── Header: type tag + name + preset + progress ── */}
        <div
          className="flex items-center gap-2 px-2 py-1.5 flex-shrink-0"
          style={{
            borderBottom: '1px solid var(--node-divider)',
            backgroundColor: 'var(--node-header-bg)',
          }}
        >
          <span
            className="px-1.5 py-0.5 rounded text-xs font-medium flex-shrink-0"
            style={{ backgroundColor: '#8b5cf620', color: '#8b5cf6' }}
          >
            GALLERY
          </span>
          <EditableText
            value={characterName ?? ''}
            onChange={(val) => onUpdateData?.(node.id, { characterName: val || undefined })}
            placeholder="角色名"
            className="font-medium flex-1 truncate"
            style={{ color: 'var(--node-fg)', fontSize: 11 }}
          />
          <InlineSelect
            value={preset ?? 'character-3view'}
            options={GALLERY_PRESETS}
            onChange={(v) => {
              const newPreset = v as GalleryPreset;
              const config = GALLERY_PRESET_CONFIGS[newPreset];
              const newCells: GalleryCell[] = config.labels.map((label, i) => ({
                id: `cell-${i}`,
                label,
                generationStatus: 'idle' as const,
              }));
              onUpdateData?.(node.id, {
                preset: newPreset,
                rows: config.rows,
                cols: config.cols,
                cells: newCells,
              });
            }}
            width={96}
          />
          <span style={{ color: 'var(--node-fg-secondary)', fontSize: 9 }}>
            {doneCount}/{cells.length}
          </span>
        </div>

        {/* ── Cell grid ── */}
        <div
          className="flex-1 p-1.5 overflow-auto"
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${cols}, 1fr)`,
            gridTemplateRows: `repeat(${rows}, 1fr)`,
            gap: 4,
          }}
        >
          {cells.map((cell) => (
            <GalleryCellView key={cell.id} cell={cell} />
          ))}
          {/* Fill empty slots if cells < rows*cols */}
          {Array.from({ length: Math.max(0, rows * cols - cells.length) }).map((_, i) => (
            <div
              key={`empty-${i}`}
              style={{
                border: '1px dashed var(--node-border)',
                borderRadius: 4,
                minHeight: 60,
                opacity: 0.3,
              }}
            />
          ))}
        </div>
      </div>
    </BaseNode>
  );
}
