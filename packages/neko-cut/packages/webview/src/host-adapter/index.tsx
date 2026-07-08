import { TimelineRuler } from '@neko/ui/creative';
import {
  CreativeHostAdapterFrame,
  CreativeLeftRail,
  type CreativeHostAdapterSurfaceProps,
} from '@neko/ui/workbench';
import type { ReactElement, ReactNode } from 'react';
import { setLocale, t } from '../i18n';
import './style.css';

export function CutHostAdapterSurface({
  document,
  locale,
  onIntent,
  runtime,
}: CreativeHostAdapterSurfaceProps): ReactElement {
  setLocale(locale);

  return (
    <CreativeHostAdapterFrame
      className="cut-host-adapter"
      document={document}
      inspectorLabels={adapterInspectorLabels(runtime.label)}
      runtime={runtime}
      mainKind="preview-timeline"
      leftRail={
        <CreativeLeftRail
          label={t('preview.leftRail')}
          actions={[
            adapterAction('cut', t('timeline.contextMenu.cut'), 'CUT', () => onIntent('inspect')),
            adapterAction('play', t('timeline.controls.play'), 'PLY', () => onIntent('play')),
            adapterAction('pause', t('timeline.controls.pause'), 'PAU', () => onIntent('pause')),
          ]}
          bottomActions={[
            adapterAction('export', t('timeline.controls.export'), 'EXP', () =>
              onIntent('activate'),
            ),
          ]}
        />
      }
      main={
        <div className="cut-host-adapter__surface" data-creative-panel="cut-timeline">
          <div className="cut-host-adapter__preview" />
          <div className="cut-host-adapter__transport">
            <button type="button" title={t('timeline.controls.play')} onClick={() => onIntent('play')}>
              {iconGlyph('PLY')}
            </button>
            <span>00:00.00 / 02:23.04</span>
          </div>
        </div>
      }
      bottomPanel={<CutTimelineProjection name={document.name} />}
    />
  );
}

function CutTimelineProjection({ name }: { readonly name: string }): ReactElement {
  return (
    <div className="cut-host-adapter__tracks">
      <TimelineRuler duration={143} pixelsPerSecond={18} height={28} onSeek={() => undefined} />
      <div className="cut-host-adapter__track cut-host-adapter__track--video">V1 {name}</div>
      <div className="cut-host-adapter__track cut-host-adapter__track--audio">A1 {name}</div>
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
  return <span className="cut-host-adapter__icon">{label}</span>;
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
