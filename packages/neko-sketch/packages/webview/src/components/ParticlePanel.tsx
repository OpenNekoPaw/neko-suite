/**
 * ParticlePanel - particle emitter management UI
 *
 * Manages emitter configs with parameter editing and preview toggle.
 */
import { useCallback } from 'react';
import { useSketchStore } from '../stores';
import type { ParticleEmitterConfig, EmitterShape, ParticleBlendMode } from '../types/particle';

export function ParticlePanel() {
  const emitters = useSketchStore((s) => s.emitters);
  const isPreview = useSketchStore((s) => s.isParticlePreviewActive);
  const addEmitter = useSketchStore((s) => s.addEmitter);
  const removeEmitter = useSketchStore((s) => s.removeEmitter);
  const updateEmitter = useSketchStore((s) => s.updateEmitter);
  const togglePreview = useSketchStore((s) => s.toggleParticlePreview);

  const handleAdd = useCallback(() => addEmitter(), [addEmitter]);

  return (
    <div className="sketch-panel" role="region" aria-label="Particles">
      <div className="flex items-center gap-1 mb-1">
        <h3 className="sketch-panel-title m-0 flex-1">Particles</h3>
        <button
          className={`text-xs px-1.5 py-0.5 rounded border border-[var(--vscode-button-border)] ${
            isPreview
              ? 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]'
              : ''
          }`}
          onClick={togglePreview}
          title="Toggle particle preview"
          aria-label="Toggle particle preview"
          aria-pressed={isPreview}
        >
          {isPreview ? '■' : '▶'}
        </button>
        <button
          className="text-xs px-1.5 py-0.5 rounded border border-[var(--vscode-button-border)]"
          onClick={handleAdd}
          title="Add emitter"
          aria-label="Add emitter"
        >
          +
        </button>
      </div>

      {emitters.length === 0 && <p className="text-xs opacity-50 m-0">No emitters</p>}

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
  const id = emitter.id;

  return (
    <div className="mb-1 p-1 rounded border border-[var(--vscode-input-border)]">
      <div className="flex items-center gap-1 mb-0.5">
        <span className="text-xs flex-1 truncate">{emitter.name}</span>
        <button
          className="text-xs px-1 text-red-400"
          onClick={() => onRemove(id)}
          aria-label={`Remove ${emitter.name}`}
        >
          ✕
        </button>
      </div>

      {/* Shape selector */}
      <div className="flex items-center gap-1 text-[10px] mb-0.5">
        <span className="w-12 opacity-60">Shape</span>
        <select
          className="flex-1 text-[10px] bg-transparent border border-[var(--vscode-input-border)] rounded px-0.5"
          value={emitter.shape}
          onChange={(e) => onUpdate(id, { shape: e.target.value as EmitterShape })}
          aria-label="Emitter shape"
        >
          <option value="point">Point</option>
          <option value="line">Line</option>
          <option value="circle">Circle</option>
          <option value="rect">Rect</option>
        </select>
      </div>

      {/* Blend mode */}
      <div className="flex items-center gap-1 text-[10px] mb-0.5">
        <span className="w-12 opacity-60">Blend</span>
        <select
          className="flex-1 text-[10px] bg-transparent border border-[var(--vscode-input-border)] rounded px-0.5"
          value={emitter.blendMode}
          onChange={(e) => onUpdate(id, { blendMode: e.target.value as ParticleBlendMode })}
          aria-label="Blend mode"
        >
          <option value="additive">Additive</option>
          <option value="normal">Normal</option>
          <option value="multiply">Multiply</option>
        </select>
      </div>

      {/* Rate */}
      <RangeRow
        label="Rate"
        value={emitter.rate}
        min={1}
        max={500}
        step={1}
        onChange={(v) => onUpdate(id, { rate: v })}
      />

      {/* Speed */}
      <RangeRow
        label="Speed"
        value={emitter.speed[0]}
        min={0}
        max={500}
        step={5}
        onChange={(v) => onUpdate(id, { speed: [v, emitter.speed[1]] })}
      />

      {/* Size start */}
      <RangeRow
        label="Size"
        value={emitter.size[0]}
        min={0.5}
        max={64}
        step={0.5}
        onChange={(v) => onUpdate(id, { size: [v, emitter.size[1]] })}
      />

      {/* Direction */}
      <RangeRow
        label="Dir"
        value={+((emitter.direction * 180) / Math.PI).toFixed(0)}
        min={-180}
        max={180}
        step={1}
        onChange={(v) => onUpdate(id, { direction: (v * Math.PI) / 180 })}
      />

      {/* Spread */}
      <RangeRow
        label="Spread"
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
