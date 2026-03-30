/**
 * ShotNode - A single storyboard panel with full production metadata.
 * Displays shot number, scale, camera movement, characters, emotion tags,
 * and an image area for AI-generated images.
 */

import { useState } from 'react';
import type {
  ShotCanvasNode,
  CanvasViewport,
  ShotScale,
  CameraMovement,
  CameraAngle,
} from '@neko/shared';
import { BaseNode } from './BaseNode';
import { EditableText } from '../common/EditableText';
import {
  InlineSelect,
  InlineInput,
  InlineTextarea,
  InlineLabel,
  SHOT_SCALES,
  CAMERA_MOVEMENTS,
  CAMERA_ANGLES,
} from '../common/InlineControls';

// =============================================================================
// Types
// =============================================================================

export interface ShotNodeProps {
  node: ShotCanvasNode;
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
  onUpdateData?: (nodeId: string, data: Partial<ShotCanvasNode['data']>) => void;
  /** Called when the user navigates between generation history candidates */
  onSelectCandidate?: (nodeId: string, candidateId: string) => void;
}

// =============================================================================
// Sub-components
// =============================================================================

const STATUS_COLORS: Record<string, string> = {
  idle: 'var(--node-fg-secondary)',
  pending: '#f59e0b',
  generating: '#3b82f6',
  done: '#22c55e',
  error: '#ef4444',
};

const STATUS_LABELS: Record<string, string> = {
  idle: '待生成',
  pending: '排队中',
  generating: '生成中',
  done: '已生成',
  error: '失败',
};

function StatusBadge({ status }: { status: string }) {
  const color = STATUS_COLORS[status] ?? STATUS_COLORS['idle']!;
  const label = STATUS_LABELS[status] ?? status;
  return (
    <span
      className="text-xs px-1.5 py-0.5 rounded-full flex-shrink-0"
      style={{
        color,
        border: `1px solid ${color}`,
        backgroundColor: `${color}18`,
      }}
    >
      {label}
    </span>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="text-xs px-1.5 py-0.5 rounded"
      style={{
        color: 'var(--node-fg-secondary)',
        backgroundColor: 'var(--node-header-bg)',
        border: '1px solid var(--node-border)',
      }}
    >
      {children}
    </span>
  );
}

// =============================================================================
// Component
// =============================================================================

export function ShotNode({
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
  onSelectCandidate,
}: ShotNodeProps) {
  const editable = isSelected && !node.locked;
  const [dialogueOpen, setDialogueOpen] = useState(false);

  const {
    shotNumber,
    shotScale,
    cameraMovement,
    generatedImage,
    generationStatus,
    generationHistory,
    characters,
    emotion,
    dialogue,
    visualDescription,
  } = node.data;

  const selectedCandidate = generationHistory.find((v) => v.selected);
  const displayImage = generatedImage ?? selectedCandidate?.dataUrl;
  const candidateIndex = generationHistory.findIndex((v) => v.selected);
  const candidateTotal = generationHistory.length;

  function handlePrevCandidate(e: React.MouseEvent) {
    e.stopPropagation();
    if (candidateIndex <= 0) return;
    const prev = generationHistory[candidateIndex - 1];
    if (prev) onSelectCandidate?.(node.id, prev.id);
  }

  function handleNextCandidate(e: React.MouseEvent) {
    e.stopPropagation();
    if (candidateIndex >= candidateTotal - 1) return;
    const next = generationHistory[candidateIndex + 1];
    if (next) onSelectCandidate?.(node.id, next.id);
  }

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
        {/* ── Header: shot number + scale + camera + status ── */}
        <div
          className="flex items-center gap-1.5 px-2 py-1.5 flex-shrink-0"
          style={{
            borderBottom: '1px solid var(--node-divider)',
            backgroundColor: 'var(--node-header-bg)',
          }}
        >
          <span className="font-mono font-semibold" style={{ color: 'var(--node-fg)' }}>
            #{String(shotNumber).padStart(3, '0')}
          </span>
          {editable ? (
            <>
              <InlineSelect
                value={shotScale ?? 'MS'}
                options={SHOT_SCALES}
                onChange={(v) => onUpdateData?.(node.id, { shotScale: v as ShotScale })}
                width={56}
              />
              <InlineSelect
                value={cameraMovement ?? ''}
                options={CAMERA_MOVEMENTS}
                onChange={(v) =>
                  onUpdateData?.(node.id, {
                    cameraMovement: (v || undefined) as CameraMovement | undefined,
                  })
                }
                width={64}
              />
              <InlineSelect
                value={node.data.cameraAngle ?? ''}
                options={CAMERA_ANGLES}
                onChange={(v) =>
                  onUpdateData?.(node.id, {
                    cameraAngle: (v || undefined) as CameraAngle | undefined,
                  })
                }
                width={56}
              />
              <div className="flex items-center gap-0.5" style={{ flexShrink: 0 }}>
                <InlineLabel>时长</InlineLabel>
                <InlineInput
                  type="number"
                  value={node.data.duration ?? 3}
                  min={0.5}
                  step={0.5}
                  onChange={(v) => {
                    const n = parseFloat(v);
                    if (!isNaN(n) && n > 0) onUpdateData?.(node.id, { duration: n });
                  }}
                  width={40}
                />
                <InlineLabel>s</InlineLabel>
              </div>
            </>
          ) : (
            <>
              {shotScale && <Tag>{shotScale}</Tag>}
              {cameraMovement && cameraMovement !== 'static' && <Tag>{cameraMovement}</Tag>}
            </>
          )}
          <div className="flex-1" />
          <StatusBadge status={generationStatus} />
        </div>

        {/* ── Image area ── */}
        <div
          className="relative flex-1 min-h-[80px] overflow-hidden flex items-center justify-center"
          style={{
            backgroundColor: 'var(--node-surface)',
            borderBottom: '1px solid var(--node-divider)',
          }}
        >
          {generationStatus === 'generating' ? (
            <div className="flex flex-col items-center gap-1" style={{ color: '#3b82f6' }}>
              {/* Simple CSS spinner */}
              <div
                className="w-6 h-6 rounded-full border-2 border-t-transparent animate-spin"
                style={{ borderColor: '#3b82f688', borderTopColor: 'transparent' }}
              />
              <span className="text-xs" style={{ color: 'var(--node-fg-secondary)' }}>
                生成中…
              </span>
            </div>
          ) : displayImage ? (
            <img
              src={displayImage}
              alt={`Shot ${shotNumber}`}
              className="w-full h-full object-cover"
              draggable={false}
            />
          ) : (
            <div
              className="flex flex-col items-center gap-1 opacity-30"
              style={{ color: 'var(--node-fg-secondary)' }}
            >
              <span className="text-2xl">⌘</span>
              <span style={{ fontSize: 9 }}>右键生图</span>
            </div>
          )}

          {/* Candidate navigator */}
          {candidateTotal > 1 && (
            <div
              className="absolute bottom-1 right-1 flex items-center gap-0.5"
              style={{ backgroundColor: '#00000080', borderRadius: 4, padding: '1px 4px' }}
            >
              <button
                className="text-white opacity-70 hover:opacity-100 disabled:opacity-30"
                onClick={handlePrevCandidate}
                disabled={candidateIndex <= 0}
                style={{
                  fontSize: 10,
                  lineHeight: 1,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                ◀
              </button>
              <span className="text-white" style={{ fontSize: 9 }}>
                {candidateIndex + 1}/{candidateTotal}
              </span>
              <button
                className="text-white opacity-70 hover:opacity-100 disabled:opacity-30"
                onClick={handleNextCandidate}
                disabled={candidateIndex >= candidateTotal - 1}
                style={{
                  fontSize: 10,
                  lineHeight: 1,
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                ▶
              </button>
            </div>
          )}

          {/* Error overlay */}
          {generationStatus === 'error' && (
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{ backgroundColor: '#ef444420' }}
            >
              <span style={{ color: '#ef4444', fontSize: 11 }}>生成失败，点击重试</span>
            </div>
          )}
        </div>

        {/* ── Meta: characters + emotion ── */}
        <div
          className="px-2 py-1.5 flex flex-col gap-1 flex-shrink-0"
          style={{ borderBottom: '1px solid var(--node-divider)' }}
        >
          {/* Description */}
          <EditableText
            value={visualDescription ?? ''}
            onChange={(val) => onUpdateData?.(node.id, { visualDescription: val })}
            multiline
            placeholder="画面描述"
            className="line-clamp-2"
            style={{ color: 'var(--node-fg-secondary)', fontSize: 11 }}
            disabled={node.locked}
          />

          {/* Characters */}
          {characters.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              <span style={{ color: 'var(--node-fg-secondary)' }}>角色:</span>
              {characters.slice(0, 3).map((c) => (
                <Tag key={c.characterName}>{c.characterName}</Tag>
              ))}
              {characters.length > 3 && (
                <span style={{ color: 'var(--node-fg-secondary)' }}>+{characters.length - 3}</span>
              )}
            </div>
          )}

          {/* Emotions */}
          {emotion.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              <span style={{ color: 'var(--node-fg-secondary)' }}>情绪:</span>
              {emotion.slice(0, 4).map((e) => (
                <Tag key={e}>{e}</Tag>
              ))}
            </div>
          )}

          {/* Dialogue preview */}
          {dialogue && (
            <div
              className="italic truncate"
              style={{ color: 'var(--node-fg-secondary)', fontSize: 10 }}
              title={dialogue}
            >
              "{dialogue}"
            </div>
          )}
        </div>

        {/* ── Dialogue & sound (inline, selected only) ── */}
        {editable && (
          <div
            className="px-2 pb-1.5 flex-shrink-0"
            style={{ borderBottom: '1px solid var(--node-divider)' }}
          >
            <button
              onClick={(e) => {
                e.stopPropagation();
                setDialogueOpen((v) => !v);
              }}
              onMouseDown={(e) => e.stopPropagation()}
              style={{
                fontSize: 10,
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
                color: 'var(--node-fg-secondary)',
              }}
            >
              {dialogueOpen ? '▾' : '▸'} 台词与音效
            </button>
            {dialogueOpen && (
              <div className="mt-1.5 space-y-1">
                <div className="flex gap-1.5">
                  <div className="flex-1">
                    <InlineLabel>台词</InlineLabel>
                    <InlineTextarea
                      value={dialogue ?? ''}
                      onChange={(v) => onUpdateData?.(node.id, { dialogue: v || undefined })}
                      placeholder="台词…"
                      rows={2}
                    />
                  </div>
                  <div className="flex-1">
                    <InlineLabel>旁白</InlineLabel>
                    <InlineTextarea
                      value={node.data.voiceOver ?? ''}
                      onChange={(v) => onUpdateData?.(node.id, { voiceOver: v || undefined })}
                      placeholder="旁白…"
                      rows={2}
                    />
                  </div>
                </div>
                <div>
                  <InlineLabel>音效提示</InlineLabel>
                  <InlineInput
                    value={node.data.soundCue ?? ''}
                    onChange={(v) => onUpdateData?.(node.id, { soundCue: v || undefined })}
                    placeholder="例：脚步声、风声…"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Footer ── */}
        <div
          className="px-2 py-1 flex items-center justify-between flex-shrink-0"
          style={{ backgroundColor: 'var(--node-header-bg)' }}
        >
          <span style={{ color: 'var(--node-fg-secondary)' }}>SHOT</span>
          <span style={{ color: 'var(--node-fg-secondary)' }}>🎬</span>
        </div>
      </div>
    </BaseNode>
  );
}
