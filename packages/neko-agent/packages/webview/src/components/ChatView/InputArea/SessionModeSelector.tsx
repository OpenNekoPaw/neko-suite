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
import type { SessionMode } from '@/components/types';
import { useClickOutsideSingle } from './useClickOutside';
import { useTranslation } from '@/i18n/I18nContext';

interface SessionModeSelectorProps {
  mode: SessionMode;
  onChange: (mode: SessionMode) => void;
}

interface ModeOption {
  value: SessionMode;
  labelKey: string;
  descKey: string;
  color: string;
  icon: React.ReactNode;
}

function AgentIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
      <path d="M8 1a3 3 0 1 0 0 6A3 3 0 0 0 8 1zM6 4a2 2 0 1 1 4 0 2 2 0 0 1-4 0z" />
      <path d="M3 13c0-2.21 2.239-4 5-4s5 1.79 5 4v.5a.5.5 0 0 1-1 0V13c0-1.657-1.791-3-4-3s-4 1.343-4 3v.5a.5.5 0 0 1-1 0V13z" />
      <circle cx="13" cy="4" r="1.5" />
      <path d="M11.5 4.5 L13 3 L14.5 4.5" stroke="currentColor" strokeWidth="0.8" fill="none" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
      <path d="M1 3a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V3zm2-1a1 1 0 0 0-1 1v6.5l2.5-2.5a.5.5 0 0 1 .668-.04l2.5 2 2.332-2.332a.5.5 0 0 1 .7-.004L14 9.5V3a1 1 0 0 0-1-1H3z" />
      <circle cx="5.5" cy="5.5" r="1.5" />
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
      <path d="M0 3.5A1.5 1.5 0 0 1 1.5 2h10A1.5 1.5 0 0 1 13 3.5v2.293l2.146-2.147a.5.5 0 0 1 .854.354v7a.5.5 0 0 1-.854.353L13 9.207V11.5a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 0 11.5v-8z" />
    </svg>
  );
}

function AudioIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
      <path d="M6 1a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V1zm-4 5a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V6zm9-2a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-1a1 1 0 0 1-1-1V4z" />
    </svg>
  );
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
  const menuRef = useRef<HTMLDivElement>(null);

  useClickOutsideSingle(menuRef, () => setIsOpen(false));

  const OPTIONS: ModeOption[] = [
    {
      value: 'agent',
      labelKey: 'chat.sessionMode.agent',
      descKey: 'chat.sessionMode.agentDesc',
      color: SESSION_MODE_COLORS.agent,
      icon: <AgentIcon />,
    },
    {
      value: 'image',
      labelKey: 'chat.sessionMode.image',
      descKey: 'chat.sessionMode.imageDesc',
      color: SESSION_MODE_COLORS.image,
      icon: <ImageIcon />,
    },
    {
      value: 'video',
      labelKey: 'chat.sessionMode.video',
      descKey: 'chat.sessionMode.videoDesc',
      color: SESSION_MODE_COLORS.video,
      icon: <VideoIcon />,
    },
    {
      value: 'audio',
      labelKey: 'chat.sessionMode.audio',
      descKey: 'chat.sessionMode.audioDesc',
      color: SESSION_MODE_COLORS.audio,
      icon: <AudioIcon />,
    },
  ];

  const current = OPTIONS.find((o) => o.value === mode)!;

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-center w-7 h-7 hover:bg-[var(--vscode-toolbar-hoverBackground)] rounded-md transition-colors"
        style={{ color: current.color }}
        title={t(current.labelKey)}
      >
        {current.icon}
      </button>

      {isOpen && (
        <div className="absolute bottom-full left-0 mb-1 bg-[var(--vscode-dropdown-background)] border border-[var(--vscode-dropdown-border)] rounded-md shadow-lg w-[180px] py-1 z-50">
          {OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => {
                onChange(opt.value);
                setIsOpen(false);
              }}
              className={`w-full flex items-start gap-2.5 px-3 py-2 text-left hover:bg-[var(--vscode-list-hoverBackground)] transition-colors ${
                mode === opt.value ? 'bg-[var(--vscode-list-activeSelectionBackground,rgba(0,0,0,0.06))]' : ''
              }`}
            >
              {/* Colored icon */}
              <span className="mt-0.5 flex-shrink-0" style={{ color: opt.color }}>
                {opt.icon}
              </span>
              <span>
                <div
                  className="text-[11px] font-medium"
                  style={{ color: mode === opt.value ? opt.color : 'var(--vscode-foreground)' }}
                >
                  {t(opt.labelKey)}
                </div>
                <div className="text-[10px] text-[var(--vscode-descriptionForeground)]">
                  {t(opt.descKey)}
                </div>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

