import { TimelineRuler } from '@neko/ui/creative';
import {
  CreativeHostAdapterFrame,
  CreativeLeftRail,
  type CreativeHostAdapterSurfaceProps,
} from '@neko/ui/workbench';
import type { ReactElement, ReactNode } from 'react';
import { setLocale, t } from '../i18n';
import './style.css';

export function ModelHostAdapterSurface({
  document,
  locale,
  onIntent,
  runtime,
}: CreativeHostAdapterSurfaceProps): ReactElement {
  setLocale(locale);

  return (
    <CreativeHostAdapterFrame
      className="model-host-adapter"
      document={document}
      inspectorLabels={adapterInspectorLabels(runtime.label)}
      runtime={runtime}
      mainKind="viewport-timeline"
      leftRail={
        <CreativeLeftRail
          label={t('toolbar.modelLeftRail')}
          actions={[
            adapterAction('orbit', t('hostAdapter.orbit'), 'ORB', () => onIntent('focus')),
            adapterAction('scene', t('sceneTree.title'), 'SCN', () => onIntent('inspect')),
            adapterAction('play', t('characterPreview.play'), 'PLY', () => onIntent('play')),
          ]}
          bottomActions={[
            adapterAction('settings', t('hostAdapter.settings'), 'SET', () =>
              onIntent('inspect'),
            ),
          ]}
        />
      }
      main={
        <div className="model-host-adapter__surface" data-creative-panel="model-viewport">
          <div className="model-host-adapter__viewport">
            <div className="model-host-adapter__proxy">3D</div>
            <p>{document.name}</p>
          </div>
        </div>
      }
      bottomPanel={<ModelTimelineProjection name={document.name} />}
    />
  );
}

function ModelTimelineProjection({ name }: { readonly name: string }): ReactElement {
  return (
    <div className="model-host-adapter__tracks">
      <TimelineRuler duration={96} pixelsPerSecond={18} height={28} onSeek={() => undefined} />
      <div className="model-host-adapter__track">{t('hostAdapter.sceneTrack', { name })}</div>
    </div>
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
  return <span className="model-host-adapter__icon">{label}</span>;
}

function adapterInspectorLabels(runtimeLabel: string) {
  return {
    dock: t('hostAdapter.dock', { label: runtimeLabel }),
    packageName: t('hostAdapter.package'),
    panel: t('hostAdapter.panel'),
    runtime: t('hostAdapter.runtime'),
    file: t('hostAdapter.file'),
  };
}
