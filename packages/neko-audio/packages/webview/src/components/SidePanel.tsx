/**
 * SidePanel - Right-side panel container for Effects / Recording / Export.
 *
 * Renders one panel at a time based on activeSidePanel state.
 */

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

export function SidePanel() {
  const { activeSidePanel, closeSidePanel, openSidePanel } = useAudioStore();
  const effectsChain = useEffectsChain();

  if (!activeSidePanel) return null;

  return (
    <>
      <div className="flex items-center gap-2 px-3 py-2 min-h-9 text-xs font-medium border-b border-[var(--editor-border)]">
        <span className="flex-1">{t(PANEL_TITLES[activeSidePanel])}</span>
        <AudioIconButton
          label={t('audio.common.close')}
          onClick={closeSidePanel}
          title={t('audio.common.close')}
        >
          <CloseIcon className="h-3 w-3" />
        </AudioIconButton>
      </div>

      <div className="audio-side-panel-tabs" role="tablist" aria-label={t('audio.sidePanel.tabs')}>
        {audioSidePanelItems.map((item) => (
          <button
            key={item.panel}
            type="button"
            role="tab"
            aria-selected={activeSidePanel === item.panel}
            className={activeSidePanel === item.panel ? 'active' : undefined}
            title={t(item.titleKey)}
            onClick={() => openSidePanel(item.panel)}
          >
            {item.icon}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {activeSidePanel === 'effects' && <EffectsPanel chain={effectsChain} />}
        {activeSidePanel === 'recording' && <RecordingPanel />}
        {activeSidePanel === 'export' && <ExportPanel />}
        {activeSidePanel === 'presets' && <PresetBrowser />}
      </div>
    </>
  );
}
