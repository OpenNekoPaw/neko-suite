/**
 * ParticlePanel - particle emitter management UI
 *
 * Manages emitter configs with parameter editing and preview toggle.
 */
import { useCallback } from 'react';
import { useSketchStore } from '../stores';
import { useTranslation } from '../i18n/I18nContext';
import type { ParticleEmitterConfig, EmitterShape, ParticleBlendMode } from '../types/particle';

export function ParticlePanel() {
  const { t } = useTranslation();
  const emitters = useSketchStore((s) => s.emitters);
  const isPreview = useSketchStore((s) => s.isParticlePreviewActive);
  const addEmitter = useSketchStore((s) => s.addEmitter);
  const removeEmitter = useSketchStore((s) => s.removeEmitter);
  const updateEmitter = useSketchStore((s) => s.updateEmitter);
  const togglePreview = useSketchStore((s) => s.toggleParticlePreview);

  const handleAdd = useCallback(() => addEmitter(), [addEmitter]);

  return (
    <div className="sketch-panel" role="region" aria-label={t('sketch.panel.particles')}>
      <div className="flex items-center gap-1 mb-1">
        <h3 className="sketch-panel-title m-0 flex-1">{t('sketch.panel.particles')}</h3>
        <button
          className={`text-xs px-1.5 py-0.5 rounded border border-[var(--vscode-button-border)] ${
            isPreview
              ? 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]'
              : ''
          }`}
          onClick={togglePreview}
          title={t('sketch.particle.togglePreview')}
          aria-label={t('sketch.particle.togglePreview')}
          aria-pressed={isPreview}
        >
          {isPreview ? '■' : '▶'}
        </button>
        <button
          className="text-xs px-1.5 py-0.5 rounded border border-[var(--vscode-button-border)]"
          onClick={handleAdd}
          title={t('sketch.particle.addEmitter')}
          aria-label={t('sketch.particle.addEmitter')}
        >
          +
        </button>
      </div>

      {emitters.length === 0 && (
        <p className="text-xs opacity-50 m-0">{t('sketch.particle.noEmitters')}</p>
      )}

      {emitters.map((em) => (
        <EmitterItem key={em.id} emitter={em} onUpdate={updateEmitter} onRemove={removeEmitter} />
      ))}
    </div>
  );
}

interface EmitterItemProps {
  emitter: ParticleEmitterConfig;
  onUpdate: (id: string, updates: Partial<ParticleEmitterConfig>) => void;
  onRemove: (id: string) => void;
}

function EmitterItem({ emitter, onUpdate, onRemove }: EmitterItemProps) {
  const { t } = useTranslation();
  const id = emitter.id;

  return (
    <div className="mb-1 p-1 rounded border border-[var(--vscode-input-border)]">
      <div className="flex items-center gap-1 mb-0.5">
        <span className="text-xs flex-1 truncate">{emitter.name}</span>
        <button
          className="text-xs px-1 text-red-400"
          onClick={() => onRemove(id)}
          aria-label={t('sketch.particle.remove', { name: emitter.name })}
        >
          ✕
        </button>
      </div>

      {/* Shape selector */}
      <div className="flex items-center gap-1 text-[10px] mb-0.5">
        <span className="w-12 opacity-60">{t('sketch.particle.shape')}</span>
        <select
          className="flex-1 text-[10px] bg-transparent border border-[var(--vscode-input-border)] rounded px-0.5"
          value={emitter.shape}
          onChange={(e) => onUpdate(id, { shape: e.target.value as EmitterShape })}
          aria-label={t('sketch.particle.shapeLabel')}
        >
          <option value="point">{t('sketch.particle.shape.point')}</option>
          <option value="line">{t('sketch.particle.shape.line')}</option>
          <option value="circle">{t('sketch.particle.shape.circle')}</option>
          <option value="rect">{t('sketch.particle.shape.rect')}</option>
        </select>
      </div>

      {/* Blend mode */}
      <div className="flex items-center gap-1 text-[10px] mb-0.5">
        <span className="w-12 opacity-60">{t('sketch.particle.blend')}</span>
        <select
          className="flex-1 text-[10px] bg-transparent border border-[var(--vscode-input-border)] rounded px-0.5"
          value={emitter.blendMode}
          onChange={(e) => onUpdate(id, { blendMode: e.target.value as ParticleBlendMode })}
          aria-label={t('sketch.particle.blendLabel')}
        >
          <option value="additive">{t('sketch.particle.blend.additive')}</option>
          <option value="normal">{t('sketch.particle.blend.normal')}</option>
          <option value="multiply">{t('sketch.particle.blend.multiply')}</option>
        </select>
      </div>

      {/* Rate */}
      <RangeRow
        label={t('sketch.particle.rate')}
        value={emitter.rate}
        min={1}
        max={500}
        step={1}
        onChange={(v) => onUpdate(id, { rate: v })}
      />
      {/* Speed */}
      <RangeRow
        label={t('sketch.particle.speed')}
        value={emitter.speed[0]}
        min={0}
        max={500}
        step={5}
        onChange={(v) => onUpdate(id, { speed: [v, emitter.speed[1]] })}
      />
      {/* Size */}
      <RangeRow
        label={t('sketch.particle.size')}
        value={emitter.size[0]}
        min={0.5}
        max={64}
        step={0.5}
        onChange={(v) => onUpdate(id, { size: [v, emitter.size[1]] })}
      />
      {/* Direction */}
      <RangeRow
        label={t('sketch.particle.direction')}
        value={+((emitter.direction * 180) / Math.PI).toFixed(0)}
        min={-180}
        max={180}
        step={1}
        onChange={(v) => onUpdate(id, { direction: (v * Math.PI) / 180 })}
      />
      {/* Spread */}
      <RangeRow
        label={t('sketch.particle.spread')}
        value={+((emitter.spread * 180) / Math.PI).toFixed(0)}
        min={0}
        max={360}
        step={1}
        onChange={(v) => onUpdate(id, { spread: (v * Math.PI) / 180 })}
      />
    </div>
  );
}

interface RangeRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}

function RangeRow({ label, value, min, max, step, onChange }: RangeRowProps) {
  return (
    <div className="flex items-center gap-1 text-[10px]">
      <span className="w-12 opacity-60 truncate">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 h-3"
        aria-label={label}
      />
      <span className="w-8 text-right tabular-nums">{value}</span>
    </div>
  );
}
