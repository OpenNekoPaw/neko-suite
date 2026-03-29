/**
 * BottomSheet - Canvas-integrated contextual node editor
 *
 * Slides up from the bottom of the canvas when a node is selected.
 * Content adapts per node type. Replaces both PropertyPanel and
 * GenerationPromptPanel to keep everything spatially close to the node.
 *
 * Creator nodes (shot/scene/gallery): rich editing + AI generation inline.
 * Utility nodes (annotation/media): compact single-section.
 */

import { useState, useEffect, useRef } from 'react';
import type {
  CanvasNode,
  ShotCanvasNode,
  SceneGroupCanvasNode,
  GalleryCanvasNode,
} from '@neko/shared';
import type { GenerationParams } from './GenerationPromptPanel';

// =============================================================================
// Types
// =============================================================================

export interface BottomSheetGenerateTarget {
  nodeId: string;
  cellId?: string;
}

export interface BottomSheetProps {
  selectedNode: CanvasNode | null;
  onUpdateNodeData: (id: string, data: Record<string, unknown>) => void;
  onDeleteNode: (id: string) => void;
  /** Clears canvas selection (closes the sheet) */
  onClose: () => void;
  /** Fires when user confirms generation */
  onGenerate: (nodeId: string, cellId: string | undefined, params: GenerationParams) => void;
  /** Returns an auto-generated prompt string */
  onRequestAutoPrompt?: (nodeId: string, cellId?: string) => Promise<string>;
  /** Enqueues batch generation for all empty gallery cells */
  onBatchGenerate?: (nodeId: string) => void;
  /**
   * When set, auto-expands the generation section for this target.
   * Caller must reset to null after handling via onInitialGenerationHandled.
   */
  initialGenerationTarget?: BottomSheetGenerateTarget | null;
  onInitialGenerationHandled?: () => void;
}

// =============================================================================
// Constants (mirrored from GenerationPromptPanel to avoid circular dep)
// =============================================================================

const STYLES = ['Anime', 'Realistic', 'Illustration', 'Oil Painting', 'Sketch', 'Watercolor'];
const RATIOS = ['16:9', '9:16', '1:1', '4:3', '3:4'] as const;

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

function SheetLabel({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontSize: 10, color: 'var(--neko-fg-secondary)', userSelect: 'none' }}>
      {children}
    </span>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function BottomSheet({
  selectedNode,
  onUpdateNodeData,
  onDeleteNode,
  onClose,
  onGenerate,
  onRequestAutoPrompt,
  onBatchGenerate,
  initialGenerationTarget,
  onInitialGenerationHandled,
}: BottomSheetProps) {
  const visible = selectedNode !== null;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 30,
        transform: visible ? 'translateY(0)' : 'translateY(105%)',
        transition: 'transform 0.18s cubic-bezier(0.4,0,0.2,1)',
        pointerEvents: visible ? 'auto' : 'none',
        backgroundColor: 'var(--neko-surface)',
        borderTop: '1px solid var(--neko-border)',
        boxShadow: '0 -4px 24px rgba(0,0,0,0.18)',
        maxHeight: '55%',
        display: 'flex',
        flexDirection: 'column',
        overflowY: 'auto',
      }}
    >
      {selectedNode && (
        <NodeSheet
          node={selectedNode}
          onUpdateNodeData={onUpdateNodeData}
          onDeleteNode={onDeleteNode}
          onClose={onClose}
          onGenerate={onGenerate}
          onRequestAutoPrompt={onRequestAutoPrompt}
          onBatchGenerate={onBatchGenerate}
          initialGenerationTarget={initialGenerationTarget}
          onInitialGenerationHandled={onInitialGenerationHandled}
        />
      )}
    </div>
  );
}

// =============================================================================
// NodeSheet — routes to the correct sheet type
// =============================================================================

function NodeSheet(props: Omit<BottomSheetProps, 'selectedNode'> & { node: CanvasNode }) {
  const { node, ...rest } = props;
  switch (node.type) {
    case 'shot':
      return <ShotSheet node={node as ShotCanvasNode} {...rest} />;
    case 'scene':
      return <SceneSheet node={node as SceneGroupCanvasNode} {...rest} />;
    case 'gallery':
      return <GallerySheet node={node as GalleryCanvasNode} {...rest} />;
    case 'annotation':
    case 'text':
      return <AnnotationSheet node={node} {...rest} />;
    default:
      return <DefaultSheet node={node} {...rest} />;
  }
}

// =============================================================================
// ShotSheet
// =============================================================================

function ShotSheet({
  node,
  onUpdateNodeData,
  onDeleteNode,
  onClose,
  onGenerate,
  onRequestAutoPrompt,
  initialGenerationTarget,
  onInitialGenerationHandled,
}: {
  node: ShotCanvasNode;
} & Omit<BottomSheetProps, 'selectedNode' | 'onBatchGenerate'>) {
  const d = node.data;
  const [dialogueOpen, setDialogueOpen] = useState(false);
  const [genExpanded, setGenExpanded] = useState(false);

  // Generation state
  const [prompt, setPrompt] = useState(d.visualDescription ?? '');
  const [style, setStyle] = useState<string>('');
  const [ratio, setRatio] = useState<(typeof RATIOS)[number]>('16:9');
  const [isLoadingPrompt, setIsLoadingPrompt] = useState(false);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  // Auto-expand when triggered externally (e.g. clicking "生成" on the canvas node)
  useEffect(() => {
    if (
      initialGenerationTarget &&
      initialGenerationTarget.nodeId === node.id &&
      !initialGenerationTarget.cellId
    ) {
      setGenExpanded(true);
      onInitialGenerationHandled?.();
      setTimeout(() => promptRef.current?.focus(), 80);
    }
  }, [initialGenerationTarget, node.id, onInitialGenerationHandled]);

  // Keep prompt in sync when visual description changes externally
  useEffect(() => {
    if (!genExpanded) {
      setPrompt(d.visualDescription ?? '');
    }
  }, [d.visualDescription, genExpanded]);

  const update = (patch: Record<string, unknown>) => onUpdateNodeData(node.id, patch);

  async function handleAutoPrompt() {
    if (!onRequestAutoPrompt) return;
    setIsLoadingPrompt(true);
    try {
      const p = await onRequestAutoPrompt(node.id);
      setPrompt(p);
    } finally {
      setIsLoadingPrompt(false);
    }
  }

  function handleGenerate() {
    if (!prompt.trim()) return;
    onGenerate(node.id, undefined, { prompt: prompt.trim(), style: style || undefined, ratio });
    setGenExpanded(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleGenerate();
    if (e.key === 'Escape' && genExpanded) {
      e.stopPropagation();
      setGenExpanded(false);
    }
  }

  const paddedNum = String(d.shotNumber).padStart(3, '0');

  return (
    <div onKeyDown={handleKeyDown}>
      {/* ── Header row ────────────────────────────────────────── */}
      <div
        className="flex items-center gap-2 px-3 flex-wrap"
        style={{ minHeight: 44, borderBottom: '1px solid var(--neko-border)' }}
      >
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--neko-fg)', flexShrink: 0 }}>
          #{paddedNum}
        </span>

        <InlineSelect
          value={d.shotScale ?? 'MS'}
          options={SHOT_SCALES}
          onChange={(v) => update({ shotScale: v })}
          width={60}
        />
        <InlineSelect
          value={d.cameraMovement ?? ''}
          options={CAMERA_MOVEMENTS}
          onChange={(v) => update({ cameraMovement: v || undefined })}
          width={68}
        />
        <InlineSelect
          value={d.cameraAngle ?? ''}
          options={CAMERA_ANGLES}
          onChange={(v) => update({ cameraAngle: v || undefined })}
          width={60}
        />

        <div className="flex items-center gap-1" style={{ flexShrink: 0 }}>
          <SheetLabel>时长</SheetLabel>
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
              width: 44,
              fontSize: 11,
              padding: '2px 4px',
              borderRadius: 4,
              border: '1px solid var(--neko-border)',
              backgroundColor: 'var(--neko-surface)',
              color: 'var(--neko-fg)',
              outline: 'none',
            }}
          />
          <SheetLabel>s</SheetLabel>
        </div>

        <div className="flex-1" />

        <button
          onClick={() => {
            setGenExpanded((v) => !v);
            if (!genExpanded) setTimeout(() => promptRef.current?.focus(), 80);
          }}
          style={{
            fontSize: 11,
            padding: '3px 10px',
            borderRadius: 4,
            border: 'none',
            cursor: 'pointer',
            fontWeight: 500,
            backgroundColor: genExpanded ? '#3b82f6' : 'rgba(59,130,246,0.15)',
            color: genExpanded ? '#fff' : '#3b82f6',
            flexShrink: 0,
          }}
        >
          生成 ▶
        </button>
        <IconBtn onClick={() => onDeleteNode(node.id)} title="删除" danger>
          🗑
        </IconBtn>
        <IconBtn onClick={onClose} title="关闭">
          ×
        </IconBtn>
      </div>

      {/* ── Body: visual description ──────────────────────────── */}
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

      {/* ── Dialogue & sound (toggle) ─────────────────────────── */}
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
                <SheetLabel>台词</SheetLabel>
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
                <SheetLabel>旁白</SheetLabel>
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
              <SheetLabel>音效提示</SheetLabel>
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

      {/* ── Inline generation section ─────────────────────────── */}
      {genExpanded && (
        <div
          className="px-3 pt-2 pb-3 flex flex-col gap-2"
          style={{ borderTop: '1px solid var(--neko-border)', backgroundColor: 'var(--neko-bg)' }}
        >
          {/* Prompt row */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
              <SheetLabel>提示词</SheetLabel>
              {onRequestAutoPrompt && (
                <button
                  onClick={handleAutoPrompt}
                  disabled={isLoadingPrompt}
                  style={{
                    fontSize: 11,
                    background: 'none',
                    border: 'none',
                    cursor: isLoadingPrompt ? 'wait' : 'pointer',
                    color: '#3b82f6',
                    opacity: isLoadingPrompt ? 0.6 : 1,
                    padding: 0,
                  }}
                >
                  {isLoadingPrompt ? '生成中…' : '✨ 自动填写'}
                </button>
              )}
            </div>
            <textarea
              ref={promptRef}
              rows={2}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="描述画面内容，例如: A young woman standing in a modern office..."
              style={{
                width: '100%',
                fontSize: 11,
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

          {/* Style + Ratio row */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1">
              <SheetLabel>风格</SheetLabel>
              <select
                value={style}
                onChange={(e) => setStyle(e.target.value)}
                style={{
                  fontSize: 11,
                  padding: '2px 4px',
                  borderRadius: 4,
                  border: '1px solid var(--neko-border)',
                  backgroundColor: 'var(--neko-surface)',
                  color: 'var(--neko-fg)',
                }}
              >
                <option value="">默认</option>
                {STYLES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1">
              <SheetLabel>比例</SheetLabel>
              <div className="flex gap-1">
                {RATIOS.map((r) => (
                  <button
                    key={r}
                    onClick={() => setRatio(r)}
                    style={{
                      fontSize: 9,
                      padding: '1px 5px',
                      borderRadius: 3,
                      cursor: 'pointer',
                      border: `1px solid ${ratio === r ? '#3b82f6' : 'var(--neko-border)'}`,
                      backgroundColor: ratio === r ? '#3b82f620' : 'transparent',
                      color: ratio === r ? '#3b82f6' : 'var(--neko-fg-secondary)',
                    }}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1" />

            <div className="flex items-center gap-2">
              <span style={{ fontSize: 10, color: 'var(--neko-fg-secondary)' }}>Ctrl+Enter</span>
              <button
                onClick={handleGenerate}
                disabled={!prompt.trim()}
                style={{
                  fontSize: 12,
                  padding: '4px 14px',
                  borderRadius: 5,
                  border: 'none',
                  fontWeight: 500,
                  cursor: prompt.trim() ? 'pointer' : 'not-allowed',
                  backgroundColor: prompt.trim() ? '#3b82f6' : '#3b82f640',
                  color: '#fff',
                }}
              >
                生成 ▶
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// SceneSheet
// =============================================================================

function SceneSheet({
  node,
  onUpdateNodeData,
  onDeleteNode,
  onClose,
}: { node: SceneGroupCanvasNode } & Pick<
  BottomSheetProps,
  'onUpdateNodeData' | 'onDeleteNode' | 'onClose'
>) {
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
        width={160}
      />
      <InlineInput
        value={d.location ?? ''}
        onChange={(v) => update({ location: v || undefined })}
        placeholder="地点"
        width={90}
      />
      <InlineSelect
        value={d.timeOfDay ?? ''}
        options={TIME_OF_DAY}
        onChange={(v) => update({ timeOfDay: v || undefined })}
        width={68}
      />

      <div className="flex items-center gap-1" style={{ flexShrink: 0 }}>
        <SheetLabel>{d.shotIds.length} 个镜头</SheetLabel>
      </div>

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
// GallerySheet
// =============================================================================

function GallerySheet({
  node,
  onUpdateNodeData,
  onDeleteNode,
  onClose,
  onBatchGenerate,
}: { node: GalleryCanvasNode } & Pick<
  BottomSheetProps,
  'onUpdateNodeData' | 'onDeleteNode' | 'onClose' | 'onBatchGenerate'
>) {
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
        width={100}
      />
      <InlineSelect
        value={d.preset ?? 'character-3view'}
        options={GALLERY_PRESETS}
        onChange={(v) => update({ preset: v })}
        width={100}
      />

      <div className="flex-1" />

      {onBatchGenerate && (
        <button
          onClick={() => onBatchGenerate(node.id)}
          style={{
            fontSize: 11,
            padding: '3px 10px',
            borderRadius: 4,
            border: 'none',
            cursor: 'pointer',
            fontWeight: 500,
            backgroundColor: 'rgba(59,130,246,0.15)',
            color: '#3b82f6',
            flexShrink: 0,
          }}
        >
          批量生成 ▶
        </button>
      )}
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
// AnnotationSheet
// =============================================================================

function AnnotationSheet({
  node,
  onUpdateNodeData,
  onDeleteNode,
  onClose,
}: { node: CanvasNode } & Pick<BottomSheetProps, 'onUpdateNodeData' | 'onDeleteNode' | 'onClose'>) {
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
// DefaultSheet — fallback for media / group / etc.
// =============================================================================

function DefaultSheet({
  node,
  onDeleteNode,
  onClose,
}: { node: CanvasNode } & Pick<BottomSheetProps, 'onDeleteNode' | 'onClose'>) {
  const d = node.data as Record<string, unknown>;

  const label: Record<string, string> = {
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
        {label[node.type] ?? node.type}
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

// =============================================================================
// Helpers
// =============================================================================

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
