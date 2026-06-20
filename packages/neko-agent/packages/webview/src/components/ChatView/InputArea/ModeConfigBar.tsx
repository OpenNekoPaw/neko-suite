import { useRef, useState } from 'react';
import type {
  AgentCreativityPreset,
  AgentLlmConfig,
  AgentReasoningPreset,
  AgentVerbosityPreset,
  SessionMode,
} from '@neko-agent/types';
import type { ChatModelOption } from '@neko/shared';
import { GenerationParamsBar } from './GenerationParamsBar';
import { ModelSelector } from './ModelSelector';
import { CategoryChip, MEDIA_CATEGORY_ICONS } from './AgentMediaBar';
import { ChevronDownIcon } from './DropdownMenu';
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
  readonly llmConfig: AgentLlmConfig;
  readonly onLlmConfigChange: (config: AgentLlmConfig) => void;
  readonly showAgentConfig: boolean;
  readonly showMediaConfig: boolean;
}

const REASONING_OPTIONS: readonly AgentReasoningPreset[] = ['fast', 'balanced', 'deep'];
const VERBOSITY_OPTIONS: readonly AgentVerbosityPreset[] = ['brief', 'standard', 'detailed'];
const CREATIVITY_OPTIONS: readonly AgentCreativityPreset[] = ['stable', 'creative', 'wild'];
const MEDIA_CATEGORIES: readonly MediaCategory[] = ['image', 'video', 'audio'];

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
  llmConfig,
  onLlmConfigChange,
  showAgentConfig,
  showMediaConfig,
}: ModeConfigBarProps) {
  const { t } = useTranslation();

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
        <span className="agent-composer-mode-label" title={t(projection.modeDescriptionKey)}>
          {t(projection.modeLabelKey)}
        </span>
      </div>

      <div
        className="agent-composer-control-group agent-composer-control-group-config"
        role="group"
        aria-label={t('chat.input.control.params')}
      >
        {projection.mode === 'agent' && showAgentConfig ? (
          <AgentInlineConfig
            availableModels={availableModels}
            selectedModel={selectedModel}
            onModelSelect={onModelSelect}
            mediaModelSelection={mediaModelSelection}
            availableMediaModels={availableMediaModels}
            onMediaModelSelect={onMediaModelSelect}
            llmConfig={llmConfig}
            onLlmConfigChange={onLlmConfigChange}
          />
        ) : showMediaConfig ? (
          <GenerationParamsBar />
        ) : null}
      </div>
    </div>
  );
}

interface AgentInlineConfigProps {
  readonly availableModels: readonly ChatModelOption[];
  readonly selectedModel: string;
  readonly onModelSelect: (modelId: string) => void;
  readonly mediaModelSelection: Readonly<MediaModelSelection>;
  readonly availableMediaModels: readonly ChatModelOption[];
  readonly onMediaModelSelect: (category: MediaCategory, modelId: string) => void;
  readonly llmConfig: AgentLlmConfig;
  readonly onLlmConfigChange: (config: AgentLlmConfig) => void;
}

function AgentInlineConfig({
  availableModels,
  selectedModel,
  onModelSelect,
  mediaModelSelection,
  availableMediaModels,
  onMediaModelSelect,
  llmConfig,
  onLlmConfigChange,
}: AgentInlineConfigProps) {
  const { t } = useTranslation();

  return (
    <div className="agent-inline-config-stack">
      <div
        className="agent-inline-config-group agent-inline-config-group-models"
        role="group"
        aria-label={t('chat.agentConfig.group.models')}
      >
        <span className="agent-inline-config-label">{t('chat.agentConfig.group.modelsShort')}</span>
        <ModelSelector
          selectedModel={selectedModel}
          models={[...availableModels]}
          onSelect={onModelSelect}
        />
        {MEDIA_CATEGORIES.map((category) => {
          const models = availableMediaModels.filter((model) => model.category === category);
          if (models.length === 0) return null;
          return (
            <CategoryChip
              key={category}
              category={category}
              Icon={MEDIA_CATEGORY_ICONS[category]}
              selectedId={mediaModelSelection[category]}
              models={models}
              onSelect={(modelId) => onMediaModelSelect(category, modelId)}
            />
          );
        })}
      </div>

      <div
        className="agent-inline-config-group agent-inline-config-group-behavior"
        role="group"
        aria-label={t('chat.agentConfig.group.behavior')}
      >
        <span className="agent-inline-config-label">
          {t('chat.agentConfig.group.behaviorShort')}
        </span>
        <PresetDropdown
          titleKey="chat.agentConfig.section.reasoning"
          shortLabelKey="chat.agentConfig.short.reasoning"
          value={llmConfig.reasoningPreset ?? 'balanced'}
          options={REASONING_OPTIONS}
          labelPrefix="chat.agentConfig.reasoning"
          onChange={(reasoningPreset) => onLlmConfigChange({ ...llmConfig, reasoningPreset })}
        />
        <PresetDropdown
          titleKey="chat.agentConfig.section.verbosity"
          shortLabelKey="chat.agentConfig.short.verbosity"
          value={llmConfig.verbosityPreset ?? 'standard'}
          options={VERBOSITY_OPTIONS}
          labelPrefix="chat.agentConfig.verbosity"
          onChange={(verbosityPreset) => onLlmConfigChange({ ...llmConfig, verbosityPreset })}
        />
        <PresetDropdown
          titleKey="chat.agentConfig.section.creativity"
          shortLabelKey="chat.agentConfig.short.creativity"
          value={llmConfig.creativityPreset ?? 'creative'}
          options={CREATIVITY_OPTIONS}
          labelPrefix="chat.agentConfig.creativity"
          onChange={(creativityPreset) => onLlmConfigChange({ ...llmConfig, creativityPreset })}
        />
      </div>
    </div>
  );
}

interface PresetDropdownProps<Value extends string> {
  readonly titleKey: string;
  readonly shortLabelKey: string;
  readonly value: Value;
  readonly options: readonly Value[];
  readonly labelPrefix: string;
  readonly onChange: (value: Value) => void;
}

function PresetDropdown<Value extends string>({
  titleKey,
  shortLabelKey,
  value,
  options,
  labelPrefix,
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
    estimatedWidth: 188,
  });

  const selectedLabel = t(`${labelPrefix}.${value}`);
  const title = `${t(titleKey)}: ${selectedLabel}`;

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
        title={title}
      >
        <span className="agent-control-chip-prefix">{t(shortLabelKey)}</span>
        <span className="agent-control-chip-text">{selectedLabel}</span>
        <ChevronDownIcon className="w-2.5 h-2.5 opacity-60" />
      </button>

      {isOpen && (
        <div
          className={`agent-dropdown-menu agent-dropdown-menu-compact absolute ${dropdownPositionClass(placement)}`}
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
                option === value ? 'agent-dropdown-item-selected' : ''
              }`}
              role="menuitem"
            >
              {t(`${labelPrefix}.${option}`)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
