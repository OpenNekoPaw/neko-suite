/**
 * Toolbar - Left-side vertical toolbar for the audio editor.
 *
 * Provides quick access to panel toggles and action commands.
 * Layout pattern follows neko-canvas CanvasToolbar (48px, vertical).
 */

import { useCallback } from 'react';
import { useAudioStore } from '../stores/audioStore';
import type { SidePanelType } from '../stores/audioStore';
import { postMessage } from '../shared/useVscodeMessage';
import { t } from '../i18n';

interface ToolbarButtonProps {
  icon: string;
  title: string;
  active?: boolean;
  onClick: () => void;
}

function ToolbarButton({ icon, title, active, onClick }: ToolbarButtonProps) {
  return (
    <button
      className={`relative w-10 h-10 flex items-center justify-center rounded-lg transition-all duration-150
        ${active ? 'bg-neko-glass-active text-[var(--activity-fg)]' : 'text-[var(--activity-inactive)] hover:text-[var(--activity-fg)] hover:bg-neko-surface'}`}
      onClick={onClick}
      title={title}
    >
      {active && <span className="neko-toolbar-indicator" />}
      <span className="text-base">{icon}</span>
    </button>
  );
}

function ToolbarDivider() {
  return <div className="w-6 h-px mx-auto my-1 bg-[var(--editor-border)] opacity-50" />;
}

export function Toolbar() {
  const { showSpectrum, activeSidePanel, toggleSpectrum, toggleSidePanel } = useAudioStore();

  const handleTogglePanel = useCallback(
    (panel: SidePanelType) => () => toggleSidePanel(panel),
    [toggleSidePanel],
  );

  const handleAnalyzeLoudness = useCallback(() => {
    postMessage({ type: 'editor:analyzeLoudness' });
  }, []);

  const handleDetectSilence = useCallback(() => {
    postMessage({ type: 'editor:detectSilence' });
  }, []);

  const handleDenoise = useCallback(() => {
    postMessage({ type: 'editor:denoise' });
  }, []);

  const handleNormalize = useCallback(() => {
    postMessage({ type: 'editor:normalize' });
  }, []);

  return (
    <div className="flex flex-col items-center w-12 shrink-0 py-2 gap-0.5 bg-[var(--activity-bg)] border-r border-[var(--editor-border)]">
      {/* View toggles */}
      <ToolbarButton
        icon="📊"
        title={t('audio.spectrum.toggle')}
        active={showSpectrum}
        onClick={toggleSpectrum}
      />

      <ToolbarDivider />

      {/* Panel toggles */}
      <ToolbarButton
        icon="🎛"
        title={t('audio.effects.title')}
        active={activeSidePanel === 'effects'}
        onClick={handleTogglePanel('effects')}
      />
      <ToolbarButton
        icon="🎙"
        title={t('audio.recording.title')}
        active={activeSidePanel === 'recording'}
        onClick={handleTogglePanel('recording')}
      />
      <ToolbarButton
        icon="💾"
        title={t('audio.export.toggle')}
        active={activeSidePanel === 'export'}
        onClick={handleTogglePanel('export')}
      />

      <ToolbarDivider />

      {/* Actions */}
      <ToolbarButton
        icon="📏"
        title={t('audio.analysis.loudness')}
        onClick={handleAnalyzeLoudness}
      />
      <ToolbarButton icon="🔇" title={t('audio.analysis.silence')} onClick={handleDetectSilence} />
      <ToolbarButton icon="🧹" title={t('audio.analysis.denoise')} onClick={handleDenoise} />
      <ToolbarButton icon="📐" title={t('audio.analysis.normalize')} onClick={handleNormalize} />
    </div>
  );
}
