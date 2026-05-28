/**
 * Toolbar surfaces for the audio editor.
 *
 * The left rail owns audio commands and region visibility.
 */

import { RightPanelIcon, RightPanelOffIcon } from '@neko/ui/icons';
import { ToolbarButton, ToolbarSeparator, ToolbarSpacer } from '@neko/ui/primitives';
import { CreativeLeftRail } from '@neko/ui/workbench';
import { useAudioStore } from '../stores/audioStore';
import { postMessage } from '../shared/useVscodeMessage';
import { t } from '../i18n';

interface ToolbarProps {
  readonly className?: string;
  readonly sidePanelVisible: boolean;
  readonly onToggleSidePanel: () => void;
}

export function Toolbar({ className, sidePanelVisible, onToggleSidePanel }: ToolbarProps) {
  const showSpectrum = useAudioStore((s) => s.showSpectrum);
  const toggleSpectrum = useAudioStore((s) => s.toggleSpectrum);

  const applyEffect = (effectType: 'noise-gate' | 'gain', params: Record<string, number>) => {
    postMessage({
      type: 'audio:effects',
      effects: [
        {
          id: crypto.randomUUID(),
          effectType,
          enabled: true,
          params,
        },
      ],
    });
  };

  return (
    <CreativeLeftRail
      className={className ?? 'audio-left-toolbar'}
      width={48}
      label={t('audio.toolbar.leftRail')}
    >
      <ToolbarButton
        data-creative-left-rail-action="analyze-loudness"
        data-creative-left-rail-kind="common-action"
        data-audio-toolbar-action="analyze-loudness"
        icon={<IconLoudness />}
        title={t('audio.analysis.loudness')}
        onClick={() => postMessage({ type: 'audio:analyze', kind: 'loudness' })}
      />
      <ToolbarButton
        data-creative-left-rail-action="detect-silence"
        data-creative-left-rail-kind="common-action"
        data-audio-toolbar-action="detect-silence"
        icon={<IconSilence />}
        title={t('audio.analysis.silence')}
        onClick={() => postMessage({ type: 'audio:analyze', kind: 'silence' })}
      />
      <ToolbarButton
        data-creative-left-rail-action="denoise"
        data-creative-left-rail-kind="common-action"
        data-audio-toolbar-action="denoise"
        icon={<IconDenoise />}
        title={t('audio.analysis.denoise')}
        onClick={() =>
          applyEffect('noise-gate', { threshold: -40, attack: 1, hold: 50, release: 100 })
        }
      />
      <ToolbarButton
        data-creative-left-rail-action="normalize"
        data-creative-left-rail-kind="common-action"
        data-audio-toolbar-action="normalize"
        icon={<IconNormalize />}
        title={t('audio.analysis.normalize')}
        onClick={() => applyEffect('gain', { gainDb: 0 })}
      />
      <ToolbarButton
        data-creative-left-rail-action="toggle-spectrum"
        data-creative-left-rail-kind="common-action"
        data-audio-toolbar-action="toggle-spectrum"
        icon={<IconSpectrum />}
        title={t('audio.spectrum.toggle')}
        active={showSpectrum}
        onClick={toggleSpectrum}
      />

      <ToolbarSpacer />
      <ToolbarSeparator />

      <ToolbarButton
        aria-controls="audio-side-panel"
        aria-expanded={sidePanelVisible}
        data-creative-left-rail-action="toggle-side-panel"
        data-creative-left-rail-kind="visibility-toggle"
        data-creative-left-rail-target="right-panel"
        icon={sidePanelVisible ? <RightPanelIcon size={16} /> : <RightPanelOffIcon size={16} />}
        title={sidePanelVisible ? t('audio.sidePanel.hide') : t('audio.sidePanel.show')}
        active={sidePanelVisible}
        onClick={onToggleSidePanel}
      />
    </CreativeLeftRail>
  );
}

function IconSpectrum() {
  return (
    <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4">
      <rect x="2" y="12" width="2.5" height="6" rx="1" fill="currentColor" opacity="0.9" />
      <rect x="6" y="7" width="2.5" height="11" rx="1" fill="currentColor" opacity="0.9" />
      <rect x="10" y="4" width="2.5" height="14" rx="1" fill="currentColor" opacity="0.9" />
      <rect x="14" y="9" width="2.5" height="9" rx="1" fill="currentColor" opacity="0.9" />
    </svg>
  );
}

function IconLoudness() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      className="w-4 h-4"
    >
      <path d="M2 10 Q5 4, 10 10 Q15 16, 18 10" />
      <line x1="2" y1="14" x2="18" y2="14" strokeDasharray="2 2" opacity="0.5" />
    </svg>
  );
}

function IconSilence() {
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
      <path d="M3 10h14" />
      <line x1="3" y1="3" x2="17" y2="17" opacity="0.4" />
      <path d="M6 7v6M10 5v10M14 7v6" opacity="0.6" />
    </svg>
  );
}

function IconDenoise() {
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
      <path d="M4 10 Q6 6, 8 10 Q10 14, 12 10 Q14 6, 16 10" />
      <path d="M2 10h2M16 10h2" opacity="0.5" />
      <circle cx="15" cy="5" r="1.5" fill="currentColor" stroke="none" opacity="0.8" />
      <path d="M14 4l2-2" strokeWidth="1" />
    </svg>
  );
}

function IconNormalize() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      className="w-4 h-4"
    >
      <path d="M2 10 Q5 3, 10 10 Q15 17, 18 10" />
      <line x1="2" y1="10" x2="18" y2="10" strokeDasharray="1 3" opacity="0.45" />
      <line x1="10" y1="2" x2="10" y2="18" strokeDasharray="1 3" opacity="0.45" />
    </svg>
  );
}
