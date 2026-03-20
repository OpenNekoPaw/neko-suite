/**
 * ViewTabs - View mode switcher for audio player
 *
 * Displays cover/lyrics/waveform/spectrum tab icons below the visual area.
 */

import { useTranslation } from '../i18n/I18nContext';
import { MacTabs, type MacTab } from '../shared/MacTabs';
import type { ViewMode } from './AudioControls';

interface ViewTabsProps {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}

export function ViewTabs({ viewMode, onViewModeChange }: ViewTabsProps) {
  const { t } = useTranslation();

  const tabs: MacTab[] = [
    {
      id: 'cover',
      title: t('preview.audio.viewCover'),
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-5.5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z" />
        </svg>
      ),
    },
    {
      id: 'lyrics',
      title: t('preview.audio.viewLyrics'),
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55C7.79 13 6 14.79 6 17s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
        </svg>
      ),
    },
    {
      id: 'waveform',
      title: t('preview.audio.viewWaveform'),
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M7 18h2V6H7v12zm4 4h2V2h-2v20zm-8-8h2v-4H3v4zm12-6v8h2V8h-2zm4 2v4h2v-4h-2z" />
        </svg>
      ),
    },
    {
      id: 'spectrum',
      title: t('preview.audio.viewSpectrum'),
      icon: (
        <svg viewBox="0 0 24 24" fill="currentColor">
          <path d="M3 17h2v-7H3v7zm4 2h2V5H7v14zm4 0h2V8h-2v11zm4-14v16h2V5h-2zm4 4v8h2V9h-2z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="shrink-0 pt-3 pb-1">
      <MacTabs
        tabs={tabs}
        activeTab={viewMode}
        onChange={(id) => onViewModeChange(id as ViewMode)}
      />
    </div>
  );
}
