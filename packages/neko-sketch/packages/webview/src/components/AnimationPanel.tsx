/**
 * AnimationPanel - animation clip list + playback controls for puppet animation
 *
 * Shows available animation clips from the loaded Inochi2D puppet and provides
 * play/stop/seek controls. Connects to the engine backend via IInochi2DController.
 */
import { useCallback } from 'react';
import { useSketchStore } from '../stores';
import { useTranslation } from '../i18n/I18nContext';
import type { AnimationClipInfo } from '../animation/types';

interface AnimationPanelProps {
  /** Called when the user requests to play a clip */
  onPlay: (name: string, loop: boolean) => void;
  /** Called when the user requests to stop playback */
  onStop: () => void;
  /** Called when the user seeks via the time slider (timeMs) */
  onSeek: (timeMs: number) => void;
}

export function AnimationPanel({ onPlay, onStop, onSeek }: AnimationPanelProps) {
  const { t } = useTranslation();
  const show = useSketchStore((s) => s.showLayerPanel); // reuse panel visibility flag
  const puppetLoaded = useSketchStore((s) => s.puppetLoaded);
  const animations = useSketchStore((s) => s.animations);
  const currentAnimation = useSketchStore((s) => s.currentAnimation);
  const playState = useSketchStore((s) => s.playState);
  const streamConnected = useSketchStore((s) => s.streamConnected);
  const animationTimeMs = useSketchStore((s) => s.animationTimeMs);

  const isPlaying = playState === 'playing';

  // Compute seek slider value from stream-driven animation time
  const currentClip = animations.find((c) => c.name === currentAnimation);
  const seekPercent =
    currentClip && currentClip.duration_ms > 0
      ? Math.min(100, (animationTimeMs / currentClip.duration_ms) * 100)
      : 0;

  const handleClipClick = useCallback(
    (clip: AnimationClipInfo) => {
      if (isPlaying && currentAnimation === clip.name) {
        onStop();
      } else {
        onPlay(clip.name, clip.loop_default);
      }
    },
    [isPlaying, currentAnimation, onPlay, onStop],
  );

  const handleSeek = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const clip = animations.find((c) => c.name === currentAnimation);
      if (!clip) return;
      const timeMs = (parseFloat(e.target.value) / 100) * clip.duration_ms;
      onSeek(timeMs);
    },
    [animations, currentAnimation, onSeek],
  );

  if (!show || !puppetLoaded) return null;

  return (
    <div className="sketch-panel" role="region" aria-label={t('sketch.panel.animation')}>
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <h3 className="sketch-panel-title m-0">{t('sketch.panel.animation')}</h3>
        <div className="flex items-center gap-1">
          <PhysicsToggle />
          {streamConnected && (
            <span
              title={t('sketch.animation.liveStream')}
              className="w-2 h-2 rounded-full bg-green-500 inline-block"
              aria-label={t('sketch.animation.liveStream')}
            />
          )}
        </div>
      </div>

      {/* Clip list */}
      {animations.length === 0 ? (
        <p className="text-xs opacity-50 px-1">{t('sketch.animation.noClips')}</p>
      ) : (
        <div className="flex flex-col gap-0.5 mb-2">
          {animations.map((clip) => (
            <ClipItem
              key={clip.name}
              clip={clip}
              isActive={clip.name === currentAnimation}
              isPlaying={isPlaying && clip.name === currentAnimation}
              onClick={() => handleClipClick(clip)}
            />
          ))}
        </div>
      )}

      {/* Playback controls — visible only when a clip is selected */}
      {currentAnimation && (
        <div className="flex flex-col gap-1 px-1">
          <div className="flex items-center gap-1">
            <button
              className="text-xs px-2 py-0.5 rounded border border-[var(--vscode-button-border)]"
              onClick={isPlaying ? onStop : () => onPlay(currentAnimation, false)}
              aria-label={isPlaying ? t('sketch.animation.stop') : t('sketch.animation.play')}
            >
              {isPlaying ? '■' : '▶'}
            </button>

            <span className="text-xs opacity-60 truncate flex-1">{currentAnimation}</span>
          </div>

          {/* Seek slider — controlled by stream-driven animationTimeMs */}
          <input
            type="range"
            min={0}
            max={100}
            step={0.1}
            value={seekPercent}
            className="w-full h-1 accent-[var(--vscode-button-background)]"
            aria-label={t('sketch.animation.seek')}
            onChange={handleSeek}
          />
        </div>
      )}
    </div>
  );
}

function PhysicsToggle() {
  const { t } = useTranslation();
  const isPlaying = useSketchStore((s) => s.isPlayingPhysics);
  const setPlaying = useSketchStore((s) => s.setPlayingPhysics);

  return (
    <button
      className={`text-[10px] px-1.5 py-0.5 rounded border border-[var(--vscode-button-border)] ${
        isPlaying
          ? 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)]'
          : ''
      }`}
      onClick={() => setPlaying(!isPlaying)}
      title={isPlaying ? t('sketch.animation.disablePhysics') : t('sketch.animation.enablePhysics')}
      aria-label={
        isPlaying ? t('sketch.animation.disablePhysicsSim') : t('sketch.animation.enablePhysicsSim')
      }
      aria-pressed={isPlaying}
    >
      ⚡
    </button>
  );
}

function ClipItem(props: {
  clip: AnimationClipInfo;
  isActive: boolean;
  isPlaying: boolean;
  onClick: () => void;
}) {
  const { clip, isActive, isPlaying, onClick } = props;
  const durationSec = (clip.duration_ms / 1000).toFixed(1);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-selected={isActive}
      className={`flex items-center gap-1 px-1 py-0.5 text-xs rounded cursor-pointer ${
        isActive ? 'bg-[var(--vscode-list-activeSelectionBackground)]' : ''
      }`}
      onClick={onClick}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
    >
      <span className="w-3 text-center opacity-70" aria-hidden>
        {isPlaying ? '▶' : clip.loop_default ? '↻' : '→'}
      </span>
      <span className="flex-1 truncate">{clip.name}</span>
      <span className="opacity-50 shrink-0">{durationSec}s</span>
    </div>
  );
}
