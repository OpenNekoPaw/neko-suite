/**
 * AgentMediaBar — compact per-category media model indicators for Agent mode.
 *
 * Shows three small chips (image / video / audio):
 *  - Colored + model name  → category configured with a selected model
 *  - Dimmed icon only      → category has available models but none selected
 *  - Hidden                → no models available for this category
 *
 * Clicking a chip opens a dropdown filtered to that category.
 */

import { useState, useRef, useCallback } from 'react';
import type { ChatModelOption } from '@neko/shared';
import type { MediaCategory, MediaModelSelection } from '@/components/ChatView/InputAreaContext';
import { useClickOutsideSingle } from './useClickOutside';
import { useDropdownDirection, dropdownPositionClass } from './useDropdownDirection';
import { getCategoryColor } from './ModelIcon';
import { ModelDot } from './ModelIcon';

interface AgentMediaBarProps {
  selection: MediaModelSelection;
  availableModels: ChatModelOption[];
  onSelect: (category: MediaCategory, modelId: string) => void;
}

export const MEDIA_CATEGORY_ICONS: Record<MediaCategory, () => JSX.Element> = {
  image: () => (
    <svg viewBox="0 0 14 14" fill="currentColor" className="w-3 h-3">
      <path d="M1 2a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2zm1 0v6.5l2-2a.5.5 0 0 1 .65-.04l2 1.6 2-2a.5.5 0 0 1 .7 0L13 8V2H2z" />
      <circle cx="4.5" cy="4.5" r="1" />
    </svg>
  ),
  video: () => (
    <svg viewBox="0 0 14 14" fill="currentColor" className="w-3 h-3">
      <path d="M0 3a1.5 1.5 0 0 1 1.5-1.5h8A1.5 1.5 0 0 1 11 3v1.8l2-1.3A.5.5 0 0 1 14 4v6a.5.5 0 0 1-.77.42L11 9.2V11a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 0 11V3z" />
    </svg>
  ),
  audio: () => (
    <svg viewBox="0 0 14 14" fill="currentColor" className="w-3 h-3">
      <path d="M5 1a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V1zM1 5a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V5zm9-2a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1V3z" />
    </svg>
  ),
};

const CATEGORIES: Array<{ key: MediaCategory; Icon: () => JSX.Element }> = [
  {
    key: 'image',
    Icon: () => (
      <svg viewBox="0 0 14 14" fill="currentColor" className="w-3 h-3">
        <path d="M1 2a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V2zm1 0v6.5l2-2a.5.5 0 0 1 .65-.04l2 1.6 2-2a.5.5 0 0 1 .7 0L13 8V2H2z" />
        <circle cx="4.5" cy="4.5" r="1" />
      </svg>
    ),
  },
  {
    key: 'video',
    Icon: () => (
      <svg viewBox="0 0 14 14" fill="currentColor" className="w-3 h-3">
        <path d="M0 3a1.5 1.5 0 0 1 1.5-1.5h8A1.5 1.5 0 0 1 11 3v1.8l2-1.3A.5.5 0 0 1 14 4v6a.5.5 0 0 1-.77.42L11 9.2V11a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 0 11V3z" />
      </svg>
    ),
  },
  {
    key: 'audio',
    Icon: () => (
      <svg viewBox="0 0 14 14" fill="currentColor" className="w-3 h-3">
        <path d="M5 1a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V1zM1 5a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H2a1 1 0 0 1-1-1V5zm9-2a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1V3z" />
      </svg>
    ),
  },
];

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
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState<'up' | 'down'>('up');
  const ref = useRef<HTMLDivElement>(null);
  useClickOutsideSingle(ref, () => setOpen(false));
  const getDirection = useDropdownDirection(ref, 'up');

  const color = getCategoryColor(category);
  const selected = models.find((m) => m.id === selectedId);
  const isConfigured = !!selected && selectedId !== 'none';
  const hasModels = models.length > 0;

  const handleOpen = () => {
    if (!hasModels) return; // no dropdown if no models available
    if (!open) setDirection(getDirection());
    setOpen((v) => !v);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={handleOpen}
        className="flex items-center gap-1 px-1.5 py-1 rounded text-[11px] hover:bg-[var(--vscode-toolbar-hoverBackground)] transition-colors"
        style={{
          color: isConfigured ? color : 'var(--vscode-descriptionForeground)',
          opacity: isConfigured ? 1 : 0.5,
        }}
        title={
          selected?.label ??
          (hasModels ? `Select ${category} model` : `No ${category} model configured`)
        }
      >
        <Icon />
        {isConfigured ? (
          <span>{shortenLabel(selected.label)}</span>
        ) : (
          <span className="text-[var(--vscode-descriptionForeground)] opacity-60">none</span>
        )}
      </button>

      {open && hasModels && (
        <div
          className={`absolute ${dropdownPositionClass(direction)} left-0 bg-[var(--vscode-dropdown-background)] border border-[var(--vscode-dropdown-border)] rounded-md shadow-lg min-w-[180px] py-1 z-50`}
        >
          {/* None option */}
          <button
            onClick={() => {
              onSelect('none');
              setOpen(false);
            }}
            className={`w-full px-3 py-1.5 text-left text-[11px] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors ${
              selectedId === 'none'
                ? 'text-[var(--vscode-textLink-foreground)]'
                : 'text-[var(--vscode-descriptionForeground)]'
            }`}
          >
            不使用
          </button>
          {models.map((m) => (
            <button
              key={m.id}
              onClick={() => {
                onSelect(m.id);
                setOpen(false);
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-[11px] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors"
            >
              <ModelDot color={color} />
              <span style={{ color: m.id === selectedId ? color : 'var(--vscode-foreground)' }}>
                {m.label}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function AgentMediaBar({ selection, availableModels, onSelect }: AgentMediaBarProps) {
  const getModels = useCallback(
    (cat: MediaCategory) => availableModels.filter((m) => m.category === cat),
    [availableModels],
  );

  // Hide entirely if no media models configured at all
  const hasAny = availableModels.length > 0;
  if (!hasAny) return null;

  return (
    <div className="flex items-center">
      {CATEGORIES.map(({ key, Icon }) => (
        <CategoryChip
          key={key}
          category={key}
          Icon={Icon}
          selectedId={selection[key]}
          models={getModels(key)}
          onSelect={(modelId) => onSelect(key, modelId)}
        />
      ))}
    </div>
  );
}
