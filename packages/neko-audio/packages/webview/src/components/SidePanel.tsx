/**
 * SidePanel - Right-side panel container for Effects / Recording / Export.
 *
 * Renders one panel at a time based on activeSidePanel state.
 */

import { useEffect, useMemo } from 'react';
import { CloseIcon } from '@neko/ui/icons';
import { useAudioStore } from '../stores/audioStore';
import type { SidePanelType } from '../stores/audioStore';
import { EffectsPanel } from './EffectsPanel';
import { RecordingPanel } from './RecordingPanel';
import { ExportPanel } from './ExportPanel';
import { PresetBrowser } from './PresetBrowser';
import { audioSidePanelItems } from './audioSidePanelItems';
import { useEffectsChain } from '../hooks/useEffectsChain';
import { AudioIconButton } from './shared/AudioUiPrimitives';
import { t } from '../i18n';

const PANEL_TITLES: Record<SidePanelType, string> = {
  effects: 'audio.effects.title',
  recording: 'audio.recording.title',
  export: 'audio.export.title',
  presets: 'audio.presets.title',
};

type AudioRightDockMode = 'basic' | 'professional';

interface SidePanelProps {
  readonly mode: AudioRightDockMode;
}

const BASIC_SIDE_PANEL_TYPES = new Set<SidePanelType>(['recording', 'export', 'presets']);

export function SidePanel({ mode }: SidePanelProps) {
  const { activeSidePanel, closeSidePanel, openSidePanel } = useAudioStore();
  const effectsChain = useEffectsChain();
  const visibleItems = useMemo(
    () =>
      mode === 'professional'
        ? audioSidePanelItems
        : audioSidePanelItems.filter((item) => BASIC_SIDE_PANEL_TYPES.has(item.panel)),
    [mode],
  );
  const fallbackPanel = visibleItems[0]?.panel ?? null;
  const effectiveActiveSidePanel =
    activeSidePanel && visibleItems.some((item) => item.panel === activeSidePanel)
      ? activeSidePanel
      : fallbackPanel;

  useEffect(() => {
    if (!activeSidePanel) return;
    if (visibleItems.some((item) => item.panel === activeSidePanel)) return;

    if (fallbackPanel) {
      openSidePanel(fallbackPanel);
    } else {
      closeSidePanel();
    }
  }, [activeSidePanel, closeSidePanel, fallbackPanel, openSidePanel, visibleItems]);

  if (!activeSidePanel || !effectiveActiveSidePanel) return null;

  return (
    <>
      <div className="flex items-center gap-2 px-3 py-2 min-h-9 text-xs font-medium border-b border-[var(--editor-border)]">
        <span className="flex-1">{t(PANEL_TITLES[effectiveActiveSidePanel])}</span>
        <AudioIconButton
          label={t('audio.common.close')}
          onClick={closeSidePanel}
          title={t('audio.common.close')}
        >
          <CloseIcon className="h-3 w-3" />
        </AudioIconButton>
      </div>

      <div className="audio-side-panel-tabs" role="tablist" aria-label={t('audio.sidePanel.tabs')}>
        {visibleItems.map((item) => (
          <button
            key={item.panel}
            type="button"
            role="tab"
            aria-selected={effectiveActiveSidePanel === item.panel}
            className={effectiveActiveSidePanel === item.panel ? 'active' : undefined}
            title={t(item.titleKey)}
            onClick={() => openSidePanel(item.panel)}
          >
            {item.icon}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {effectiveActiveSidePanel === 'effects' && <EffectsPanel chain={effectsChain} />}
        {effectiveActiveSidePanel === 'recording' && <RecordingPanel />}
        {effectiveActiveSidePanel === 'export' && <ExportPanel />}
        {effectiveActiveSidePanel === 'presets' && <PresetBrowser />}
      </div>
    </>
  );
}
