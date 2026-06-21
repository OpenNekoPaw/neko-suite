/**
 * AgentMediaBar — compact per-category media model indicators for Agent mode.
 *
 * Shows configured media category chips (image / video / audio):
 *  - Colored + model name  → category configured with a selected model
 *  - Dimmed icon only      → category has available models but none selected
 *  - Hidden                → no models available for this category
 *
 * Clicking a chip opens a dropdown filtered to that category.
 */

import { useState, useRef } from 'react';
import type { ChatModelOption } from '@neko/shared';
import type { MediaCategory } from '@/components/ChatView/InputAreaContext';
import { useClickOutsideSingle } from './useClickOutside';
import {
  dropdownPositionClass,
  useDropdownPlacement,
  type DropdownPlacement,
} from './useDropdownDirection';
import { getCategoryColor } from './ModelIcon';
import { MediaCategoryIcon } from './ComposerIcons';
import { ChevronDownIcon } from './DropdownMenu';
import { useTranslation } from '@/i18n/I18nContext';

export const MEDIA_CATEGORY_ICONS: Record<MediaCategory, () => JSX.Element> = {
  image: () => <MediaCategoryIcon category="image" size={13} />,
  video: () => <MediaCategoryIcon category="video" size={13} />,
  audio: () => <MediaCategoryIcon category="audio" size={13} />,
};

function shortenLabel(label: string): string {
  const short = label.includes('/') ? (label.split('/').pop()?.trim() ?? label) : label;
  return short.length > 10 ? `${short.slice(0, 9)}…` : short;
}

export interface CategoryChipProps {
  category: MediaCategory;
  Icon: () => JSX.Element;
  selectedId: string;
  models: ChatModelOption[];
  onSelect: (modelId: string) => void;
}

export function CategoryChip({ category, Icon, selectedId, models, onSelect }: CategoryChipProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<DropdownPlacement>({
    direction: 'up',
    alignment: 'start',
  });
  const ref = useRef<HTMLDivElement>(null);
  useClickOutsideSingle(ref, () => setOpen(false));
  const getPlacement = useDropdownPlacement(ref, {
    preferredDirection: 'up',
    estimatedWidth: 360,
  });

  const color = getCategoryColor(category);
  const selected = models.find((m) => m.id === selectedId);
  const isConfigured = !!selected && selectedId !== 'none';
  const hasModels = models.length > 0;
  const categoryLabel = t(`chat.generation.category.${category}`);

  const handleOpen = () => {
    if (!hasModels) return; // no dropdown if no models available
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
        <Icon />
        {isConfigured ? (
          <span className="agent-control-chip-text">{shortenLabel(selected.label)}</span>
        ) : (
          <span className="agent-control-chip-text text-[var(--vscode-descriptionForeground)]">
            {t('chat.generation.model.noneShort')}
          </span>
        )}
        {hasModels && <ChevronDownIcon className="w-2.5 h-2.5 opacity-60" />}
      </button>

      {open && hasModels && (
        <div
          className={`agent-dropdown-menu agent-dropdown-menu-model absolute ${dropdownPositionClass(placement)}`}
          role="menu"
        >
          {/* None option */}
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
              <span className="agent-dropdown-item-label">{m.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
