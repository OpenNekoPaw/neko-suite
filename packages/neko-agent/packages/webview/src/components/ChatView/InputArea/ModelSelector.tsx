/**
 * ModelSelector Component
 */

import { useState, useRef, useMemo } from 'react';
import type { ChatModelOption } from '@neko/shared';
import { useClickOutsideSingle } from './useClickOutside';
import { ChevronDownIcon } from './DropdownMenu';
import { useTranslation } from '@/i18n/I18nContext';
import type { ModelCategory } from '@neko/shared';

interface ModelSelectorProps {
  selectedModel: string;
  models: ChatModelOption[];
  onSelect: (modelId: string) => void;
}

// Category labels and order
const CATEGORY_CONFIG: Record<ModelCategory, { labelKey: string; order: number }> = {
  chat: { labelKey: 'chat.categoryChat', order: 1 },
  image: { labelKey: 'chat.categoryImage', order: 2 },
  video: { labelKey: 'chat.categoryVideo', order: 3 },
  audio: { labelKey: 'chat.categoryAudio', order: 4 },
  other: { labelKey: 'chat.categoryOther', order: 5 },
};

export function ModelSelector({ selectedModel, models, onSelect }: ModelSelectorProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useClickOutsideSingle(menuRef, () => setIsOpen(false));

  // Group models by category
  const groupedModels = useMemo(() => {
    const groups: Record<string, ChatModelOption[]> = {};
    const autoModel = models.find((m) => m.id === 'auto');

    for (const model of models) {
      if (model.id === 'auto') continue;
      const category = (model as ChatModelOption).category || 'chat';
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(model as ChatModelOption);
    }

    // Sort categories by order
    const sortedCategories = Object.keys(groups).sort((a, b) => {
      const orderA = CATEGORY_CONFIG[a as ModelCategory]?.order ?? 99;
      const orderB = CATEGORY_CONFIG[b as ModelCategory]?.order ?? 99;
      return orderA - orderB;
    });

    return { autoModel, groups, sortedCategories };
  }, [models]);

  const getSelectedLabel = () => {
    if (selectedModel === 'auto') return t('chat.autoMode');
    const model = models.find((m) => m.id === selectedModel);
    return model?.label || t('chat.autoMode');
  };

  const getCategoryLabel = (category: string): string => {
    const config = CATEGORY_CONFIG[category as ModelCategory];
    if (config) {
      const label = t(config.labelKey);
      // Fallback if translation not found
      return label !== config.labelKey
        ? label
        : category.charAt(0).toUpperCase() + category.slice(1);
    }
    return category.charAt(0).toUpperCase() + category.slice(1);
  };

  const hasModels = models.length > 1;

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 px-2 py-1 text-[11px] text-[var(--vscode-descriptionForeground)] hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded transition-colors"
      >
        {getSelectedLabel()}
        <ChevronDownIcon className="w-3 h-3" />
      </button>

      {isOpen && (
        <div className="absolute bottom-full left-0 mb-1 bg-[var(--vscode-dropdown-background)] border border-[var(--vscode-dropdown-border)] rounded-md shadow-lg min-w-[200px] max-h-[400px] overflow-y-auto py-1 z-50">
          {/* Auto option */}
          {groupedModels.autoModel && (
            <button
              onClick={() => {
                onSelect('auto');
                setIsOpen(false);
              }}
              className={`w-full px-3 py-1.5 text-left text-[11px] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors ${
                selectedModel === 'auto' ? 'text-[var(--vscode-textLink-foreground)]' : ''
              }`}
            >
              {t('chat.autoMode')}
            </button>
          )}

          {/* Grouped models */}
          {groupedModels.sortedCategories.map((category) => (
            <div key={category}>
              {/* Category header */}
              <div className="px-3 py-1 mt-1 text-[10px] text-[var(--vscode-descriptionForeground)] font-medium border-t border-[var(--vscode-dropdown-border)]">
                {getCategoryLabel(category)}
              </div>
              {/* Models in this category */}
              {groupedModels.groups[category].map((model) => (
                <button
                  key={model.id}
                  onClick={() => {
                    onSelect(model.id);
                    setIsOpen(false);
                  }}
                  className={`w-full px-3 py-1.5 text-left text-[11px] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors ${
                    selectedModel === model.id ? 'text-[var(--vscode-textLink-foreground)]' : ''
                  }`}
                >
                  {model.label}
                </button>
              ))}
            </div>
          ))}

          {/* No providers message */}
          {!hasModels && (
            <div className="px-3 py-2 text-[10px] text-[var(--vscode-descriptionForeground)]">
              {t('chat.noProvidersConfigured')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
