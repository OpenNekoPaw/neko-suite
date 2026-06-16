/**
 * SessionModeSelector — top-level workflow mode switcher.
 *
 * Controls the primary capability routing:
 *   agent  → LLM reasoning + tool calls
 *   image  → image generation (filters to image media models)
 *   video  → video generation (filters to video media models)
 *   audio  → audio generation (filters to audio media models)
 */

import { useState, useRef } from 'react';
import type { SessionMode } from '@neko-agent/types';
import { useClickOutsideSingle } from './useClickOutside';
import { useDropdownDirection, dropdownPositionClass } from './useDropdownDirection';
import { useTranslation } from '@/i18n/I18nContext';
import { SessionModeIcon } from './ComposerIcons';

interface SessionModeSelectorProps {
  mode: SessionMode;
  onChange: (mode: SessionMode) => void;
}

interface ModeOption {
  value: SessionMode;
  labelKey: string;
  descKey: string;
  color: string;
}

export const SESSION_MODE_COLORS: Record<SessionMode, string> = {
  agent: '#10A37F',
  image: '#A855F7',
  video: '#EF4444',
  audio: '#06B6D4',
};

export function SessionModeSelector({ mode, onChange }: SessionModeSelectorProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [direction, setDirection] = useState<'up' | 'down'>('up');
  const menuRef = useRef<HTMLDivElement>(null);

  useClickOutsideSingle(menuRef, () => setIsOpen(false));
  const getDirection = useDropdownDirection(menuRef, 'up');

  const OPTIONS: ModeOption[] = [
    {
      value: 'agent',
      labelKey: 'chat.sessionMode.agent',
      descKey: 'chat.sessionMode.agentDesc',
      color: SESSION_MODE_COLORS.agent,
    },
    {
      value: 'image',
      labelKey: 'chat.sessionMode.image',
      descKey: 'chat.sessionMode.imageDesc',
      color: SESSION_MODE_COLORS.image,
    },
    {
      value: 'video',
      labelKey: 'chat.sessionMode.video',
      descKey: 'chat.sessionMode.videoDesc',
      color: SESSION_MODE_COLORS.video,
    },
    {
      value: 'audio',
      labelKey: 'chat.sessionMode.audio',
      descKey: 'chat.sessionMode.audioDesc',
      color: SESSION_MODE_COLORS.audio,
    },
  ];

  const current = OPTIONS.find((o) => o.value === mode)!;

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => {
          if (!isOpen) setDirection(getDirection());
          setIsOpen(!isOpen);
        }}
        aria-label={t(current.labelKey)}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className="agent-control-chip agent-control-chip-icon"
        style={{ color: current.color }}
        title={t(current.labelKey)}
      >
        <SessionModeIcon mode={current.value} size={14} />
      </button>

      {isOpen && (
        <div
          className={`agent-dropdown-menu agent-dropdown-menu-mode absolute ${dropdownPositionClass(direction)} left-0`}
          role="menu"
        >
          {OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setIsOpen(false);
              }}
              className={`agent-dropdown-item ${
                mode === opt.value ? 'agent-dropdown-item-selected' : ''
              }`}
              role="menuitem"
            >
              {/* Colored icon */}
              <span className="flex-shrink-0" style={{ color: opt.color }}>
                <SessionModeIcon mode={opt.value} size={14} />
              </span>
              <span className="agent-dropdown-item-label">{t(opt.labelKey)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
