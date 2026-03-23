/**
 * MediaModelSelector Component
 *
 * Compact selector for the default media model.
 * Shows "media:none" when no model is configured, prompting user to set one.
 */

import { useState, useRef, useMemo } from 'react';
import type { ChatModelOption, MediaModelType } from '@neko/shared';
import { useClickOutsideSingle } from './useClickOutside';
import { ChevronDownIcon } from './DropdownMenu';
import { useTranslation } from '@/i18n/I18nContext';
import { ModelDot, getCategoryColor } from './ModelIcon';

interface MediaModelSelectorProps {
  selectedModel: string;
  models: ChatModelOption[];
  onSelect: (modelId: string) => void;
}

const MEDIA_CATEGORIES: MediaModelType[] = ['image', 'video', 'audio', 'music'];

const CATEGORY_LABELS: Record<MediaModelType, string> = {
  image: 'Image',
  video: 'Video',
  audio: 'Audio',
  music: 'Music',
};

export function MediaModelSelector({ selectedModel, models, onSelect }: MediaModelSelectorProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useClickOutsideSingle(menuRef, () => setIsOpen(false));

  // Group media models by category
  const groupedModels = useMemo(() => {
    const groups: Record<string, ChatModelOption[]> = {};

    for (const model of models) {
      if (model.id === 'none') continue;
      const category = model.category || 'image';
      if (!MEDIA_CATEGORIES.includes(category as MediaModelType)) continue;
      if (!groups[category]) {
        groups[category] = [];
      }
      groups[category].push(model);
    }

    const sortedCategories = Object.keys(groups).sort((a, b) => {
      const order: Record<string, number> = { image: 1, video: 2, audio: 3, music: 4 };
      return (order[a] ?? 99) - (order[b] ?? 99);
    });

    return { groups, sortedCategories };
  }, [models]);

  const getSelectedLabel = () => {
    if (!selectedModel || selectedModel === 'none') {
      return t('chat.mediaModelNone') || '无';
    }
    const model = models.find((m) => m.id === selectedModel);
    const raw = model?.label ?? selectedModel;
    // Take part after last '/' then truncate
    const short = raw.includes('/') ? (raw.split('/').pop()?.trim() ?? raw) : raw;
    return short.length > 12 ? `${short.slice(0, 11)}…` : short;
  };

  const hasModels = models.length > 0;
  const isNone = !selectedModel || selectedModel === 'none';
  const selectedModelObj = isNone ? null : models.find((m) => m.id === selectedModel);
  const dotColor = isNone
    ? 'var(--vscode-editorWarning-foreground)'
    : getCategoryColor(selectedModelObj?.category);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1 px-1.5 py-1 text-[11px] hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded transition-colors ${
          isNone
            ? 'text-[var(--vscode-editorWarning-foreground)]'
            : 'text-[var(--vscode-descriptionForeground)]'
        }`}
        title={selectedModelObj?.label ?? 'No media model'}
      >
        <ModelDot color={dotColor} />
        {getSelectedLabel()}
        <ChevronDownIcon className="w-3 h-3" />
      </button>

      {isOpen && (
        <div className="absolute bottom-full left-0 mb-1 bg-[var(--vscode-dropdown-background)] border border-[var(--vscode-dropdown-border)] rounded-md shadow-lg min-w-[200px] max-h-[400px] overflow-y-auto py-1 z-50">
          {/* None option */}
          <button
            onClick={() => {
              onSelect('none');
              setIsOpen(false);
            }}
            className={`w-full px-3 py-1.5 text-left text-[11px] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors ${
              isNone ? 'text-[var(--vscode-textLink-foreground)]' : ''
            }`}
          >
            {t('chat.mediaModelNone') || 'None'}
          </button>

          {/* Grouped media models */}
          {groupedModels.sortedCategories.map((category) => (
            <div key={category}>
              <div className="px-3 py-1 mt-1 text-[10px] text-[var(--vscode-descriptionForeground)] font-medium border-t border-[var(--vscode-dropdown-border)]">
                {CATEGORY_LABELS[category as MediaModelType] ?? category}
              </div>
              {groupedModels.groups[category]?.map((model) => (
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

          {/* No models message */}
          {!hasModels && (
            <div className="px-3 py-2 text-[10px] text-[var(--vscode-descriptionForeground)]">
              {t('chat.noMediaModelsConfigured') || 'No media models configured'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
