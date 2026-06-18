import { useRef, useState, useCallback, useEffect } from 'react';
import {
  EngineAvStreamLifecycle,
  formatTime,
  type EngineAvAudioStreamClient,
} from '@neko/neko-client';
import { ProgressBar } from '@neko/ui/creative';
import { PlayIcon, PauseIcon, VolumeIcon, VolumeOffIcon } from '@neko/ui/icons';
import { getLogger } from '../../utils/logger';

const logger = getLogger('InlineAudioPlayer');

const BAR_COUNT = 24;
const DEFAULT_VOLUME = 0.8;

export interface InlineAudioPlayerProps {
  audioStreamUrl: string;
  duration: number;
  startTime?: number;
  onPause: (currentTime: number) => void;
  onResume: () => void;
  onSeek: (time: number) => void;
  onTimeUpdate?: (currentTime: number) => void;
  onStop: (currentTime: number) => void;
}

export function InlineAudioPlayer({
  audioStreamUrl,
  duration,
  startTime = 0,
  onPause,
  onResume,
  onSeek,
  onTimeUpdate,
  onStop,
}: InlineAudioPlayerProps) {
  const audioClientRef = useRef<EngineAvAudioStreamClient | null>(null);
  const lifecycleRef = useRef<EngineAvStreamLifecycle | null>(null);
  const animFrameRef = useRef<number>(0);
  const playStartTimeRef = useRef(startTime);
  const playWallTimeRef = useRef(0);
  const clockSourceRef = useRef<'wall' | 'audio'>('wall');
  const currentTimeRef = useRef(startTime);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(startTime);
  const [volume] = useState(DEFAULT_VOLUME);
  const [isMuted, setIsMuted] = useState(false);

  if (!lifecycleRef.current) {
    lifecycleRef.current = new EngineAvStreamLifecycle({
      callbacks: {
        onClientsChanged: ({ audioClient }) => {
          audioClientRef.current = audioClient;
        },
      },
    });
  }

  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  // =========================================================================
  // Playback loop
  // =========================================================================

  const updatePlaybackTime = useCallback(() => {
    const audioClient = audioClientRef.current;

    let newTime: number;
    if (audioClient?.isClockReady) {
      if (clockSourceRef.current === 'wall') {
        clockSourceRef.current = 'audio';
      }
      newTime = audioClient.getCurrentTime();
    } else {
      const elapsed = (performance.now() - playWallTimeRef.current) / 1000;
      newTime = playStartTimeRef.current + elapsed;
    }

    if (newTime >= duration) {
      setIsPlaying(false);
      setCurrentTime(duration);
      onStop(duration);
      return;
    }

    setCurrentTime(newTime);
    onTimeUpdate?.(newTime);
    animFrameRef.current = requestAnimationFrame(updatePlaybackTime);
  }, [duration, onStop, onTimeUpdate]);

  useEffect(() => {
    if (isPlaying) {
      animFrameRef.current = requestAnimationFrame(updatePlaybackTime);
    }
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying, updatePlaybackTime]);

  // =========================================================================
  // Connect stream on mount
  // =========================================================================

  useEffect(() => {
    void lifecycleRef.current
      ?.start({
        audio: {
          websocketUrl: audioStreamUrl,
          volume: DEFAULT_VOLUME,
          onError: (err) => logger.warn(`Audio error: ${err}`),
        },
      })
      .catch((err) => logger.warn(`Inline audio lifecycle error: ${err}`));

    setIsPlaying(true);
    setCurrentTime(startTime);
    playStartTimeRef.current = startTime;
    playWallTimeRef.current = performance.now();
    clockSourceRef.current = 'wall';

    return () => {
      audioClientRef.current?.setVolume(0);
      lifecycleRef.current?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- startTime is only used for initial value; including it would restart the stream on pause
  }, [audioStreamUrl]);

  // =========================================================================
  // Controls
  // =========================================================================

  const handleTogglePlay = useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (isPlaying) {
        setIsPlaying(false);
        audioClientRef.current?.pause();
        onPause(currentTimeRef.current);
      } else {
        setIsPlaying(true);
        audioClientRef.current?.resume();
        playStartTimeRef.current = currentTimeRef.current;
        playWallTimeRef.current = performance.now();
        clockSourceRef.current = 'wall';
        onResume();
      }
    },
    [isPlaying, onPause, onResume],
  );

  const handleSeekCommit = useCallback(
    (time: number) => {
      setCurrentTime(time);
      currentTimeRef.current = time;
      onTimeUpdate?.(time);
      playStartTimeRef.current = time;
      playWallTimeRef.current = performance.now();
      clockSourceRef.current = 'wall';
      audioClientRef.current?.resetClock();
      onSeek(time);
    },
    [onSeek, onTimeUpdate],
  );

  const handleSeeking = useCallback((time: number) => {
    setCurrentTime(time);
  }, []);

  const handleToggleMute = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const newMuted = !isMuted;
      setIsMuted(newMuted);
      audioClientRef.current?.setVolume(newMuted ? 0 : volume);
    },
    [isMuted, volume],
  );

  // =========================================================================
  // Render
  // =========================================================================

  const progress = duration > 0 ? currentTime / duration : 0;

  return (
    <div className="flex flex-col gap-2 p-3" onMouseDown={(e) => e.stopPropagation()}>
      {/* Waveform bars visualization */}
      <div className="flex h-12 items-end justify-center gap-[2px]">
        {Array.from({ length: BAR_COUNT }).map((_, index) => {
          const baseHeight = 20 + ((index * 17 + 7) % 60);
          return (
            <div
              key={index}
              className={`w-1.5 rounded-sm bg-[var(--node-selected)] ${isPlaying ? 'animate-audio-bar' : ''}`}
              style={{
                height: `${baseHeight}%`,
                opacity: progress > 0 && index / BAR_COUNT <= progress ? 0.9 : 0.3,
                animationDelay: isPlaying ? `${(index * 120) % 800}ms` : undefined,
              }}
            />
          );
        })}
      </div>

      {/* Progress bar */}
      <ProgressBar
        currentTime={currentTime}
        duration={duration}
        onSeekCommit={handleSeekCommit}
        onSeeking={handleSeeking}
        formatTooltip={formatTime}
      />

      {/* Controls row */}
      <div className="flex items-center gap-2">
        {/* Play/Pause */}
        <button
          type="button"
          className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[var(--node-selected)] text-white hover:opacity-90"
          onClick={handleTogglePlay}
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
        </button>

        {/* Time display */}
        <span className="min-w-[70px] text-center text-[11px] tabular-nums text-[var(--node-fg-secondary)]">
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>

        <div className="flex-1" />

        {/* Volume toggle */}
        <button
          type="button"
          className="flex h-5 w-5 items-center justify-center text-[var(--node-fg-secondary)] hover:text-[var(--node-fg)]"
          onClick={handleToggleMute}
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? <VolumeOffIcon size={14} /> : <VolumeIcon size={14} />}
        </button>
      </div>

      {/* CSS animation for waveform bars */}
      <style>{`
        @keyframes audio-bar-pulse {
          0%, 100% { transform: scaleY(1); }
          50% { transform: scaleY(0.4); }
        }
        .animate-audio-bar {
          animation: audio-bar-pulse 0.8s ease-in-out infinite;
          transform-origin: bottom;
        }
      `}</style>
    </div>
  );
}
