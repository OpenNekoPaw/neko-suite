/**
 * GalleryNode - Multi-view character reference sheet.
 * Supports presets: 3-view, 4-view, 9-expression, 8-turnaround, scene-views.
 * Each cell can be independently generated and used as IP-Adapter reference.
 */

import { useState } from 'react';
import type { GalleryCanvasNode, GalleryCell, CanvasViewport } from '@neko/shared';
import { BaseNode } from './BaseNode';

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
  /** Called when the user clicks "+" on a cell (single cell generation) */
  onGenerateCellClick?: (nodeId: string, cellId: string) => void;
  /** Called when the user clicks batch generate */
  onBatchGenerateClick?: (nodeId: string) => void;
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

function GalleryCellView({
  cell,
  nodeId,
  locked,
  onGenerateClick,
}: {
  cell: GalleryCell;
  nodeId: string;
  locked?: boolean;
  onGenerateClick?: (nodeId: string, cellId: string) => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className="relative overflow-hidden flex flex-col"
      style={{
        border: '1px solid var(--node-border)',
        borderRadius: 4,
        backgroundColor: 'var(--node-surface)',
        minHeight: 60,
        cursor: locked ? 'default' : 'pointer',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => !locked && !cell.image && onGenerateClick?.(nodeId, cell.id)}
      title={cell.image ? cell.label : '点击生成'}
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
            opacity: hovered ? 0.8 : 0.4,
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

      {/* Hover generate overlay for cells with images */}
      {cell.image && hovered && !locked && (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ backgroundColor: '#00000040' }}
          onClick={(e) => {
            e.stopPropagation();
            onGenerateClick?.(nodeId, cell.id);
          }}
        >
          <span
            style={{
              color: '#fff',
              fontSize: 10,
              backgroundColor: '#00000060',
              padding: '2px 6px',
              borderRadius: 4,
            }}
          >
            重新生成
          </span>
        </div>
      )}
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
  onGenerateCellClick,
  onBatchGenerateClick,
}: GalleryNodeProps) {
  const { preset, rows, cols, cells, characterName } = node.data;

  const presetLabel = preset === 'custom' ? '自定义' : preset;

  const pendingCount = cells.filter(
    (c) => c.generationStatus === 'generating' || c.generationStatus === 'pending',
  ).length;
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
        {/* ── Header ── */}
        <div
          className="flex items-center gap-2 px-2 py-1.5 flex-shrink-0"
          style={{
            borderBottom: '1px solid var(--node-divider)',
            backgroundColor: 'var(--node-header-bg)',
          }}
        >
          <span className="font-medium flex-1 truncate" style={{ color: 'var(--node-fg)' }}>
            {characterName ?? '角色画廊'}
          </span>
          <span style={{ color: 'var(--node-fg-secondary)', fontSize: 9 }}>
            {presetLabel} {rows}×{cols}
          </span>
          {/* Progress */}
          <span style={{ color: 'var(--node-fg-secondary)', fontSize: 9 }}>
            {doneCount}/{cells.length}
          </span>
          {/* Batch generate button */}
          {!node.locked && (
            <button
              className="flex-shrink-0"
              onClick={(e) => {
                e.stopPropagation();
                onBatchGenerateClick?.(node.id);
              }}
              disabled={pendingCount > 0}
              title="批量生成所有格子"
              style={{
                fontSize: 9,
                padding: '1px 5px',
                borderRadius: 3,
                border: '1px solid var(--node-border)',
                backgroundColor: pendingCount > 0 ? 'var(--node-header-bg)' : '#3b82f620',
                color: pendingCount > 0 ? 'var(--node-fg-secondary)' : '#3b82f6',
                cursor: pendingCount > 0 ? 'not-allowed' : 'pointer',
              }}
            >
              {pendingCount > 0 ? `生成中 ${pendingCount}` : '批量 ▶'}
            </button>
          )}
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
            <GalleryCellView
              key={cell.id}
              cell={cell}
              nodeId={node.id}
              locked={node.locked}
              onGenerateClick={onGenerateCellClick}
            />
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

        {/* ── Footer ── */}
        <div
          className="px-2 py-1 flex items-center justify-between flex-shrink-0"
          style={{
            borderTop: '1px solid var(--node-divider)',
            backgroundColor: 'var(--node-header-bg)',
          }}
        >
          <span style={{ color: 'var(--node-fg-secondary)' }}>GALLERY</span>
          <span style={{ color: 'var(--node-fg-secondary)' }}>🖼</span>
        </div>
      </div>
    </BaseNode>
  );
}
