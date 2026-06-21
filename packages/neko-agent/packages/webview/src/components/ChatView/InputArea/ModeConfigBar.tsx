import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  AgentCreativityPreset,
  AgentLlmConfig,
  AgentReasoningPreset,
  AgentVerbosityPreset,
  SessionMode,
} from '@neko-agent/types';
import type { ChatModelOption } from '@neko/shared';
import { ModelSelector } from './ModelSelector';
import { ChevronDownIcon } from './DropdownMenu';
import { MediaCategoryIcon, SessionModeIcon } from './ComposerIcons';
import { getCategoryColor } from './ModelIcon';
import { SessionModeSelector } from './SessionModeSelector';
import { useClickOutsideSingle } from './useClickOutside';
import {
  dropdownPositionClass,
  useDropdownPlacement,
  type DropdownPlacement,
} from './useDropdownDirection';
import { useTranslation } from '@/i18n/I18nContext';
import type { MediaCategory, MediaModelSelection } from '@/components/ChatView/InputAreaContext';
import type { ComposerModeConfigProjection } from '@/presenters/composer-mode-config-presenter';
import type { GenCategory, GenerationDuration, GenerationParams } from './types';

interface ModeConfigBarProps {
  readonly projection: ComposerModeConfigProjection;
  readonly availableSessionModes: readonly SessionMode[];
  readonly availableModels: readonly ChatModelOption[];
  readonly selectedModel: string;
  readonly onSessionModeChange: (mode: SessionMode) => void;
  readonly onModelSelect: (modelId: string) => void;
  readonly mediaModelSelection: Readonly<MediaModelSelection>;
  readonly availableMediaModels: readonly ChatModelOption[];
  readonly onMediaModelSelect: (category: MediaCategory, modelId: string) => void;
  readonly genCategory: GenCategory;
  readonly genParams: GenerationParams;
  readonly onGenCategoryChange: (category: GenCategory) => void;
  readonly onGenParamsChange: (params: Partial<GenerationParams>) => void;
  readonly llmConfig: AgentLlmConfig;
  readonly onLlmConfigChange: (config: AgentLlmConfig) => void;
  readonly showAgentConfig: boolean;
  readonly showMediaConfig: boolean;
}

const REASONING_OPTIONS: readonly AgentReasoningPreset[] = ['fast', 'balanced', 'deep'];
const VERBOSITY_OPTIONS: readonly AgentVerbosityPreset[] = ['brief', 'standard', 'detailed'];
const CREATIVITY_OPTIONS: readonly AgentCreativityPreset[] = ['stable', 'creative', 'wild'];
const MEDIA_CATEGORIES: readonly MediaCategory[] = ['image', 'video', 'audio'];
type AgentConfigCategory = 'llm' | MediaCategory;
type Translate = (key: string, params?: Record<string, string | number>) => string;

interface ParamOption {
  readonly value: string;
  readonly label: string;
  readonly hintKey?: string;
}

interface ResolvedParamOption {
  readonly value: string;
  readonly label: string;
  readonly hint?: string;
}

const RATIO_OPTIONS: readonly ParamOption[] = [
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '1:1', label: '1:1' },
  { value: '4:3', label: '4:3' },
  { value: '3:2', label: '3:2' },
  { value: '21:9', label: '21:9' },
  { value: '2.39:1', label: '2.39:1' },
];

const IMAGE_RESOLUTION_OPTIONS: readonly ParamOption[] = [
  { value: '512', label: '512' },
  { value: '720p', label: '720p' },
  { value: '1080p', label: '1080p' },
  { value: '2K', label: '2K' },
  { value: '4K', label: '4K' },
];

const VIDEO_RESOLUTION_OPTIONS: readonly ParamOption[] = [
  { value: '720p', label: '720p' },
  { value: '1080p', label: '1080p' },
  { value: '2K', label: '2K' },
  { value: '4K', label: '4K' },
];

const VIDEO_DURATION_OPTIONS: readonly ParamOption[] = [
  { value: 'auto', label: 'AUTO', hintKey: 'chat.generation.paramHint.duration.autoVideo' },
  { value: '5', label: '5s' },
  { value: '8', label: '8s' },
  { value: '12', label: '12s' },
];

const AUDIO_DURATION_OPTIONS: readonly ParamOption[] = [
  { value: 'auto', label: 'AUTO', hintKey: 'chat.generation.paramHint.duration.autoAudio' },
  { value: '3', label: '3s' },
  { value: '8', label: '8s' },
  { value: '15', label: '15s' },
];

const AUDIO_TYPE_OPTIONS = [
  {
    value: 'sfx',
    labelKey: 'chat.generation.audioType.sfx',
  },
  {
    value: 'ambient',
    labelKey: 'chat.generation.audioType.ambient',
  },
  {
    value: 'voice',
    labelKey: 'chat.generation.audioType.voice',
  },
];

export function ModeConfigBar({
  projection,
  availableSessionModes,
  availableModels,
  selectedModel,
  onSessionModeChange,
  onModelSelect,
  mediaModelSelection,
  availableMediaModels,
  onMediaModelSelect,
  genCategory,
  genParams,
  onGenCategoryChange,
  onGenParamsChange,
  llmConfig,
  onLlmConfigChange,
  showAgentConfig,
  showMediaConfig,
}: ModeConfigBarProps) {
  const { t } = useTranslation();
  const availableAgentCategories = useMemo(
    () => getAvailableAgentConfigCategories(availableModels, availableMediaModels),
    [availableMediaModels, availableModels],
  );
  const [agentConfigCategory, setAgentConfigCategory] = useState<AgentConfigCategory>(() =>
    getInitialAgentConfigCategory(availableAgentCategories, genCategory),
  );
  const isAgentMode = projection.mode === 'agent';
  const activeCategory: AgentConfigCategory = isAgentMode
    ? getActiveAgentConfigCategory(agentConfigCategory, availableAgentCategories, genCategory)
    : projection.mode;

  useEffect(() => {
    if (!isAgentMode) return;
    const nextCategory = getActiveAgentConfigCategory(
      agentConfigCategory,
      availableAgentCategories,
      genCategory,
    );
    if (nextCategory !== agentConfigCategory) {
      setAgentConfigCategory(nextCategory);
    }
    if (nextCategory !== 'llm' && nextCategory !== genCategory) {
      onGenCategoryChange(nextCategory);
    }
  }, [
    agentConfigCategory,
    availableAgentCategories,
    genCategory,
    isAgentMode,
    onGenCategoryChange,
  ]);

  const handleAgentConfigCategoryChange = (category: AgentConfigCategory) => {
    setAgentConfigCategory(category);
    if (category !== 'llm') {
      onGenCategoryChange(category);
    }
  };

  return (
    <div className="agent-composer-control-row">
      <div
        className="agent-composer-control-group agent-composer-control-group-mode"
        role="group"
        aria-label={t('chat.input.control.mode')}
      >
        <SessionModeSelector
          mode={projection.mode}
          onChange={onSessionModeChange}
          availableModes={availableSessionModes}
        />
      </div>

      <div
        className="agent-composer-control-group agent-composer-control-group-config"
        role="group"
        aria-label={t('chat.input.control.params')}
      >
        {isAgentMode && showAgentConfig ? (
          <AgentModeConfigBar
            category={activeCategory}
            categoryOptions={availableAgentCategories}
            onCategoryChange={handleAgentConfigCategoryChange}
            availableModels={availableModels}
            selectedModel={selectedModel}
            onModelSelect={onModelSelect}
            mediaModelSelection={mediaModelSelection}
            availableMediaModels={availableMediaModels}
            onMediaModelSelect={onMediaModelSelect}
            genParams={genParams}
            onGenParamsChange={onGenParamsChange}
            llmConfig={llmConfig}
            onLlmConfigChange={onLlmConfigChange}
          />
        ) : projection.mode !== 'agent' && showMediaConfig ? (
          <MediaModelParamsBar
            category={projection.mode}
            mediaModelSelection={mediaModelSelection}
            availableMediaModels={availableMediaModels}
            onMediaModelSelect={onMediaModelSelect}
            genParams={genParams}
            onGenParamsChange={onGenParamsChange}
          />
        ) : null}
      </div>
    </div>
  );
}

interface AgentLlmConfigBarProps {
  readonly availableModels: readonly ChatModelOption[];
  readonly selectedModel: string;
  readonly onModelSelect: (modelId: string) => void;
  readonly llmConfig: AgentLlmConfig;
  readonly onLlmConfigChange: (config: AgentLlmConfig) => void;
}

interface AgentModeConfigBarProps extends AgentLlmConfigBarProps {
  readonly category: AgentConfigCategory;
  readonly categoryOptions: readonly AgentConfigCategory[];
  readonly onCategoryChange: (category: AgentConfigCategory) => void;
  readonly mediaModelSelection: Readonly<MediaModelSelection>;
  readonly availableMediaModels: readonly ChatModelOption[];
  readonly onMediaModelSelect: (category: MediaCategory, modelId: string) => void;
  readonly genParams: GenerationParams;
  readonly onGenParamsChange: (params: Partial<GenerationParams>) => void;
}

function AgentModeConfigBar({
  category,
  categoryOptions,
  onCategoryChange,
  availableModels,
  selectedModel,
  onModelSelect,
  mediaModelSelection,
  availableMediaModels,
  onMediaModelSelect,
  genParams,
  onGenParamsChange,
  llmConfig,
  onLlmConfigChange,
}: AgentModeConfigBarProps) {
  return (
    <div className="agent-mode-config-stack">
      <AgentConfigCategorySelector
        category={category}
        options={categoryOptions}
        onChange={onCategoryChange}
      />
      {category === 'llm' ? (
        <AgentLlmConfigBar
          availableModels={availableModels}
          selectedModel={selectedModel}
          onModelSelect={onModelSelect}
          llmConfig={llmConfig}
          onLlmConfigChange={onLlmConfigChange}
        />
      ) : (
        <MediaModelParamsBar
          category={category}
          mediaModelSelection={mediaModelSelection}
          availableMediaModels={availableMediaModels}
          onMediaModelSelect={onMediaModelSelect}
          genParams={genParams}
          onGenParamsChange={onGenParamsChange}
        />
      )}
    </div>
  );
}

function AgentLlmConfigBar({
  availableModels,
  selectedModel,
  onModelSelect,
  llmConfig,
  onLlmConfigChange,
}: AgentLlmConfigBarProps) {
  const { t } = useTranslation();
  const color = getCategoryColor('llm');
  const controls = getSelectedLlmParameterControls(availableModels, selectedModel);
  const showBehaviorControls = controls.reasoning || controls.verbosity || controls.creativity;

  return (
    <div className="agent-inline-config-stack">
      <div
        className="agent-inline-config-group agent-inline-config-group-models"
        role="group"
        aria-label={t('chat.agentConfig.group.models')}
      >
        <ModelSelector
          selectedModel={selectedModel}
          models={[...availableModels]}
          onSelect={onModelSelect}
          color={color}
        />
      </div>

      {showBehaviorControls ? (
        <div
          className="agent-inline-config-group agent-inline-config-group-behavior"
          role="group"
          aria-label={t('chat.agentConfig.group.behavior')}
        >
          {controls.reasoning ? (
            <PresetDropdown
              titleKey="chat.agentConfig.section.reasoning"
              value={llmConfig.reasoningPreset ?? 'balanced'}
              options={REASONING_OPTIONS}
              labelPrefix="chat.agentConfig.reasoning"
              color={color}
              onChange={(reasoningPreset) => onLlmConfigChange({ ...llmConfig, reasoningPreset })}
            />
          ) : null}
          {controls.verbosity ? (
            <PresetDropdown
              titleKey="chat.agentConfig.section.verbosity"
              value={llmConfig.verbosityPreset ?? 'standard'}
              options={VERBOSITY_OPTIONS}
              labelPrefix="chat.agentConfig.verbosity"
              color={color}
              onChange={(verbosityPreset) => onLlmConfigChange({ ...llmConfig, verbosityPreset })}
            />
          ) : null}
          {controls.creativity ? (
            <PresetDropdown
              titleKey="chat.agentConfig.section.creativity"
              value={llmConfig.creativityPreset ?? 'creative'}
              options={CREATIVITY_OPTIONS}
              labelPrefix="chat.agentConfig.creativity"
              color={color}
              onChange={(creativityPreset) => onLlmConfigChange({ ...llmConfig, creativityPreset })}
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

interface AgentConfigCategorySelectorProps {
  readonly category: AgentConfigCategory;
  readonly options: readonly AgentConfigCategory[];
  readonly onChange: (category: AgentConfigCategory) => void;
}

function AgentConfigCategorySelector({
  category,
  options,
  onChange,
}: AgentConfigCategorySelectorProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [placement, setPlacement] = useState<DropdownPlacement>({
    direction: 'up',
    alignment: 'start',
  });
  const menuRef = useRef<HTMLDivElement>(null);
  const canSwitchCategory = options.length > 1;

  useClickOutsideSingle(menuRef, () => setIsOpen(false));
  const getPlacement = useDropdownPlacement(menuRef, {
    preferredDirection: 'up',
    estimatedWidth: 128,
  });

  const currentLabel = getConfigCategoryLabel(t, category);
  const color = getConfigCategoryColor(category);

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => {
          if (!canSwitchCategory) return;
          if (!isOpen) setPlacement(getPlacement());
          setIsOpen((value) => !value);
        }}
        aria-label={currentLabel}
        aria-haspopup={canSwitchCategory ? 'menu' : undefined}
        aria-expanded={isOpen}
        className={`agent-control-chip agent-control-chip-mode ${
          canSwitchCategory ? '' : 'agent-control-chip-static'
        }`}
        style={{ color }}
        title={currentLabel}
      >
        <ConfigCategoryIcon category={category} />
        <span className="agent-control-chip-text">{currentLabel}</span>
        {canSwitchCategory && <ChevronDownIcon className="w-2.5 h-2.5 opacity-60" />}
      </button>

      {isOpen && canSwitchCategory && (
        <div
          className={`agent-dropdown-menu agent-dropdown-menu-compact agent-dropdown-menu-preset absolute ${dropdownPositionClass(placement)}`}
          role="menu"
        >
          {options.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                onChange(option);
                setIsOpen(false);
              }}
              className={`agent-dropdown-item ${
                option === category ? 'agent-dropdown-item-selected' : ''
              }`}
              role="menuitem"
            >
              <span style={{ color: getConfigCategoryColor(option) }}>
                <ConfigCategoryIcon category={option} />
              </span>
              <span className="agent-dropdown-item-label">{getConfigCategoryLabel(t, option)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface MediaModelParamsBarProps {
  readonly category: MediaCategory;
  readonly mediaModelSelection: Readonly<MediaModelSelection>;
  readonly availableMediaModels: readonly ChatModelOption[];
  readonly onMediaModelSelect: (category: MediaCategory, modelId: string) => void;
  readonly genParams: GenerationParams;
  readonly onGenParamsChange: (params: Partial<GenerationParams>) => void;
}

function MediaModelParamsBar({
  category,
  mediaModelSelection,
  availableMediaModels,
  onMediaModelSelect,
  genParams,
  onGenParamsChange,
}: MediaModelParamsBarProps) {
  const models = availableMediaModels.filter((model) => model.category === category);
  const color = getCategoryColor(category);

  return (
    <div className="agent-generation-params">
      <InlineMediaModelChip
        category={category}
        selectedId={mediaModelSelection[category]}
        models={models}
        onSelect={(modelId) => onMediaModelSelect(category, modelId)}
      />
      <MediaParamsPanel
        category={category}
        params={genParams}
        onChange={onGenParamsChange}
        color={color}
      />
    </div>
  );
}

interface InlineMediaModelChipProps {
  readonly category: MediaCategory;
  readonly selectedId: string;
  readonly models: readonly ChatModelOption[];
  readonly onSelect: (modelId: string) => void;
}

function InlineMediaModelChip({
  category,
  selectedId,
  models,
  onSelect,
}: InlineMediaModelChipProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [placement, setPlacement] = useState<DropdownPlacement>({
    direction: 'down',
    alignment: 'start',
  });
  const menuRef = useRef<HTMLDivElement>(null);

  useClickOutsideSingle(menuRef, () => setIsOpen(false));
  const getPlacement = useDropdownPlacement(menuRef, {
    preferredDirection: 'down',
    estimatedWidth: 360,
  });

  const color = getCategoryColor(category);
  const selected = models.find((model) => model.id === selectedId);
  const hasModels = models.length > 0;
  const isConfigured = Boolean(selected) && selectedId !== 'none';
  const categoryLabel = getConfigCategoryLabel(t, category);

  const handleOpen = () => {
    if (!hasModels) return;
    if (!isOpen) setPlacement(getPlacement());
    setIsOpen((value) => !value);
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={handleOpen}
        aria-haspopup="menu"
        aria-expanded={isOpen}
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
        <span className="agent-control-chip-text">
          {isConfigured ? shortenModelLabel(selected!.label) : t('chat.generation.model.noneShort')}
        </span>
        {hasModels && <ChevronDownIcon className="w-2.5 h-2.5 opacity-60" />}
      </button>

      {isOpen && hasModels && (
        <div
          className={`agent-dropdown-menu agent-dropdown-menu-model absolute ${dropdownPositionClass(placement)}`}
          role="menu"
        >
          <button
            type="button"
            onClick={() => {
              onSelect('none');
              setIsOpen(false);
            }}
            className={`agent-dropdown-item ${
              selectedId === 'none' ? 'agent-dropdown-item-selected' : 'agent-dropdown-item-muted'
            }`}
            role="menuitem"
          >
            {t('chat.generation.model.none')}
          </button>
          {models.map((model) => (
            <button
              key={model.id}
              type="button"
              onClick={() => {
                onSelect(model.id);
                setIsOpen(false);
              }}
              className={`agent-dropdown-item ${
                model.id === selectedId ? 'agent-dropdown-item-selected' : ''
              }`}
              role="menuitem"
            >
              <span className="agent-dropdown-item-label">{model.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface MediaParamsPanelProps {
  readonly category: MediaCategory;
  readonly params: GenerationParams;
  readonly onChange: (params: Partial<GenerationParams>) => void;
  readonly color: string;
}

function MediaParamsPanel({ category, params, onChange, color }: MediaParamsPanelProps) {
  const { t } = useTranslation();

  if (category === 'image') {
    return (
      <>
        <ParamDropdown
          value={params.ratio}
          options={RATIO_OPTIONS}
          onChange={(value) => onChange({ ratio: value as GenerationParams['ratio'] })}
          color={color}
          ariaLabel={t('chat.generation.param.ratio')}
        />
        <ParamDropdown
          value={params.resolution}
          options={IMAGE_RESOLUTION_OPTIONS}
          onChange={(value) => onChange({ resolution: value as GenerationParams['resolution'] })}
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
          onChange={(value) => onChange({ ratio: value as GenerationParams['ratio'] })}
          color={color}
          ariaLabel={t('chat.generation.param.ratio')}
        />
        <ParamDropdown
          value={params.resolution}
          options={VIDEO_RESOLUTION_OPTIONS}
          onChange={(value) => onChange({ resolution: value as GenerationParams['resolution'] })}
          color={color}
          ariaLabel={t('chat.generation.param.resolution')}
        />
        <ParamDropdown
          value={String(params.videoDuration)}
          options={VIDEO_DURATION_OPTIONS}
          onChange={(value) => onChange({ videoDuration: parseGenerationDuration(value) })}
          color={color}
          ariaLabel={t('chat.generation.param.videoDuration')}
        />
      </>
    );
  }

  return (
    <>
      <ParamDropdown
        value={params.audioType}
        options={AUDIO_TYPE_OPTIONS.map((option) => ({
          value: option.value,
          label: t(option.labelKey),
        }))}
        onChange={(value) => onChange({ audioType: value as GenerationParams['audioType'] })}
        color={color}
        ariaLabel={t('chat.generation.param.audioType')}
      />
      <ParamDropdown
        value={String(params.audioDuration)}
        options={AUDIO_DURATION_OPTIONS}
        onChange={(value) => onChange({ audioDuration: parseGenerationDuration(value) })}
        color={color}
        ariaLabel={t('chat.generation.param.audioDuration')}
      />
    </>
  );
}

interface ParamDropdownProps {
  readonly value: string;
  readonly options: readonly ParamOption[] | readonly ResolvedParamOption[];
  readonly onChange: (value: string) => void;
  readonly color: string;
  readonly ariaLabel: string;
}

function ParamDropdown({ value, options, onChange, color, ariaLabel }: ParamDropdownProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [placement, setPlacement] = useState<DropdownPlacement>({
    direction: 'down',
    alignment: 'start',
  });
  const menuRef = useRef<HTMLDivElement>(null);

  useClickOutsideSingle(menuRef, () => setIsOpen(false));
  const getPlacement = useDropdownPlacement(menuRef, {
    preferredDirection: 'down',
    estimatedWidth: 128,
  });

  const resolvedOptions = options.map((option) => resolveParamOption(t, option));
  const selected = resolvedOptions.find((option) => option.value === value);

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => {
          if (!isOpen) setPlacement(getPlacement());
          setIsOpen((current) => !current);
        }}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className="agent-control-chip agent-control-chip-param"
        style={{ color }}
      >
        <span className="agent-control-chip-text">{selected?.label ?? value}</span>
        <ChevronDownIcon className="w-2.5 h-2.5 opacity-60" />
      </button>

      {isOpen && (
        <div
          className={`agent-dropdown-menu agent-dropdown-menu-compact agent-dropdown-menu-param absolute ${dropdownPositionClass(placement)}`}
          role="menu"
        >
          <div className="agent-dropdown-header" role="presentation">
            {ariaLabel}
          </div>
          {resolvedOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              className={`agent-dropdown-item agent-dropdown-item-inline-detail ${
                option.value === value ? 'agent-dropdown-item-selected' : ''
              }`}
              role="menuitem"
            >
              <span className="agent-dropdown-item-label">
                {option.label}
                {option.hint ? (
                  <>
                    {' · '}
                    <span className="agent-dropdown-item-description">{option.hint}</span>
                  </>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface PresetDropdownProps<Value extends string> {
  readonly titleKey: string;
  readonly value: Value;
  readonly options: readonly Value[];
  readonly labelPrefix: string;
  readonly color?: string;
  readonly onChange: (value: Value) => void;
}

function PresetDropdown<Value extends string>({
  titleKey,
  value,
  options,
  labelPrefix,
  color,
  onChange,
}: PresetDropdownProps<Value>) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [placement, setPlacement] = useState<DropdownPlacement>({
    direction: 'down',
    alignment: 'start',
  });
  const menuRef = useRef<HTMLDivElement>(null);

  useClickOutsideSingle(menuRef, () => setIsOpen(false));
  const getPlacement = useDropdownPlacement(menuRef, {
    preferredDirection: 'down',
    estimatedWidth: 128,
  });

  const selectedLabel = t(`${labelPrefix}.${value}`);
  const titleLabel = t(titleKey);
  const title = `${titleLabel}: ${selectedLabel}`;

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => {
          if (!isOpen) setPlacement(getPlacement());
          setIsOpen(!isOpen);
        }}
        aria-label={t(titleKey)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className="agent-control-chip agent-control-chip-param agent-control-chip-preset"
        style={color ? { color } : undefined}
        title={title}
      >
        <span className="agent-control-chip-text">{selectedLabel}</span>
        <ChevronDownIcon className="w-2.5 h-2.5 opacity-60" />
      </button>

      {isOpen && (
        <div
          className={`agent-dropdown-menu agent-dropdown-menu-compact agent-dropdown-menu-preset absolute ${dropdownPositionClass(placement)}`}
          role="menu"
        >
          <div className="agent-dropdown-header" role="presentation">
            {titleLabel}
          </div>
          {options.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => {
                onChange(option);
                setIsOpen(false);
              }}
              className={`agent-dropdown-item agent-dropdown-item-inline-detail ${
                option === value ? 'agent-dropdown-item-selected' : ''
              }`}
              role="menuitem"
            >
              <span className="agent-dropdown-item-label">{t(`${labelPrefix}.${option}`)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function getAvailableAgentConfigCategories(
  availableModels: readonly ChatModelOption[],
  availableMediaModels: readonly ChatModelOption[],
): readonly AgentConfigCategory[] {
  const categories: AgentConfigCategory[] = [];
  if (availableModels.some((model) => model.id !== 'auto')) {
    categories.push('llm');
  }
  for (const category of MEDIA_CATEGORIES) {
    if (availableMediaModels.some((model) => model.category === category)) {
      categories.push(category);
    }
  }
  return categories;
}

function getInitialAgentConfigCategory(
  availableCategories: readonly AgentConfigCategory[],
  generationCategory: GenCategory,
): AgentConfigCategory {
  if (availableCategories.includes('llm')) return 'llm';
  if (availableCategories.includes(generationCategory)) return generationCategory;
  return availableCategories[0] ?? 'llm';
}

function getActiveAgentConfigCategory(
  currentCategory: AgentConfigCategory,
  availableCategories: readonly AgentConfigCategory[],
  generationCategory: GenCategory,
): AgentConfigCategory {
  if (availableCategories.length === 0) return 'llm';
  if (availableCategories.includes(currentCategory)) return currentCategory;
  return getInitialAgentConfigCategory(availableCategories, generationCategory);
}

function getSelectedLlmParameterControls(
  availableModels: readonly ChatModelOption[],
  selectedModel: string,
): NonNullable<ChatModelOption['llmParameterControls']> {
  const model =
    selectedModel === 'auto'
      ? availableModels.find((option) => option.id !== 'auto')
      : availableModels.find((option) => option.id === selectedModel);
  if (!model) {
    return {
      reasoning: false,
      verbosity: false,
      creativity: false,
      maxOutputTokens: false,
    };
  }
  return (
    model.llmParameterControls ?? {
      reasoning: false,
      verbosity: false,
      creativity: true,
      maxOutputTokens: true,
    }
  );
}

function ConfigCategoryIcon({ category }: { readonly category: AgentConfigCategory }) {
  if (category === 'llm') {
    return <SessionModeIcon mode="agent" size={13} />;
  }
  return <MediaCategoryIcon category={category} size={13} />;
}

function getConfigCategoryLabel(t: Translate, category: AgentConfigCategory): string {
  if (category === 'llm') return t('chat.agentConfig.category.chat');
  return t(`chat.generation.category.${category}`);
}

function getConfigCategoryColor(category: AgentConfigCategory): string {
  return getCategoryColor(category);
}

function resolveParamOption(t: Translate, option: ParamOption | ResolvedParamOption) {
  return {
    value: option.value,
    label: option.label,
    hint:
      'hint' in option
        ? option.hint
        : 'hintKey' in option && option.hintKey
          ? t(option.hintKey)
          : undefined,
  };
}

function parseGenerationDuration(value: string): GenerationDuration {
  if (value === 'auto') return 'auto';
  const duration = Number(value);
  if (!Number.isFinite(duration)) {
    throw new Error(`Invalid generation duration: ${value}`);
  }
  return duration;
}

function shortenModelLabel(label: string): string {
  const short = label.includes('/') ? (label.split('/').pop()?.trim() ?? label) : label;
  return short.length > 10 ? `${short.slice(0, 9)}...` : short;
}
