/**
 * ModeSelector Component
 * Shell execution mode selector (plan/ask/auto)
 */

import { useState, useRef } from 'react';
import { ShellExecutionMode } from '@neko-agent/types';
import { useClickOutsideSingle } from './useClickOutside';
import { ChevronDownIcon } from './DropdownMenu';
import { useTranslation } from '@/i18n/I18nContext';

interface ModeSelectorProps {
  mode: ShellExecutionMode;
  onChange: (mode: ShellExecutionMode) => void;
}

export function ModeSelector({ mode, onChange }: ModeSelectorProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useClickOutsideSingle(menuRef, () => setIsOpen(false));

  const MODE_OPTIONS: Array<{
    value: ShellExecutionMode;
    labelKey: string;
    descriptionKey: string;
  }> = [
    {
      value: 'plan',
      labelKey: 'chat.executionMode.plan',
      descriptionKey: 'chat.executionMode.planDesc',
    },
    {
      value: 'ask',
      labelKey: 'chat.executionMode.ask',
      descriptionKey: 'chat.executionMode.askDesc',
    },
    {
      value: 'auto',
      labelKey: 'chat.executionMode.auto',
      descriptionKey: 'chat.executionMode.autoDesc',
    },
  ];

  const currentMode = MODE_OPTIONS.find((option) => option.value === mode);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-0.5 px-1.5 py-1 text-[11px] text-[var(--vscode-descriptionForeground)] hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded transition-colors"
        title={`${t('chat.executionMode.title')} (Shift+Tab)`}
      >
        <span>{currentMode ? t(currentMode.labelKey) : mode}</span>
        <ChevronDownIcon className="w-3 h-3" />
      </button>

      {isOpen && (
        <div className="absolute bottom-full left-0 mb-1 bg-[var(--vscode-dropdown-background)] border border-[var(--vscode-dropdown-border)] rounded-md shadow-lg min-w-[180px] py-1 z-50">
          {MODE_OPTIONS.map((option) => (
            <button
              key={option.value}
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              className={`w-full px-3 py-1.5 text-left text-[11px] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors ${
                mode === option.value ? 'text-[var(--vscode-textLink-foreground)]' : ''
              }`}
            >
              <div>{t(option.labelKey)}</div>
              <div className="text-[9px] text-[var(--vscode-descriptionForeground)]">
                {t(option.descriptionKey)}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
