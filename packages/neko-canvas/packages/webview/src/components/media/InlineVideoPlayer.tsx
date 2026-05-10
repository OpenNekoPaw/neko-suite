import { useRef, useState, useCallback, useEffect } from 'react';
import { H264StreamClient, AudioStreamClient, FrameScheduler, formatTime } from '@neko/neko-client';
import { ProgressBar } from '@neko/shared/components';
import { PlayIcon, PauseIcon, VolumeIcon, VolumeOffIcon } from '@neko/shared/icons';
import { getLogger } from '../../utils/logger';

const logger = getLogger('InlineVideoPlayer');

const DEFAULT_VOLUME = 0.8;

export interface InlineVideoPlayerProps {
  videoStreamUrl: string | null;
  audioStreamUrl: string | null;
  width: number;
  height: number;
  fps: number;
  duration: number;
  startTime?: number;
  onPause: (currentTime: number) => void;
  onResume: () => void;
  onSeek: (time: number) => void;
  onStop: (currentTime: number) => void;
}

export function InlineVideoPlayer({
  videoStreamUrl,
  audioStreamUrl,
  width,
  height,
  fps,
  duration,
  startTime = 0,
  onPause,
  onResume,
  onSeek,
  onStop,
}: InlineVideoPlayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const clientRef = useRef<H264StreamClient | null>(null);
  const audioClientRef = useRef<AudioStreamClient | null>(null);
  const schedulerRef = useRef<FrameScheduler | null>(null);
  const animFrameRef = useRef<number>(0);
  const playStartTimeRef = useRef(startTime);
  const playWallTimeRef = useRef(0);
  const clockSourceRef = useRef<'wall' | 'audio'>('wall');
  const currentTimeRef = useRef(startTime);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(startTime);
  const [isMuted, setIsMuted] = useState(false);

  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  // =========================================================================
  // Frame rendering
  // =========================================================================

  const renderFrame = useCallback((frame: VideoFrame) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      frame.close();
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      frame.close();
      return;
    }
    if (canvas.width !== frame.displayWidth || canvas.height !== frame.displayHeight) {
      canvas.width = frame.displayWidth;
      canvas.height = frame.displayHeight;
    }
    ctx.drawImage(frame, 0, 0, canvas.width, canvas.height);
    frame.close();
  }, []);

  const onFrame = useCallback(
    (frame: VideoFrame) => {
      const scheduler = schedulerRef.current;
      if (scheduler) {
        scheduler.enqueue(frame);
      } else {
        renderFrame(frame);
      }
    },
    [renderFrame],
  );

  // =========================================================================
  // Playback loop
  // =========================================================================

  const updatePlaybackTime = useCallback(() => {
    let newTime: number;
    const audioClient = audioClientRef.current;

    if (audioClient?.isClockReady) {
      if (clockSourceRef.current === 'wall') {
        clockSourceRef.current = 'audio';
        schedulerRef.current?.flush();
      }
      newTime = audioClient.getCurrentTime();
    } else {
      const h264Stats = clientRef.current?.getStats();
      if (!h264Stats || h264Stats.framesDecoded === 0) {
        playWallTimeRef.current = performance.now();
        newTime = playStartTimeRef.current;
      } else {
        const elapsed = (performance.now() - playWallTimeRef.current) / 1000;
        newTime = playStartTimeRef.current + elapsed;
      }
    }

    if (newTime >= duration) {
      setIsPlaying(false);
      setCurrentTime(duration);
      schedulerRef.current?.flush();
      onStop(duration);
      return;
    }

    const scheduler = schedulerRef.current;
    if (scheduler) {
      const masterClockUs = newTime * 1_000_000;
      const result = scheduler.schedule(masterClockUs);
      if (result.action === 'render' && result.frame) {
        renderFrame(result.frame);
      }
    }

    setCurrentTime(newTime);
    animFrameRef.current = requestAnimationFrame(updatePlaybackTime);
  }, [duration, renderFrame, onStop]);

  useEffect(() => {
    if (isPlaying) {
      animFrameRef.current = requestAnimationFrame(updatePlaybackTime);
    }
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying, updatePlaybackTime]);

  // =========================================================================
  // Connect streams on mount
  // =========================================================================

  useEffect(() => {
    schedulerRef.current = new FrameScheduler(fps);

    if (videoStreamUrl) {
      const client = new H264StreamClient({
        websocketUrl: videoStreamUrl,
        width,
        height,
        onFrame,
        onError: (err) => logger.error(`H264 error: ${err}`),
      });
      clientRef.current = client;
      client.connect();
    }

    if (audioStreamUrl) {
      const audioClient = new AudioStreamClient({
        websocketUrl: audioStreamUrl,
        volume: DEFAULT_VOLUME,
        onError: (err) => logger.warn(`Audio error: ${err}`),
      });
      audioClientRef.current = audioClient;
      audioClient.connect();
    }

    setIsPlaying(true);
    setCurrentTime(startTime);
    playStartTimeRef.current = startTime;
    playWallTimeRef.current = performance.now();
    clockSourceRef.current = 'wall';

    return () => {
      schedulerRef.current?.dispose();
      clientRef.current?.dispose();
      const ac = audioClientRef.current;
      if (ac) {
        ac.setVolume(0);
        ac.dispose();
      }
      schedulerRef.current = null;
      clientRef.current = null;
      audioClientRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- startTime is only used for initial value; including it would restart streams on pause
  }, [videoStreamUrl, audioStreamUrl, width, height, fps, onFrame]);

  // =========================================================================
  // Controls
  // =========================================================================

  const handleTogglePlay = useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation();
      if (isPlaying) {
        setIsPlaying(false);
        schedulerRef.current?.flush();
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
      playStartTimeRef.current = time;
      playWallTimeRef.current = performance.now();
      clockSourceRef.current = 'wall';
      schedulerRef.current?.flush();
      audioClientRef.current?.resetClock();
      onSeek(time);
    },
    [onSeek],
  );

  const handleSeeking = useCallback((time: number) => {
    setCurrentTime(time);
  }, []);

  const handleToggleMute = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const newMuted = !isMuted;
      setIsMuted(newMuted);
      audioClientRef.current?.setVolume(newMuted ? 0 : DEFAULT_VOLUME);
    },
    [isMuted],
  );

  // =========================================================================
  // Render
  // =========================================================================

  return (
    <div className="relative flex-1 bg-black overflow-hidden group">
      <canvas
        ref={canvasRef}
        className="w-full h-full object-contain"
        style={{ display: 'block' }}
      />

      {/* Controls overlay — gradient background */}
      <div
        className="absolute bottom-0 left-0 right-0 flex flex-col gap-1 px-2 pb-2 pt-6 opacity-0 group-hover:opacity-100 transition-opacity"
        style={{
          background: 'linear-gradient(transparent 0%, rgba(0,0,0,0.7) 100%)',
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Progress bar */}
        <ProgressBar
          currentTime={currentTime}
          duration={duration}
          onSeekCommit={handleSeekCommit}
          onSeeking={handleSeeking}
          variant="video"
          formatTooltip={formatTime}
        />

        {/* Button row */}
        <div className="flex items-center gap-1.5">
          {/* Play/Pause */}
          <button
            type="button"
            className="flex h-6 w-6 items-center justify-center rounded text-white/85 hover:text-white"
            onClick={handleTogglePlay}
            title={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
          </button>

          {/* Time display */}
          <span className="text-[10px] tabular-nums text-white/80 whitespace-nowrap">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          <div className="flex-1" />

          {/* Mute toggle */}
          {audioStreamUrl && (
            <button
              type="button"
              className="flex h-5 w-5 items-center justify-center text-white/80 hover:text-white"
              onClick={handleToggleMute}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <VolumeOffIcon size={12} /> : <VolumeIcon size={12} />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
