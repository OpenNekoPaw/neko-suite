/**
 * Toolbar - Left-side vertical toolbar for the audio editor.
 *
 * Provides quick access to panel toggles and action commands.
 * Uses shared VerticalToolbar + ToolbarButton from @neko/shared/components.
 */

import { useCallback } from 'react';
import { VerticalToolbar, ToolbarButton, ToolbarSeparator } from '@neko/shared/components';
import { useAudioStore } from '../stores/audioStore';
import type { SidePanelType } from '../stores/audioStore';
import { postMessage } from '../shared/useVscodeMessage';
import { t } from '../i18n';

// SVG icons — macOS SF Symbols stroke style, 20×20 viewBox
function IconSpectrum() {
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
      <rect
        x="2"
        y="12"
        width="2.5"
        height="6"
        rx="1"
        fill="currentColor"
        stroke="none"
        opacity="0.9"
      />
      <rect
        x="6"
        y="7"
        width="2.5"
        height="11"
        rx="1"
        fill="currentColor"
        stroke="none"
        opacity="0.9"
      />
      <rect
        x="10"
        y="4"
        width="2.5"
        height="14"
        rx="1"
        fill="currentColor"
        stroke="none"
        opacity="0.9"
      />
      <rect
        x="14"
        y="9"
        width="2.5"
        height="9"
        rx="1"
        fill="currentColor"
        stroke="none"
        opacity="0.9"
      />
    </svg>
  );
}

function IconEffects() {
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

function IconRecording() {
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

function IconExport() {
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

function IconPresets() {
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

export function Toolbar() {
  const { showSpectrum, activeSidePanel, toggleSpectrum, toggleSidePanel } = useAudioStore();

  const handleTogglePanel = useCallback(
    (panel: SidePanelType) => () => toggleSidePanel(panel),
    [toggleSidePanel],
  );

  const handleAnalyzeLoudness = useCallback(() => {
    postMessage({ type: 'audio:analyze', kind: 'loudness' });
  }, []);
  const handleDetectSilence = useCallback(() => {
    postMessage({ type: 'audio:analyze', kind: 'silence' });
  }, []);
  const handleDenoise = useCallback(() => {
    postMessage({
      type: 'audio:effects',
      effects: [
        {
          id: crypto.randomUUID(),
          effectType: 'noise-gate',
          enabled: true,
          params: { threshold: -40, attack: 1, hold: 50, release: 100 },
        },
      ],
    });
  }, []);
  const handleNormalize = useCallback(() => {
    // TODO(P1): Replace this placeholder gain effect with Extension-side loudness analysis.
    postMessage({
      type: 'audio:effects',
      effects: [
        {
          id: crypto.randomUUID(),
          effectType: 'gain',
          enabled: true,
          params: { gainDb: 0 },
        },
      ],
    });
  }, []);

  return (
    <VerticalToolbar>
      {/* View toggles */}
      <ToolbarButton
        icon={<IconSpectrum />}
        title={t('audio.spectrum.toggle')}
        active={showSpectrum}
        onClick={toggleSpectrum}
      />

      <ToolbarSeparator />

      {/* Panel toggles */}
      <ToolbarButton
        icon={<IconEffects />}
        title={t('audio.effects.title')}
        active={activeSidePanel === 'effects'}
        onClick={handleTogglePanel('effects')}
      />
      <ToolbarButton
        icon={<IconRecording />}
        title={t('audio.recording.title')}
        active={activeSidePanel === 'recording'}
        onClick={handleTogglePanel('recording')}
      />
      <ToolbarButton
        icon={<IconExport />}
        title={t('audio.export.toggle')}
        active={activeSidePanel === 'export'}
        onClick={handleTogglePanel('export')}
      />
      <ToolbarButton
        icon={<IconPresets />}
        title={t('audio.presets.title')}
        active={activeSidePanel === 'presets'}
        onClick={handleTogglePanel('presets')}
      />

      <ToolbarSeparator />

      {/* Actions */}
      <ToolbarButton
        icon={<IconLoudness />}
        title={t('audio.analysis.loudness')}
        onClick={handleAnalyzeLoudness}
      />
      <ToolbarButton
        icon={<IconSilence />}
        title={t('audio.analysis.silence')}
        onClick={handleDetectSilence}
      />
      <ToolbarButton
        icon={<IconDenoise />}
        title={t('audio.analysis.denoise')}
        onClick={handleDenoise}
      />
      <ToolbarButton
        icon={<IconNormalize />}
        title={t('audio.analysis.normalize')}
        onClick={handleNormalize}
      />
    </VerticalToolbar>
  );
}
