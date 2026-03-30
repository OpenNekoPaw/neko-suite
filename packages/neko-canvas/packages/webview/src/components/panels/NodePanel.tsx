/**
 * NodePanel - Compact floating property editor for the selected canvas node.
 *
 * Positioned bottom-right of the canvas viewport. Pure editing, no AI generation
 * triggers — generation is handled via right-click context menu / Cmd+G.
 */

import { useState } from 'react';
import type {
  CanvasNode,
  ShotCanvasNode,
  SceneGroupCanvasNode,
  GalleryCanvasNode,
} from '@neko/shared';

// =============================================================================
// Types
// =============================================================================

export interface NodePanelProps {
  node: CanvasNode | null;
  onUpdateNodeData: (id: string, data: Record<string, unknown>) => void;
  onDeleteNode: (id: string) => void;
  onClose: () => void;
}

// =============================================================================
// Constants
// =============================================================================

const SHOT_SCALES = [
  { value: 'ECU', label: 'ECU' },
  { value: 'CU', label: 'CU' },
  { value: 'MCU', label: 'MCU' },
  { value: 'MS', label: 'MS' },
  { value: 'MLS', label: 'MLS' },
  { value: 'LS', label: 'LS' },
  { value: 'VLS', label: 'VLS' },
  { value: 'ELS', label: 'ELS' },
];
const CAMERA_MOVEMENTS = [
  { value: '', label: '无' },
  { value: 'static', label: '静止' },
  { value: 'pan', label: 'Pan' },
  { value: 'tilt', label: 'Tilt' },
  { value: 'zoom-in', label: '推镜' },
  { value: 'zoom-out', label: '拉镜' },
  { value: 'dolly', label: 'Dolly' },
  { value: 'handheld', label: '手持' },
];
const CAMERA_ANGLES = [
  { value: '', label: '无' },
  { value: 'eye-level', label: '平视' },
  { value: 'high-angle', label: '俯拍' },
  { value: 'low-angle', label: '仰拍' },
  { value: 'bird-eye', label: '鸟瞰' },
  { value: 'dutch', label: '斜角' },
];
const TIME_OF_DAY = [
  { value: '', label: '不限' },
  { value: 'dawn', label: '黎明' },
  { value: 'morning', label: '上午' },
  { value: 'noon', label: '正午' },
  { value: 'afternoon', label: '下午' },
  { value: 'dusk', label: '黄昏' },
  { value: 'night', label: '夜晚' },
];
const GALLERY_PRESETS = [
  { value: 'character-3view', label: '三视图' },
  { value: 'character-4view', label: '四视图' },
  { value: 'expression-9', label: '表情包 (9格)' },
  { value: 'turnaround-8', label: '转身 (8帧)' },
  { value: 'scene-views', label: '场景三视' },
  { value: 'custom', label: '自定义' },
];

// =============================================================================
// Shared micro-components
// =============================================================================

function InlineSelect({
  value,
  options,
  onChange,
  width = 72,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  width?: number;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        fontSize: 11,
        padding: '2px 4px',
        borderRadius: 4,
        width,
        border: '1px solid var(--neko-border)',
        backgroundColor: 'var(--neko-surface)',
        color: 'var(--neko-fg)',
        flexShrink: 0,
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function InlineInput({
  value,
  onChange,
  placeholder,
  width = 120,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  width?: number;
}) {
  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      style={{
        fontSize: 11,
        padding: '2px 6px',
        borderRadius: 4,
        width,
        border: '1px solid var(--neko-border)',
        backgroundColor: 'var(--neko-surface)',
        color: 'var(--neko-fg)',
        outline: 'none',
        flexShrink: 0,
      }}
    />
  );
}

function IconBtn({
  children,
  onClick,
  title,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title?: string;
  danger?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: '2px 5px',
        borderRadius: 4,
        fontSize: 14,
        lineHeight: 1,
        color: danger ? '#ef4444' : 'var(--neko-fg-secondary)',
        flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = danger
          ? 'rgba(239,68,68,0.12)'
          : 'var(--neko-hover)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'transparent';
      }}
    >
      {children}
    </button>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontSize: 10, color: 'var(--neko-fg-secondary)', userSelect: 'none' }}>
      {children}
    </span>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function NodePanel({ node, onUpdateNodeData, onDeleteNode, onClose }: NodePanelProps) {
  if (!node) return null;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 16,
        right: 16,
        width: 320,
        maxHeight: 440,
        zIndex: 25,
        backgroundColor: 'var(--neko-surface)',
        border: '1px solid var(--neko-border)',
        borderRadius: 8,
        boxShadow: '0 4px 20px rgba(0,0,0,0.22)',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
        pointerEvents: 'auto',
      }}
      // Prevent canvas drag/click from bubbling through the panel
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <PanelContent
        node={node}
        onUpdateNodeData={onUpdateNodeData}
        onDeleteNode={onDeleteNode}
        onClose={onClose}
      />
    </div>
  );
}

// =============================================================================
// Routing
// =============================================================================

type SharedProps = {
  onUpdateNodeData: (id: string, data: Record<string, unknown>) => void;
  onDeleteNode: (id: string) => void;
  onClose: () => void;
};

function PanelContent({ node, ...rest }: { node: CanvasNode } & SharedProps) {
  switch (node.type) {
    case 'shot':
      return <ShotPanel node={node as ShotCanvasNode} {...rest} />;
    case 'scene':
      return <ScenePanel node={node as SceneGroupCanvasNode} {...rest} />;
    case 'gallery':
      return <GalleryPanel node={node as GalleryCanvasNode} {...rest} />;
    case 'annotation':
    case 'text':
      return <AnnotationPanel node={node} {...rest} />;
    default:
      return <DefaultPanel node={node} {...rest} />;
  }
}

// =============================================================================
// ShotPanel
// =============================================================================

function ShotPanel({
  node,
  onUpdateNodeData,
  onDeleteNode,
  onClose,
}: { node: ShotCanvasNode } & SharedProps) {
  const d = node.data;
  const [dialogueOpen, setDialogueOpen] = useState(false);
  const update = (patch: Record<string, unknown>) => onUpdateNodeData(node.id, patch);

  return (
    <div>
      {/* Header */}
      <div
        className="flex items-center gap-1.5 px-3 flex-wrap"
        style={{ minHeight: 40, borderBottom: '1px solid var(--neko-border)' }}
      >
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--neko-fg)', flexShrink: 0 }}>
          #{String(d.shotNumber).padStart(3, '0')}
        </span>

        <InlineSelect
          value={d.shotScale ?? 'MS'}
          options={SHOT_SCALES}
          onChange={(v) => update({ shotScale: v })}
          width={58}
        />
        <InlineSelect
          value={d.cameraMovement ?? ''}
          options={CAMERA_MOVEMENTS}
          onChange={(v) => update({ cameraMovement: v || undefined })}
          width={64}
        />
        <InlineSelect
          value={d.cameraAngle ?? ''}
          options={CAMERA_ANGLES}
          onChange={(v) => update({ cameraAngle: v || undefined })}
          width={58}
        />

        <div className="flex items-center gap-1" style={{ flexShrink: 0 }}>
          <Label>时长</Label>
          <input
            type="number"
            min={0.5}
            step={0.5}
            value={d.duration ?? 3}
            onChange={(e) => {
              const v = parseFloat(e.target.value);
              if (!isNaN(v) && v > 0) update({ duration: v });
            }}
            style={{
              width: 40,
              fontSize: 11,
              padding: '2px 4px',
              borderRadius: 4,
              border: '1px solid var(--neko-border)',
              backgroundColor: 'var(--neko-surface)',
              color: 'var(--neko-fg)',
              outline: 'none',
            }}
          />
          <Label>s</Label>
        </div>

        <div className="flex-1" />
        <IconBtn onClick={() => onDeleteNode(node.id)} title="删除" danger>
          🗑
        </IconBtn>
        <IconBtn onClick={onClose} title="关闭">
          ×
        </IconBtn>
      </div>

      {/* Visual description */}
      <div className="px-3 pt-2 pb-1">
        <textarea
          placeholder="画面描述…"
          rows={3}
          value={d.visualDescription ?? ''}
          onChange={(e) => update({ visualDescription: e.target.value })}
          style={{
            width: '100%',
            fontSize: 12,
            padding: '6px 8px',
            borderRadius: 5,
            resize: 'none',
            border: '1px solid var(--neko-border)',
            backgroundColor: 'var(--neko-surface)',
            color: 'var(--neko-fg)',
            outline: 'none',
            boxSizing: 'border-box',
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = '#3b82f6';
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'var(--neko-border)';
          }}
        />
      </div>

      {/* Dialogue & sound (collapsible) */}
      <div className="px-3 pb-2">
        <button
          onClick={() => setDialogueOpen((v) => !v)}
          style={{
            fontSize: 11,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 0,
            color: 'var(--neko-fg-secondary)',
          }}
        >
          {dialogueOpen ? '▾' : '▸'} 台词与音效
        </button>
        {dialogueOpen && (
          <div className="mt-2 space-y-1.5">
            <div className="flex gap-2">
              <div className="flex-1">
                <Label>台词</Label>
                <textarea
                  rows={2}
                  placeholder="台词…"
                  value={d.dialogue ?? ''}
                  onChange={(e) => update({ dialogue: e.target.value || undefined })}
                  style={{
                    width: '100%',
                    fontSize: 11,
                    padding: '4px 6px',
                    borderRadius: 4,
                    resize: 'none',
                    border: '1px solid var(--neko-border)',
                    backgroundColor: 'var(--neko-surface)',
                    color: 'var(--neko-fg)',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
              <div className="flex-1">
                <Label>旁白</Label>
                <textarea
                  rows={2}
                  placeholder="旁白…"
                  value={d.voiceOver ?? ''}
                  onChange={(e) => update({ voiceOver: e.target.value || undefined })}
                  style={{
                    width: '100%',
                    fontSize: 11,
                    padding: '4px 6px',
                    borderRadius: 4,
                    resize: 'none',
                    border: '1px solid var(--neko-border)',
                    backgroundColor: 'var(--neko-surface)',
                    color: 'var(--neko-fg)',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                />
              </div>
            </div>
            <div>
              <Label>音效提示</Label>
              <input
                type="text"
                placeholder="例：脚步声、风声…"
                value={d.soundCue ?? ''}
                onChange={(e) => update({ soundCue: e.target.value || undefined })}
                style={{
                  width: '100%',
                  fontSize: 11,
                  padding: '4px 6px',
                  borderRadius: 4,
                  border: '1px solid var(--neko-border)',
                  backgroundColor: 'var(--neko-surface)',
                  color: 'var(--neko-fg)',
                  outline: 'none',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// ScenePanel
// =============================================================================

function ScenePanel({
  node,
  onUpdateNodeData,
  onDeleteNode,
  onClose,
}: { node: SceneGroupCanvasNode } & SharedProps) {
  const d = node.data;
  const update = (patch: Record<string, unknown>) => onUpdateNodeData(node.id, patch);

  return (
    <div className="flex items-center gap-2 px-3 flex-wrap" style={{ minHeight: 48 }}>
      <span style={{ fontSize: 11, color: 'var(--neko-fg-secondary)', flexShrink: 0 }}>
        🎞 场景
      </span>
      <InlineInput
        value={d.sceneTitle ?? ''}
        onChange={(v) => update({ sceneTitle: v })}
        placeholder="场景标题"
        width={150}
      />
      <InlineInput
        value={d.location ?? ''}
        onChange={(v) => update({ location: v || undefined })}
        placeholder="地点"
        width={80}
      />
      <InlineSelect
        value={d.timeOfDay ?? ''}
        options={TIME_OF_DAY}
        onChange={(v) => update({ timeOfDay: v || undefined })}
        width={64}
      />
      <Label>{d.shotIds.length} 个镜头</Label>
      <div className="flex-1" />
      <IconBtn onClick={() => onDeleteNode(node.id)} title="删除" danger>
        🗑
      </IconBtn>
      <IconBtn onClick={onClose} title="关闭">
        ×
      </IconBtn>
    </div>
  );
}

// =============================================================================
// GalleryPanel
// =============================================================================

function GalleryPanel({
  node,
  onUpdateNodeData,
  onDeleteNode,
  onClose,
}: { node: GalleryCanvasNode } & SharedProps) {
  const d = node.data;
  const update = (patch: Record<string, unknown>) => onUpdateNodeData(node.id, patch);

  return (
    <div className="flex items-center gap-2 px-3 flex-wrap" style={{ minHeight: 48 }}>
      <span style={{ fontSize: 11, color: 'var(--neko-fg-secondary)', flexShrink: 0 }}>
        🖼 角色画廊
      </span>
      <InlineInput
        value={d.characterName ?? ''}
        onChange={(v) => update({ characterName: v || undefined })}
        placeholder="角色名"
        width={90}
      />
      <InlineSelect
        value={d.preset ?? 'character-3view'}
        options={GALLERY_PRESETS}
        onChange={(v) => update({ preset: v })}
        width={96}
      />
      <div className="flex-1" />
      <IconBtn onClick={() => onDeleteNode(node.id)} title="删除" danger>
        🗑
      </IconBtn>
      <IconBtn onClick={onClose} title="关闭">
        ×
      </IconBtn>
    </div>
  );
}

// =============================================================================
// AnnotationPanel
// =============================================================================

function AnnotationPanel({
  node,
  onUpdateNodeData,
  onDeleteNode,
  onClose,
}: { node: CanvasNode } & SharedProps) {
  const d = node.data as Record<string, unknown>;
  const content = (d.content ?? d.text ?? '') as string;
  const field = 'content' in d ? 'content' : 'text';

  return (
    <div>
      <div
        className="flex items-center gap-2 px-3"
        style={{ minHeight: 40, borderBottom: '1px solid var(--neko-border)' }}
      >
        <span style={{ fontSize: 11, color: 'var(--neko-fg-secondary)' }}>📝 备注</span>
        <div className="flex-1" />
        <IconBtn onClick={() => onDeleteNode(node.id)} title="删除" danger>
          🗑
        </IconBtn>
        <IconBtn onClick={onClose} title="关闭">
          ×
        </IconBtn>
      </div>
      <div className="px-3 py-2">
        <textarea
          rows={3}
          value={content}
          onChange={(e) => onUpdateNodeData(node.id, { [field]: e.target.value })}
          placeholder="输入备注内容…"
          style={{
            width: '100%',
            fontSize: 12,
            padding: '6px 8px',
            borderRadius: 5,
            resize: 'none',
            border: '1px solid var(--neko-border)',
            backgroundColor: 'var(--neko-surface)',
            color: 'var(--neko-fg)',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
      </div>
    </div>
  );
}

// =============================================================================
// DefaultPanel — fallback for media / group / etc.
// =============================================================================

function DefaultPanel({
  node,
  onDeleteNode,
  onClose,
}: { node: CanvasNode } & Pick<SharedProps, 'onDeleteNode' | 'onClose'>) {
  const d = node.data as Record<string, unknown>;

  const TYPE_LABELS: Record<string, string> = {
    media: '媒体',
    group: '组',
    artboard: '画板',
    storyboard: '场景板',
    document: '文档',
    model: '模型',
    script: '剧本',
    'canvas-embed': '嵌入画布',
  };

  return (
    <div className="flex items-center gap-2 px-3 flex-wrap" style={{ minHeight: 44 }}>
      <span style={{ fontSize: 11, color: 'var(--neko-fg-secondary)', flexShrink: 0 }}>
        {TYPE_LABELS[node.type] ?? node.type}
      </span>

      {node.type === 'media' && (
        <>
          <span style={{ fontSize: 11, color: 'var(--neko-fg)' }}>
            {typeof d.assetPath === 'string' ? d.assetPath.split('/').pop() : ''}
          </span>
          {d.mediaType != null && (
            <span style={{ fontSize: 10, color: 'var(--neko-fg-secondary)' }}>
              · {d.mediaType as string}
            </span>
          )}
          {d.duration != null && (
            <span style={{ fontSize: 10, color: 'var(--neko-fg-secondary)' }}>
              · {formatDuration(d.duration as number)}
            </span>
          )}
        </>
      )}

      <div className="flex-1" />
      <IconBtn onClick={() => onDeleteNode(node.id)} title="删除" danger>
        🗑
      </IconBtn>
      <IconBtn onClick={onClose} title="关闭">
        ×
      </IconBtn>
    </div>
  );
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
