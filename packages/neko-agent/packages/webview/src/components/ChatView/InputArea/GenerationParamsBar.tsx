/**
 * GenerationParamsBar — right side of the InputArea top bar.
 *
 * In agent mode:
 *   - Always shows [Category▼] [MediaModel▼] [ratio▼] [resolution▼] [duration▼?].
 *   - Media model selector is integrated so LLM model and generation model are visible together.
 *
 * In image/video/audio session modes:
 *   - Always visible, no category selector (implied by sessionMode).
 *   - Shows params for that category (model is shown in left area by InputArea).
 */

import { useState, useRef } from 'react';
import { CloseIcon, SettingsIcon } from '@neko/shared/icons';
import { ChevronDownIcon } from './DropdownMenu';
import { useClickOutsideSingle } from './useClickOutside';
import {
  dropdownPositionClass,
  useDropdownPlacement,
  type DropdownPlacement,
} from './useDropdownDirection';
import { useInputAreaContext } from '@/components/ChatView/InputAreaContext';
import { useTranslation } from '@/i18n/I18nContext';
import type { GenCategory, GenerationParams } from './types';
import { SESSION_MODE_COLORS } from './SessionModeSelector';
import type { ChatModelOption } from '@neko/shared';
import { getCategoryColor, ModelDot } from './ModelIcon';
import { projectGenerationParamsBarState } from '@/presenters/media-model-presenter';
import { MediaCategoryIcon } from './ComposerIcons';

// ─── small reusable param chip ─────────────────────────────────────────────

interface ParamDropdownProps {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  color?: string;
  ariaLabel: string;
}

function ParamDropdown({ value, options, onChange, color, ariaLabel }: ParamDropdownProps) {
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<DropdownPlacement>({
    direction: 'down',
    alignment: 'start',
  });
  const ref = useRef<HTMLDivElement>(null);
  useClickOutsideSingle(ref, () => setOpen(false));
  const getPlacement = useDropdownPlacement(ref, {
    preferredDirection: 'down',
    estimatedWidth: 176,
  });
  const selected = options.find((o) => o.value === value);

  const handleOpen = () => {
    if (!open) setPlacement(getPlacement());
    setOpen((v) => !v);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={handleOpen}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        className="agent-control-chip agent-control-chip-param"
        style={{ color: color ?? 'var(--vscode-descriptionForeground)' }}
      >
        <span className="agent-control-chip-text">{selected?.label ?? value}</span>
        <ChevronDownIcon className="w-2.5 h-2.5 opacity-60" />
      </button>

      {open && (
        <div
          className={`agent-dropdown-menu agent-dropdown-menu-compact absolute ${dropdownPositionClass(placement)}`}
          role="menu"
        >
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
              className={`agent-dropdown-item ${
                value === opt.value ? 'agent-dropdown-item-selected' : ''
              }`}
              role="menuitem"
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── category selector chip ─────────────────────────────────────────────────

type Translate = (key: string, params?: Record<string, string | number>) => string;

const CATEGORY_LABEL_KEYS: Record<GenCategory, string> = {
  image: 'chat.generation.category.image',
  video: 'chat.generation.category.video',
  audio: 'chat.generation.category.audio',
};

interface CategorySelectorProps {
  category: GenCategory;
  onChange: (cat: GenCategory) => void;
}

function CategorySelector({ category, onChange }: CategorySelectorProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<DropdownPlacement>({
    direction: 'down',
    alignment: 'start',
  });
  const ref = useRef<HTMLDivElement>(null);
  useClickOutsideSingle(ref, () => setOpen(false));
  const getPlacement = useDropdownPlacement(ref, {
    preferredDirection: 'down',
    estimatedWidth: 176,
  });
  const color = SESSION_MODE_COLORS[category];
  const categoryLabel = getCategoryLabel(t, category);

  const handleOpen = () => {
    if (!open) setPlacement(getPlacement());
    setOpen((v) => !v);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={handleOpen}
        aria-haspopup="menu"
        aria-expanded={open}
        className="agent-control-chip agent-control-chip-category"
        style={{ color }}
        title={categoryLabel}
      >
        <MediaCategoryIcon category={category} size={13} />
        <span className="agent-control-chip-text">{categoryLabel}</span>
        <ChevronDownIcon className="w-2.5 h-2.5 opacity-60" />
      </button>

      {open && (
        <div
          className={`agent-dropdown-menu agent-dropdown-menu-compact absolute ${dropdownPositionClass(placement)}`}
          role="menu"
        >
          {(['image', 'video', 'audio'] as GenCategory[]).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => {
                onChange(cat);
                setOpen(false);
              }}
              className={`agent-dropdown-item ${
                cat === category ? 'agent-dropdown-item-selected' : ''
              }`}
              role="menuitem"
            >
              <span style={{ color: SESSION_MODE_COLORS[cat] }}>
                <MediaCategoryIcon category={cat} size={13} />
              </span>
              <span className="agent-dropdown-item-label">{getCategoryLabel(t, cat)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── inline media model chip (for agent mode, integrated into params bar) ───

interface InlineMediaModelChipProps {
  category: GenCategory;
  selectedId: string;
  models: ChatModelOption[];
  onSelect: (modelId: string) => void;
}

function InlineMediaModelChip({
  category,
  selectedId,
  models,
  onSelect,
}: InlineMediaModelChipProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<DropdownPlacement>({
    direction: 'down',
    alignment: 'start',
  });
  const ref = useRef<HTMLDivElement>(null);
  useClickOutsideSingle(ref, () => setOpen(false));
  const getPlacement = useDropdownPlacement(ref, {
    preferredDirection: 'down',
    estimatedWidth: 360,
  });

  const color = getCategoryColor(category);
  const selected = models.find((m) => m.id === selectedId);
  const isConfigured = !!selected && selectedId !== 'none';
  const hasModels = models.length > 0;
  const categoryLabel = getCategoryLabel(t, category);

  const handleOpen = () => {
    if (!hasModels) return;
    if (!open) setPlacement(getPlacement());
    setOpen((v) => !v);
  };

  const shortenLabel = (label: string): string => {
    const short = label.includes('/') ? (label.split('/').pop()?.trim() ?? label) : label;
    return short.length > 10 ? `${short.slice(0, 9)}…` : short;
  };

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={handleOpen}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`agent-control-chip agent-control-chip-model ${
          isConfigured ? '' : 'agent-control-chip-muted'
        }`}
        style={{
          color: isConfigured ? color : 'var(--vscode-descriptionForeground)',
        }}
        title={
          selected?.label ??
          (hasModels
            ? t('chat.generation.model.select', { category: categoryLabel })
            : t('chat.generation.model.unconfigured', { category: categoryLabel }))
        }
      >
        <ModelDot color={isConfigured ? color : 'var(--vscode-descriptionForeground)'} />
        <span className="agent-control-chip-text">
          {isConfigured ? shortenLabel(selected.label) : t('chat.generation.model.noneShort')}
        </span>
        {hasModels && <ChevronDownIcon className="w-2.5 h-2.5 opacity-60" />}
      </button>

      {open && hasModels && (
        <div
          className={`agent-dropdown-menu agent-dropdown-menu-model absolute ${dropdownPositionClass(placement)}`}
          role="menu"
        >
          <button
            type="button"
            onClick={() => {
              onSelect('none');
              setOpen(false);
            }}
            className={`agent-dropdown-item ${
              selectedId === 'none' ? 'agent-dropdown-item-selected' : 'agent-dropdown-item-muted'
            }`}
            role="menuitem"
          >
            {t('chat.generation.model.none')}
          </button>
          {models.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                onSelect(m.id);
                setOpen(false);
              }}
              className={`agent-dropdown-item ${
                m.id === selectedId ? 'agent-dropdown-item-selected' : ''
              }`}
              role="menuitem"
            >
              <ModelDot color={color} />
              <span className="agent-dropdown-item-label">{m.label}</span>
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
  { value: '3:2', label: '3:2' },
  { value: '21:9', label: '21:9' },
  { value: '2.39:1', label: '2.39:1' },
];

const IMAGE_RESOLUTION_OPTIONS = [
  { value: '512', label: '512' },
  { value: '720p', label: '720p' },
  { value: '1080p', label: '1080p' },
  { value: '2K', label: '2K' },
  { value: '4K', label: '4K' },
];

const VIDEO_RESOLUTION_OPTIONS = [
  { value: '720p', label: '720p' },
  { value: '1080p', label: '1080p' },
  { value: '2K', label: '2K' },
  { value: '4K', label: '4K' },
];

const VIDEO_DURATION_OPTIONS = [5, 6, 8, 10, 12, 15, 20].map((n) => ({
  value: String(n),
  label: `${n}s`,
}));

const AUDIO_DURATION_OPTIONS = [1, 2, 3, 5, 8, 10, 15, 30].map((n) => ({
  value: String(n),
  label: `${n}s`,
}));

const AUDIO_TYPE_OPTIONS = [
  { value: 'music', labelKey: 'chat.generation.audioType.music' },
  { value: 'sfx', labelKey: 'chat.generation.audioType.sfx' },
  { value: 'ambient', labelKey: 'chat.generation.audioType.ambient' },
  { value: 'voice', labelKey: 'chat.generation.audioType.voice' },
];

// ─── params panel for a given category ──────────────────────────────────────

interface ParamsPanelProps {
  category: GenCategory;
  params: GenerationParams;
  onChange: (p: Partial<GenerationParams>) => void;
  color?: string;
}

function ParamsPanel({ category, params, onChange, color }: ParamsPanelProps) {
  const { t } = useTranslation();

  if (category === 'image') {
    return (
      <>
        <ParamDropdown
          value={params.ratio}
          options={RATIO_OPTIONS}
          onChange={(v) => onChange({ ratio: v as GenerationParams['ratio'] })}
          color={color}
          ariaLabel={t('chat.generation.param.ratio')}
        />
        <ParamDropdown
          value={params.resolution}
          options={IMAGE_RESOLUTION_OPTIONS}
          onChange={(v) => onChange({ resolution: v as GenerationParams['resolution'] })}
          color={color}
          ariaLabel={t('chat.generation.param.resolution')}
        />
      </>
    );
  }

  if (category === 'video') {
    return (
      <>
        <ParamDropdown
          value={params.ratio}
          options={RATIO_OPTIONS}
          onChange={(v) => onChange({ ratio: v as GenerationParams['ratio'] })}
          color={color}
          ariaLabel={t('chat.generation.param.ratio')}
        />
        <ParamDropdown
          value={params.resolution}
          options={VIDEO_RESOLUTION_OPTIONS}
          onChange={(v) => onChange({ resolution: v as GenerationParams['resolution'] })}
          color={color}
          ariaLabel={t('chat.generation.param.resolution')}
        />
        <ParamDropdown
          value={String(params.videoDuration)}
          options={VIDEO_DURATION_OPTIONS}
          onChange={(v) => onChange({ videoDuration: Number(v) })}
          color={color}
          ariaLabel={t('chat.generation.param.videoDuration')}
        />
      </>
    );
  }

  // audio
  return (
    <>
      <ParamDropdown
        value={params.audioType}
        options={AUDIO_TYPE_OPTIONS.map((option) => ({
          value: option.value,
          label: t(option.labelKey),
        }))}
        onChange={(v) => onChange({ audioType: v as GenerationParams['audioType'] })}
        color={color}
        ariaLabel={t('chat.generation.param.audioType')}
      />
      <ParamDropdown
        value={String(params.audioDuration)}
        options={AUDIO_DURATION_OPTIONS}
        onChange={(v) => onChange({ audioDuration: Number(v) })}
        color={color}
        ariaLabel={t('chat.generation.param.audioDuration')}
      />
    </>
  );
}

// ─── main component ─────────────────────────────────────────────────────────

export function GenerationParamsBar() {
  const { t } = useTranslation();
  const {
    sessionMode,
    genCategory,
    genParams,
    onGenCategoryChange,
    onGenParamsChange,
    mediaModelSelection,
    availableMediaModels,
    onMediaModelSelect,
    ambientNodes = [],
    contextChips,
  } = useInputAreaContext();

  const [manuallyExpanded, setManuallyExpanded] = useState(false);

  const projection = projectGenerationParamsBarState({
    sessionMode,
    generationCategory: genCategory,
    mediaModelSelection,
    availableMediaModels,
    ambientNodeCount: ambientNodes.length,
    contextChips,
    manuallyExpanded,
  });
  const { category: effectiveCategory } = projection;

  const color = SESSION_MODE_COLORS[effectiveCategory];

  if (!projection.isExpanded) {
    return (
      <button
        type="button"
        onClick={() => setManuallyExpanded(true)}
        className="agent-control-chip agent-control-chip-icon"
        title={t('chat.generation.params.title')}
      >
        <SettingsIcon size={14} strokeWidth={1.8} />
      </button>
    );
  }

  return (
    <div className="agent-generation-params">
      {/* Category selector — only in agent mode */}
      {projection.showCategorySelector && (
        <CategorySelector category={genCategory} onChange={onGenCategoryChange} />
      )}

      {/* Inline media model selector — agent mode only (non-agent uses InputArea left side) */}
      {projection.showInlineMediaModelPicker && (
        <InlineMediaModelChip
          category={effectiveCategory}
          selectedId={projection.selectedId}
          models={projection.models}
          onSelect={(modelId) => onMediaModelSelect(effectiveCategory, modelId)}
        />
      )}

      {/* Per-category params */}
      <ParamsPanel
        category={effectiveCategory}
        params={genParams}
        onChange={onGenParamsChange}
        color={color}
      />

      {/* Manual collapse button — only when manually expanded (no auto-context) */}
      {projection.showManualCollapse && (
        <button
          type="button"
          onClick={() => setManuallyExpanded(false)}
          className="agent-control-chip agent-control-chip-icon agent-control-chip-collapse"
          title={t('chat.generation.params.collapse')}
        >
          <CloseIcon size={12} strokeWidth={2} />
        </button>
      )}
    </div>
  );
}

function getCategoryLabel(t: Translate, category: GenCategory): string {
  return t(CATEGORY_LABEL_KEYS[category]);
}
