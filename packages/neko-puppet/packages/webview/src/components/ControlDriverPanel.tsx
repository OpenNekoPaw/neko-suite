/**
 * ControlDriverPanel - read-only inspector for native puppet driver curves.
 *
 * The engine remains the authority for driver evaluation; this panel only
 * visualizes native .nkp driver contracts so authors can inspect generated rigs.
 */
import { useMemo } from 'react';
import type {
  NkpControlDriver,
  NkpControlSource,
  NkpControlTarget,
  NkpDriverCurve,
} from '@neko/shared';
import { useTranslation } from '../i18n/I18nContext';
import { usePuppetStore } from '../stores/puppet-store';

const CURVE_SAMPLE_COUNT = 24;

export function ControlDriverPanel() {
  const { t } = useTranslation();
  const puppetLoaded = usePuppetStore((s) => s.puppetLoaded);
  const drivers = usePuppetStore((s) => s.nativeControlDrivers);
  const sortedDrivers = useMemo(
    () => [...drivers].sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id)),
    [drivers],
  );

  if (!puppetLoaded || sortedDrivers.length === 0) return null;

  return (
    <div className="sketch-panel" role="region" aria-label={t('puppet.panel.controlDrivers')}>
      <h3 className="sketch-panel-title m-0 mb-1">{t('puppet.panel.controlDrivers')}</h3>
      <div className="flex flex-col gap-2">
        {sortedDrivers.map((driver) => (
          <DriverCard key={driver.id} driver={driver} />
        ))}
      </div>
    </div>
  );
}

function DriverCard({ driver }: { driver: NkpControlDriver }) {
  const { t } = useTranslation();
  const source = formatSource(driver.source);
  const target = formatTarget(driver.target);

  return (
    <div className="control-driver-card" title={`${source} -> ${target}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-medium">{driver.id}</span>
        <span className="control-driver-badge">{driver.blendMode}</span>
      </div>
      <div className="mt-1 grid grid-cols-[1fr_auto_1fr] items-center gap-1 text-[10px] opacity-75">
        <span className="truncate">{source}</span>
        <span aria-hidden>-&gt;</span>
        <span className="truncate text-right">{target}</span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <CurvePreview curve={driver.curve} label={t('puppet.controlDriver.curvePreview')} />
        <div className="flex min-w-0 flex-col text-[10px] opacity-70">
          <span>{formatCurve(driver.curve)}</span>
          <span>
            {t('puppet.controlDriver.priority')}: {driver.priority}
          </span>
        </div>
      </div>
    </div>
  );
}

function CurvePreview({ curve, label }: { curve: NkpDriverCurve; label: string }) {
  const points = useMemo(() => buildCurvePolyline(curve), [curve]);

  return (
    <svg
      className="control-driver-curve"
      role="img"
      aria-label={label}
      viewBox="0 0 72 32"
      preserveAspectRatio="none"
    >
      <line className="control-driver-grid" x1="0" y1="24" x2="72" y2="24" />
      <line className="control-driver-grid" x1="0" y1="8" x2="72" y2="8" />
      <polyline className="control-driver-line" points={points} fill="none" />
    </svg>
  );
}

function buildCurvePolyline(curve: NkpDriverCurve): string {
  const samples: string[] = [];
  for (let index = 0; index <= CURVE_SAMPLE_COUNT; index += 1) {
    const x = index / CURVE_SAMPLE_COUNT;
    const y = clamp01(evaluatePreviewCurve(curve, x));
    samples.push(`${(x * 72).toFixed(2)},${((1 - y) * 28 + 2).toFixed(2)}`);
  }
  return samples.join(' ');
}

function evaluatePreviewCurve(curve: NkpDriverCurve, input: number): number {
  switch (curve.type) {
    case 'linear':
      return input * (curve.scale ?? 1) + (curve.offset ?? 0);
    case 'bezier': {
      const [, y1, , y2] = curve.points;
      const inv = 1 - input;
      return 3 * inv * inv * input * y1 + 3 * inv * input * input * y2 + input * input * input;
    }
    case 'step':
      return input >= 0.5 ? 1 : 0;
  }
}

function formatSource(source: NkpControlSource): string {
  switch (source.type) {
    case 'blendshape':
      return `BlendShape:${source.name}`;
    case 'expression':
      return `Expression:${source.preset}`;
    case 'tracking':
      return `Tracking:${source.name}`;
    case 'live2dParam':
      return `Live2D:${source.name}`;
  }
}

function formatTarget(target: NkpControlTarget): string {
  switch (target.type) {
    case 'boneRotation':
      return `Bone:${target.bone}.${target.axis}`;
    case 'bonePosition':
      return `Bone:${target.bone}.position`;
    case 'boneScale':
      return `Bone:${target.bone}.scale`;
    case 'blendshapeWeight':
      return `BlendShape:${target.name}`;
  }
}

function formatCurve(curve: NkpDriverCurve): string {
  switch (curve.type) {
    case 'linear': {
      const scale = curve.scale ?? 1;
      const offset = curve.offset ?? 0;
      return offset === 0 ? `linear x${scale}` : `linear x${scale} + ${offset}`;
    }
    case 'bezier':
      return `bezier(${curve.points.join(', ')})`;
    case 'step':
      return 'step';
  }
}

function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}
