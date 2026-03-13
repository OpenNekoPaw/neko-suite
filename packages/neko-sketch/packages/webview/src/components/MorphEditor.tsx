/**
 * MorphEditor - morph target weight control
 *
 * Displays morph targets with weight sliders and animation preview.
 */
import { useState, useCallback, useEffect, useRef } from 'react';
import { t } from '../i18n';
import type { MorphTarget, MorphAnimation } from '../types/morph';
import { sampleAnimation } from '../engine/morph-engine';

interface MorphEditorProps {
  targets: readonly MorphTarget[];
  animation: MorphAnimation | null;
  onWeightChange: (targetId: string, weight: number) => void;
}

export function MorphEditor({ targets, animation, onWeightChange }: MorphEditorProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef(0);

  // Animation playback loop
  useEffect(() => {
    if (!isPlaying || !animation) return;

    lastTimeRef.current = performance.now();

    const tick = (now: number) => {
      const dt = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;

      setCurrentTime((prev) => {
        const next = prev + dt;
        if (!animation.loop && next >= animation.duration) {
          setIsPlaying(false);
          return animation.duration;
        }
        return next % animation.duration;
      });

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying, animation]);

  // Apply sampled weights during playback
  useEffect(() => {
    if (!animation || !isPlaying) return;
    const weights = sampleAnimation(animation, currentTime);
    for (const [id, w] of weights) {
      onWeightChange(id, w);
    }
  }, [currentTime, animation, isPlaying, onWeightChange]);

  const togglePlay = useCallback(() => {
    if (!animation) return;
    setIsPlaying((p) => !p);
    if (!isPlaying) setCurrentTime(0);
  }, [animation, isPlaying]);

  if (targets.length === 0) {
    return (
      <div className="sketch-panel" role="region" aria-label={t('sketch.panel.morph')}>
        <h3 className="sketch-panel-title m-0 mb-1">{t('sketch.panel.morph')}</h3>
        <p className="text-xs opacity-50 m-0">{t('sketch.morph.noTargets')}</p>
      </div>
    );
  }

  return (
    <div className="sketch-panel" role="region" aria-label={t('sketch.panel.morph')}>
      <div className="flex items-center gap-1 mb-1">
        <h3 className="sketch-panel-title m-0 flex-1">{t('sketch.panel.morph')}</h3>
        {animation && (
          <button
            className="text-xs px-1.5 py-0.5 rounded border border-[var(--vscode-button-border)]"
            onClick={togglePlay}
            aria-label={isPlaying ? t('sketch.morph.stop') : t('sketch.morph.play')}
          >
            {isPlaying ? '■' : '▶'}
          </button>
        )}
      </div>

      {targets.map((target) => (
        <div key={target.id} className="flex items-center gap-1 text-[10px] mb-0.5">
          <span className="w-16 opacity-60 truncate">{target.name}</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={target.weight}
            onChange={(e) => onWeightChange(target.id, parseFloat(e.target.value))}
            className="flex-1 h-3"
            disabled={isPlaying}
            aria-label={target.name}
          />
          <span className="w-8 text-right tabular-nums">{target.weight.toFixed(2)}</span>
        </div>
      ))}

      {animation && (
        <div className="text-[10px] opacity-50 mt-1">
          {isPlaying
            ? `${currentTime.toFixed(1)}s / ${animation.duration.toFixed(1)}s`
            : t('sketch.morph.stopped')}
        </div>
      )}
    </div>
  );
}
