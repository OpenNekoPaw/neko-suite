import type React from 'react';
import type { SidePanelType } from '../stores/audioStore';

export interface AudioSidePanelItem {
  readonly panel: SidePanelType;
  readonly icon: React.ReactNode;
  readonly titleKey: string;
}

export const audioSidePanelItems: readonly AudioSidePanelItem[] = [
  {
    panel: 'effects',
    icon: <IconEffects />,
    titleKey: 'audio.effects.title',
  },
  {
    panel: 'recording',
    icon: <IconRecording />,
    titleKey: 'audio.recording.title',
  },
  {
    panel: 'export',
    icon: <IconExport />,
    titleKey: 'audio.export.toggle',
  },
  {
    panel: 'presets',
    icon: <IconPresets />,
    titleKey: 'audio.presets.title',
  },
];

function IconEffects(): React.ReactElement {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      className="w-4 h-4"
    >
      <line x1="3" y1="5" x2="17" y2="5" />
      <circle cx="8" cy="5" r="2" fill="currentColor" stroke="none" />
      <line x1="3" y1="10" x2="17" y2="10" />
      <circle cx="13" cy="10" r="2" fill="currentColor" stroke="none" />
      <line x1="3" y1="15" x2="17" y2="15" />
      <circle cx="7" cy="15" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconRecording(): React.ReactElement {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-4 h-4"
    >
      <rect x="6" y="2" width="8" height="11" rx="4" />
      <path d="M3 10.5c0 3.866 3.134 7 7 7s7-3.134 7-7" />
      <line x1="10" y1="17.5" x2="10" y2="19.5" />
    </svg>
  );
}

function IconExport(): React.ReactElement {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-4 h-4"
    >
      <path d="M10 3v10M6 9l4 4 4-4" />
      <path d="M4 15h12v2H4z" fill="currentColor" stroke="none" opacity="0.8" />
    </svg>
  );
}

function IconPresets(): React.ReactElement {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="w-4 h-4"
    >
      <rect x="3" y="3" width="14" height="4" rx="1" />
      <rect x="3" y="8.5" width="14" height="4" rx="1" />
      <rect x="3" y="14" width="14" height="4" rx="1" opacity="0.5" />
      <circle cx="7" cy="5" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="10.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="9" cy="16" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
