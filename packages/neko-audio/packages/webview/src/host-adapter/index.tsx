import {
  CreativeHostAdapterFrame,
  CreativeLeftRail,
  type CreativeHostAdapterSurfaceProps,
} from '@neko/ui/workbench';
import type { ReactElement, ReactNode } from 'react';
import { setLocale, t } from '../i18n';
import './style.css';

export function AudioHostAdapterSurface({
  document,
  locale,
  onIntent,
  runtime,
}: CreativeHostAdapterSurfaceProps): ReactElement {
  setLocale(locale);

  return (
    <CreativeHostAdapterFrame
      className="audio-host-adapter"
      document={document}
      inspectorLabels={adapterInspectorLabels(runtime.label)}
      runtime={runtime}
      mainKind="waveform-timeline"
      leftRail={
        <CreativeLeftRail
          label={t('audio.toolbar.leftRail')}
          actions={[
            adapterAction('play', t('audio.controls.play'), 'PLY', () => onIntent('play')),
            adapterAction('pause', t('audio.controls.pause'), 'PAU', () => onIntent('pause')),
            adapterAction('import', t('audio.addSource.import'), 'IMP', () =>
              onIntent('activate'),
            ),
          ]}
          bottomActions={[
            adapterAction('side-panel', t('audio.sidePanel.show'), 'PAN', () =>
              onIntent('inspect'),
            ),
          ]}
        />
      }
      main={
        <div className="audio-host-adapter__surface" data-creative-panel="audio-timeline">
          <div className="audio-host-adapter__waveform">
            <span>{document.name}</span>
          </div>
          <div className="audio-host-adapter__mixer">{t('audio.mixer.master')} +0.0 dB</div>
        </div>
      }
    />
  );
}

function adapterAction(id: string, label: string, icon: string, onClick: () => void) {
  return {
    id,
    kind: 'common-action' as const,
    label,
    icon: iconGlyph(icon),
    onClick,
  };
}

function iconGlyph(label: string): ReactNode {
  return <span className="audio-host-adapter__icon">{label}</span>;
}

function adapterInspectorLabels(runtimeLabel: string) {
  return {
    dock: t('audio.hostAdapter.dock', { label: runtimeLabel }),
    packageName: t('audio.hostAdapter.package'),
    panel: t('audio.hostAdapter.panel'),
    runtime: t('audio.hostAdapter.runtime'),
    file: t('audio.hostAdapter.file'),
  };
}
