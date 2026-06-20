/**
 * ModelSelector Component
 */

import { useState, useRef, useMemo } from 'react';
import type { ChatModelOption, ModelType } from '@neko/shared';
import { useClickOutsideSingle } from './useClickOutside';
import {
  dropdownPositionClass,
  useDropdownPlacement,
  type DropdownPlacement,
} from './useDropdownDirection';
import { ChevronDownIcon } from './DropdownMenu';
import { useTranslation } from '@/i18n/I18nContext';
import { ModelDot, getProviderColor } from './ModelIcon';

interface ModelSelectorProps {
  selectedModel: string;
  models: ChatModelOption[];
  onSelect: (modelId: string) => void;
}

// Category labels and order
const CATEGORY_CONFIG: Record<ModelType, { labelKey: string; order: number }> = {
  llm: { labelKey: 'chat.categoryChat', order: 1 },
  image: { labelKey: 'chat.categoryImage', order: 2 },
  video: { labelKey: 'chat.categoryVideo', order: 3 },
  audio: { labelKey: 'chat.categoryAudio', order: 4 },
};

export function ModelSelector({ selectedModel, models, onSelect }: ModelSelectorProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [placement, setPlacement] = useState<DropdownPlacement>({
    direction: 'up',
    alignment: 'start',
  });
  const menuRef = useRef<HTMLDivElement>(null);

  useClickOutsideSingle(menuRef, () => setIsOpen(false));
  const getPlacement = useDropdownPlacement(menuRef, {
    preferredDirection: 'up',
    estimatedWidth: 360,
  });

  // Group models by category
  const groupedModels = useMemo(() => {
    const groups: Record<string, ChatModelOption[]> = {};
    const autoModel = models.find((m) => m.id === 'auto');
    const selectableModels = models.filter((m) => m.id !== 'auto');

    for (const model of selectableModels) {
      const category = (model as ChatModelOption).category || 'llm';
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(model as ChatModelOption);
    }

    // Sort categories by order
    const sortedCategories = Object.keys(groups).sort((a, b) => {
      const orderA = CATEGORY_CONFIG[a as ModelType]?.order ?? 99;
      const orderB = CATEGORY_CONFIG[b as ModelType]?.order ?? 99;
      return orderA - orderB;
    });

    return {
      autoModel,
      groups,
      sortedCategories,
      hasSelectableModels: selectableModels.length > 0,
    };
  }, [models]);

  const getSelectedLabel = () => {
    if (!groupedModels.hasSelectableModels) return t('chat.noModelsAvailable');
    if (selectedModel === 'auto') return t('chat.autoMode');
    const model = models.find((m) => m.id === selectedModel);
    const label = model?.label ?? t('chat.autoMode');
    // Show only the part after the last '/' (e.g. "openai / gpt-4o" → "gpt-4o")
    const short = label.includes('/') ? (label.split('/').pop()?.trim() ?? label) : label;
    return short.length > 16 ? `${short.slice(0, 15)}…` : short;
  };

  const getCategoryLabel = (category: string): string => {
    const config = CATEGORY_CONFIG[category as ModelType];
    if (config) {
      const label = t(config.labelKey);
      // Fallback if translation not found
      return label !== config.labelKey
        ? label
        : category.charAt(0).toUpperCase() + category.slice(1);
    }
    return category.charAt(0).toUpperCase() + category.slice(1);
  };

  const selectedModelObj =
    selectedModel === 'auto' ? null : models.find((m) => m.id === selectedModel);
  const dotColor =
    selectedModelObj && groupedModels.hasSelectableModels
      ? getProviderColor(selectedModelObj.providerId)
      : '#6B7280';

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => {
          if (!isOpen) setPlacement(getPlacement());
          setIsOpen(!isOpen);
        }}
        aria-label={t('chat.selectModel')}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className="agent-control-chip"
        title={
          groupedModels.hasSelectableModels
            ? (selectedModelObj?.label ?? t('chat.autoMode'))
            : t('chat.noModelsAvailable')
        }
      >
        <ModelDot color={dotColor} />
        <span className="agent-control-chip-text">{getSelectedLabel()}</span>
        <ChevronDownIcon className="w-3 h-3" />
      </button>

      {isOpen && (
        <div
          className={`agent-dropdown-menu agent-dropdown-menu-model absolute ${dropdownPositionClass(placement)}`}
          role="menu"
        >
          {/* Auto option */}
          {groupedModels.autoModel && groupedModels.hasSelectableModels && (
            <button
              type="button"
              onClick={() => {
                onSelect('auto');
                setIsOpen(false);
              }}
              className={`agent-dropdown-item ${
                selectedModel === 'auto' ? 'agent-dropdown-item-selected' : ''
              }`}
              role="menuitem"
            >
              {t('chat.autoMode')}
            </button>
          )}

          {/* Grouped models */}
          {groupedModels.sortedCategories.map((category) => (
            <div key={category}>
              {/* Category header */}
              <div className="agent-dropdown-section">{getCategoryLabel(category)}</div>
              {/* Models in this category */}
              {groupedModels.groups[category].map((model) => (
                <button
                  key={model.id}
                  type="button"
                  onClick={() => {
                    onSelect(model.id);
                    setIsOpen(false);
                  }}
                  className={`agent-dropdown-item ${
                    selectedModel === model.id ? 'agent-dropdown-item-selected' : ''
                  }`}
                  role="menuitem"
                >
                  <span className="agent-dropdown-item-label">{model.label}</span>
                </button>
              ))}
            </div>
          ))}

          {/* No providers message */}
          {!groupedModels.hasSelectableModels && (
            <div className="px-2 py-1 text-[10px] text-[var(--vscode-descriptionForeground)]">
              {t('chat.noModelsAvailable')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
