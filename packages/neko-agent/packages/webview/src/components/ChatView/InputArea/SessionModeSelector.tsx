/**
 * SessionModeSelector — top-level creative mode switcher.
 *
 * Controls the primary capability routing:
 *   agent  → direct creative collaboration with the Agent
 *   image  → image media generation
 *   video  → video media generation
 *   audio  → audio media generation
 */

import { useState, useRef } from 'react';
import type { SessionMode } from '@neko-agent/types';
import { useClickOutsideSingle } from './useClickOutside';
import { useDropdownPlacement, type DropdownPlacement } from './useDropdownDirection';
import { useTranslation } from '@/i18n/I18nContext';
import { SessionModeIcon } from './ComposerIcons';

interface SessionModeSelectorProps {
  mode: SessionMode;
  onChange: (mode: SessionMode) => void;
  availableModes?: readonly SessionMode[];
}

interface ModeOption {
  value: SessionMode;
  labelKey: string;
  descKey: string;
  sectionKey: string;
  badgeKey: string;
  color: string;
}

export const SESSION_MODE_COLORS: Record<SessionMode, string> = {
  agent: '#10A37F',
  image: '#A855F7',
  video: '#EF4444',
  audio: '#06B6D4',
};

export function SessionModeSelector({ mode, onChange, availableModes }: SessionModeSelectorProps) {
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
    estimatedWidth: 344,
  });

  const allOptions: ModeOption[] = [
    {
      value: 'agent',
      labelKey: 'chat.sessionMode.agent',
      descKey: 'chat.sessionMode.agentDesc',
      sectionKey: 'chat.sessionMode.sections.agent',
      badgeKey: 'chat.sessionMode.badge.agent',
      color: SESSION_MODE_COLORS.agent,
    },
    {
      value: 'image',
      labelKey: 'chat.sessionMode.image',
      descKey: 'chat.sessionMode.imageDesc',
      sectionKey: 'chat.sessionMode.sections.media',
      badgeKey: 'chat.sessionMode.badge.image',
      color: SESSION_MODE_COLORS.image,
    },
    {
      value: 'video',
      labelKey: 'chat.sessionMode.video',
      descKey: 'chat.sessionMode.videoDesc',
      sectionKey: 'chat.sessionMode.sections.media',
      badgeKey: 'chat.sessionMode.badge.video',
      color: SESSION_MODE_COLORS.video,
    },
    {
      value: 'audio',
      labelKey: 'chat.sessionMode.audio',
      descKey: 'chat.sessionMode.audioDesc',
      sectionKey: 'chat.sessionMode.sections.media',
      badgeKey: 'chat.sessionMode.badge.audio',
      color: SESSION_MODE_COLORS.audio,
    },
  ];

  const availableModeSet = new Set<SessionMode>(
    availableModes ?? allOptions.map((opt) => opt.value),
  );
  const OPTIONS = allOptions.filter((opt) => availableModeSet.has(opt.value));
  const current = OPTIONS.find((o) => o.value === mode) ?? allOptions[0]!;
  const canSwitchMode = OPTIONS.length > 1;
  const sections = buildModeSections(OPTIONS);

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => {
          if (!canSwitchMode) return;
          if (!isOpen) setPlacement(getPlacement());
          setIsOpen(!isOpen);
        }}
        aria-label={t(current.labelKey)}
        aria-haspopup="menu"
        aria-expanded={canSwitchMode ? isOpen : false}
        className="agent-control-chip agent-control-chip-icon"
        style={{ color: current.color }}
        title={t(current.labelKey)}
      >
        <SessionModeIcon mode={current.value} size={14} />
      </button>

      {isOpen && canSwitchMode && (
        <div
          className={`agent-composer-popover agent-composer-session-mode-menu absolute ${sessionModeMenuPositionClass(placement)}`}
          role="menu"
        >
          <div className="agent-composer-popover-scroll">
            {sections.map((section) => (
              <div key={section.sectionKey}>
                <div className="agent-composer-popover-section">{t(section.sectionKey)}</div>
                {section.options.map((opt) => {
                  const isSelected = mode === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        onChange(opt.value);
                        setIsOpen(false);
                      }}
                      className={`agent-composer-popover-row agent-composer-session-mode-row ${
                        isSelected ? 'is-selected' : ''
                      }`}
                      role="menuitem"
                    >
                      <span
                        aria-hidden="true"
                        className="agent-composer-glyph"
                        style={{ color: opt.color, borderColor: opt.color }}
                      >
                        <SessionModeIcon mode={opt.value} size={12} />
                      </span>
                      <span className="agent-composer-session-mode-main">
                        <span className="agent-composer-popover-primary">{t(opt.labelKey)}</span>
                        <span className="agent-composer-popover-secondary">{t(opt.descKey)}</span>
                      </span>
                      <span className="agent-composer-popover-badge">{t(opt.badgeKey)}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function sessionModeMenuPositionClass(placement: DropdownPlacement): string {
  const directionClass = placement.direction === 'down' ? 'is-placement-down' : 'is-placement-up';
  const alignmentClass = placement.alignment === 'end' ? 'is-align-end' : 'is-align-start';
  return `${directionClass} ${alignmentClass}`;
}

interface ModeSection {
  sectionKey: string;
  options: ModeOption[];
}

function buildModeSections(options: readonly ModeOption[]): ModeSection[] {
  const sections: ModeSection[] = [];
  for (const option of options) {
    const section = sections.find((item) => item.sectionKey === option.sectionKey);
    if (section) {
      section.options.push(option);
    } else {
      sections.push({ sectionKey: option.sectionKey, options: [option] });
    }
  }
  return sections;
}
