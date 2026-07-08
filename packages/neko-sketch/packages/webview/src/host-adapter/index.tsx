import {
  CreativeHostAdapterFrame,
  CreativeLeftRail,
  type CreativeHostAdapterSurfaceProps,
} from '@neko/ui/workbench';
import type { ReactElement, ReactNode } from 'react';
import { setLocale, t } from '../i18n';
import './style.css';

export function SketchHostAdapterSurface({
  document,
  locale,
  onIntent,
  runtime,
}: CreativeHostAdapterSurfaceProps): ReactElement {
  setLocale(locale);

  return (
    <CreativeHostAdapterFrame
      className="sketch-host-adapter"
      document={document}
      inspectorLabels={adapterInspectorLabels(runtime.label)}
      runtime={runtime}
      mainKind="drawing-canvas"
      leftRail={
        <CreativeLeftRail
          label={t('sketch.toolbar.ariaLabel')}
          actions={[
            adapterAction('brush', t('sketch.toolbar.brush'), 'BRU', () => onIntent('focus')),
            adapterAction('layers', t('sketch.panel.layers'), 'LYR', () =>
              onIntent('inspect'),
            ),
          ]}
          bottomActions={[
            adapterAction('settings', t('sketch.hostAdapter.settings'), 'SET', () =>
              onIntent('inspect'),
            ),
          ]}
        />
      }
      main={
        <div className="sketch-host-adapter__surface" data-creative-panel="sketch-editor">
          <span>{document.name}</span>
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
  return <span className="sketch-host-adapter__icon">{label}</span>;
}

function adapterInspectorLabels(runtimeLabel: string) {
  return {
    dock: t('sketch.hostAdapter.dock', { label: runtimeLabel }),
    packageName: t('sketch.hostAdapter.package'),
    panel: t('sketch.hostAdapter.panel'),
    runtime: t('sketch.hostAdapter.runtime'),
    file: t('sketch.hostAdapter.file'),
  };
}
