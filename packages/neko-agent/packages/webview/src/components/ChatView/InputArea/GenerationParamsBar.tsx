/**
 * GenerationParamsBar — right side of the InputArea top bar.
 *
 * In agent mode:
 *   - Collapsed to [⚙] when no generation context (no ambient nodes / canvas chips).
 *   - Auto-expands when canvas nodes are selected or canvas/cut chips are attached.
 *   - Manual toggle via [⚙] button.
 *   - Shows: [Category▼] [ratio▼] [resolution▼] [duration▼?]
 *
 * In image/video/audio session modes:
 *   - Always visible, no category selector (implied by sessionMode).
 *   - Shows params for that category.
 */

import { useState, useRef } from 'react';
import { ChevronDownIcon } from './DropdownMenu';
import { useClickOutsideSingle } from './useClickOutside';
import { useInputAreaContext } from '@/components/ChatView/InputAreaContext';
import type { GenCategory, GenerationParams } from './types';
import { SESSION_MODE_COLORS } from './SessionModeSelector';

// ─── small reusable param chip ─────────────────────────────────────────────

interface ParamDropdownProps {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  color?: string;
}

function ParamDropdown({ value, options, onChange, color }: ParamDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutsideSingle(ref, () => setOpen(false));
  const selected = options.find((o) => o.value === value);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-0.5 px-1.5 py-1 rounded text-[11px] hover:bg-[var(--vscode-toolbar-hoverBackground)] transition-colors"
        style={{ color: color ?? 'var(--vscode-descriptionForeground)' }}
      >
        <span>{selected?.label ?? value}</span>
        <ChevronDownIcon className="w-2.5 h-2.5 opacity-60" />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-0.5 bg-[var(--vscode-dropdown-background)] border border-[var(--vscode-dropdown-border)] rounded-md shadow-lg min-w-[96px] py-1 z-50">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className={`w-full px-3 py-1 text-left text-[11px] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors ${
                value === opt.value ? 'text-[var(--vscode-textLink-foreground)]' : ''
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── category icon (reused from SessionModeSelector shape) ─────────────────

function CategoryIcon({ cat }: { cat: GenCategory }) {
  if (cat === 'image') {
    return (
      <svg viewBox="0 0 14 14" fill="currentColor" className="w-3 h-3">
        <path d="M1 2a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2zm1 0v6.5l2-2a.5.5 0 0 1 .65-.04l2 1.6 2-2a.5.5 0 0 1 .7 0L13 8V2H2z" />
        <circle cx="4.5" cy="4.5" r="1" />
      </svg>
    );
  }
  if (cat === 'video') {
    return (
      <svg viewBox="0 0 14 14" fill="currentColor" className="w-3 h-3">
        <path d="M0 3a1.5 1.5 0 0 1 1.5-1.5h8A1.5 1.5 0 0 1 11 3v1.8l2-1.3A.5.5 0 0 1 14 4v6a.5.5 0 0 1-.77.42L11 9.2V11a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 0 11V3z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 14 14" fill="currentColor" className="w-3 h-3">
      <path d="M5 1a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V1zM1 5a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V5zm9-2a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1V3z" />
    </svg>
  );
}

// ─── category selector chip ─────────────────────────────────────────────────

const CATEGORY_LABELS: Record<GenCategory, string> = {
  image: '图片',
  video: '视频',
  audio: '音频',
};

interface CategorySelectorProps {
  category: GenCategory;
  onChange: (cat: GenCategory) => void;
}

function CategorySelector({ category, onChange }: CategorySelectorProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useClickOutsideSingle(ref, () => setOpen(false));
  const color = SESSION_MODE_COLORS[category];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 px-1.5 py-1 rounded text-[11px] hover:bg-[var(--vscode-toolbar-hoverBackground)] transition-colors"
        style={{ color }}
      >
        <CategoryIcon cat={category} />
        <span>{CATEGORY_LABELS[category]}</span>
        <ChevronDownIcon className="w-2.5 h-2.5 opacity-60" />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-0.5 bg-[var(--vscode-dropdown-background)] border border-[var(--vscode-dropdown-border)] rounded-md shadow-lg w-[96px] py-1 z-50">
          {(['image', 'video', 'audio'] as GenCategory[]).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => {
                onChange(cat);
                setOpen(false);
              }}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-left text-[11px] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors`}
              style={{ color: cat === category ? SESSION_MODE_COLORS[cat] : undefined }}
            >
              <span style={{ color: SESSION_MODE_COLORS[cat] }}>
                <CategoryIcon cat={cat} />
              </span>
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── param option sets ───────────────────────────────────────────────────────

const RATIO_OPTIONS = [
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '1:1', label: '1:1' },
  { value: '4:3', label: '4:3' },
  { value: '2.39:1', label: '2.39:1' },
];

const IMAGE_RESOLUTION_OPTIONS = [
  { value: '512', label: '512' },
  { value: '720p', label: '720p' },
  { value: '1080p', label: '1080p' },
  { value: '2K', label: '2K' },
];

const VIDEO_RESOLUTION_OPTIONS = [
  { value: '480p', label: '480p' },
  { value: '720p', label: '720p' },
  { value: '1080p', label: '1080p' },
];

const VIDEO_DURATION_OPTIONS = [1, 2, 3, 4, 5, 6, 8].map((n) => ({
  value: String(n),
  label: `${n}s`,
}));

const AUDIO_DURATION_OPTIONS = [1, 2, 3, 5, 8, 10, 15, 30].map((n) => ({
  value: String(n),
  label: `${n}s`,
}));

const AUDIO_TYPE_OPTIONS = [
  { value: 'music', label: '音乐' },
  { value: 'sfx', label: '音效' },
  { value: 'ambient', label: '环境音' },
  { value: 'voice', label: '人声' },
];

// ─── params panel for a given category ──────────────────────────────────────

interface ParamsPanelProps {
  category: GenCategory;
  params: GenerationParams;
  onChange: (p: Partial<GenerationParams>) => void;
  color?: string;
}

function ParamsPanel({ category, params, onChange, color }: ParamsPanelProps) {
  if (category === 'image') {
    return (
      <>
        <ParamDropdown
          value={params.ratio}
          options={RATIO_OPTIONS}
          onChange={(v) => onChange({ ratio: v as GenerationParams['ratio'] })}
          color={color}
        />
        <ParamDropdown
          value={params.resolution}
          options={IMAGE_RESOLUTION_OPTIONS}
          onChange={(v) => onChange({ resolution: v as GenerationParams['resolution'] })}
          color={color}
        />
      </>
    );
  }

  if (category === 'video') {
    return (
      <>
        <ParamDropdown
          value={params.ratio}
          options={RATIO_OPTIONS.filter((r) => r.value !== '4:3' && r.value !== '2.39:1')}
          onChange={(v) => onChange({ ratio: v as GenerationParams['ratio'] })}
          color={color}
        />
        <ParamDropdown
          value={params.resolution}
          options={VIDEO_RESOLUTION_OPTIONS}
          onChange={(v) => onChange({ resolution: v as GenerationParams['resolution'] })}
          color={color}
        />
        <ParamDropdown
          value={String(params.videoDuration)}
          options={VIDEO_DURATION_OPTIONS}
          onChange={(v) => onChange({ videoDuration: Number(v) })}
          color={color}
        />
      </>
    );
  }

  // audio
  return (
    <>
      <ParamDropdown
        value={params.audioType}
        options={AUDIO_TYPE_OPTIONS}
        onChange={(v) => onChange({ audioType: v as GenerationParams['audioType'] })}
        color={color}
      />
      <ParamDropdown
        value={String(params.audioDuration)}
        options={AUDIO_DURATION_OPTIONS}
        onChange={(v) => onChange({ audioDuration: Number(v) })}
        color={color}
      />
    </>
  );
}

// ─── main component ─────────────────────────────────────────────────────────

export function GenerationParamsBar() {
  const {
    sessionMode,
    genCategory,
    genParams,
    onGenCategoryChange,
    onGenParamsChange,
    ambientNodes = [],
    contextChips,
  } = useInputAreaContext();

  // Auto-expand when canvas/cut context is present
  const hasGenContext =
    ambientNodes.length > 0 ||
    contextChips.some((c) => c.type === 'canvas-node' || c.type === 'cut-clip');

  const [manuallyExpanded, setManuallyExpanded] = useState(false);

  // In non-agent modes, always show (category implied by sessionMode)
  const isAgentMode = sessionMode === 'agent';
  const effectiveCategory: GenCategory = isAgentMode ? genCategory : (sessionMode as GenCategory);

  const isExpanded = !isAgentMode || hasGenContext || manuallyExpanded;
  const color = SESSION_MODE_COLORS[effectiveCategory];

  if (!isExpanded) {
    return (
      <button
        type="button"
        onClick={() => setManuallyExpanded(true)}
        className="flex items-center justify-center w-7 h-7 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] transition-colors text-[var(--vscode-descriptionForeground)] opacity-50 hover:opacity-80"
        title="生成参数"
      >
        <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
          <path d="M9.405 1.05c-.413-1.4-2.397-1.4-2.81 0l-.1.34a1.464 1.464 0 0 1-2.105.872l-.31-.17c-1.283-.698-2.686.705-1.987 1.987l.169.311c.446.82.023 1.841-.872 2.105l-.34.1c-1.4.413-1.4 2.397 0 2.81l.34.1a1.464 1.464 0 0 1 .872 2.105l-.17.31c-.698 1.283.705 2.686 1.987 1.987l.311-.169a1.464 1.464 0 0 1 2.105.872l.1.34c.413 1.4 2.397 1.4 2.81 0l.1-.34a1.464 1.464 0 0 1 2.105-.872l.31.17c1.283.698 2.686-.705 1.987-1.987l-.169-.311a1.464 1.464 0 0 1 .872-2.105l.34-.1c1.4-.413 1.4-2.397 0-2.81l-.34-.1a1.464 1.464 0 0 1-.872-2.105l.17-.31c.698-1.283-.705-2.686-1.987-1.987l-.311.169a1.464 1.464 0 0 1-2.105-.872l-.1-.34zM8 10.93a2.929 2.929 0 1 1 0-5.86 2.929 2.929 0 0 1 0 5.858z" />
        </svg>
      </button>
    );
  }

  return (
    <div className="flex items-center gap-0.5">
      {/* Category selector — only in agent mode */}
      {isAgentMode && <CategorySelector category={genCategory} onChange={onGenCategoryChange} />}

      {/* Per-category params */}
      <ParamsPanel
        category={effectiveCategory}
        params={genParams}
        onChange={onGenParamsChange}
        color={color}
      />

      {/* Manual collapse button — only when manually expanded (no auto-context) */}
      {isAgentMode && manuallyExpanded && !hasGenContext && (
        <button
          type="button"
          onClick={() => setManuallyExpanded(false)}
          className="flex items-center justify-center w-5 h-5 rounded hover:bg-[var(--vscode-toolbar-hoverBackground)] transition-colors text-[var(--vscode-descriptionForeground)] opacity-40 hover:opacity-70"
          title="收起"
        >
          ×
        </button>
      )}
    </div>
  );
}
