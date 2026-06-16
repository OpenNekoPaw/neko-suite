/**
 * ModeSelector Component
 * Shell execution mode selector (plan/ask/auto)
 */

import { useState, useRef } from 'react';
import { ShellExecutionMode } from '@neko-agent/types';
import { useClickOutsideSingle } from './useClickOutside';
import { ChevronDownIcon } from './DropdownMenu';
import { useDropdownDirection, dropdownPositionClass } from './useDropdownDirection';
import { useTranslation } from '@/i18n/I18nContext';

interface ModeSelectorProps {
  mode: ShellExecutionMode;
  onChange: (mode: ShellExecutionMode) => void;
}

export function ModeSelector({ mode, onChange }: ModeSelectorProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [direction, setDirection] = useState<'up' | 'down'>('up');
  const menuRef = useRef<HTMLDivElement>(null);

  useClickOutsideSingle(menuRef, () => setIsOpen(false));
  const getDirection = useDropdownDirection(menuRef, 'up');

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
        type="button"
        onClick={() => {
          if (!isOpen) setDirection(getDirection());
          setIsOpen(!isOpen);
        }}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className="agent-control-chip"
        title={`${t('chat.executionMode.title')} (Shift+Tab)`}
      >
        <span className="agent-control-chip-text">
          {currentMode ? t(currentMode.labelKey) : mode}
        </span>
        <ChevronDownIcon className="w-3 h-3" />
      </button>

      {isOpen && (
        <div
          className={`agent-dropdown-menu agent-dropdown-menu-model absolute ${dropdownPositionClass(direction)} left-0`}
          role="menu"
        >
          {MODE_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              className={`agent-dropdown-item agent-dropdown-item-stacked ${
                mode === option.value ? 'agent-dropdown-item-selected' : ''
              }`}
              role="menuitem"
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
