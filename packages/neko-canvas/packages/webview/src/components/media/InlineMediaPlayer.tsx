/**
 * InlineMediaPlayer - Lightweight H.264+PCM stream player for canvas nodes
 *
 * Uses neko-client's H264StreamClient + AudioStreamClient + FrameScheduler
 * to play media streams from the shared neko-preview frame server.
 *
 * Audio is muted by default to avoid conflicts with neko-preview.
 */

import { useRef, useState, useCallback, useEffect } from 'react';
import {
  H264StreamClient,
  AudioStreamClient,
  FrameScheduler,
  formatTime,
} from '@neko/neko-client';

// =============================================================================
// Types
// =============================================================================

export interface InlineMediaPlayerProps {
  videoStreamUrl: string | null;
  audioStreamUrl: string | null;
  width: number;
  height: number;
  fps: number;
  duration: number;
  onStop: () => void;
}

// =============================================================================
// Component
// =============================================================================

export function InlineMediaPlayer({
  videoStreamUrl,
  audioStreamUrl,
  width,
  height,
  fps,
  duration,
  onStop,
}: InlineMediaPlayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const clientRef = useRef<H264StreamClient | null>(null);
  const audioClientRef = useRef<AudioStreamClient | null>(null);
  const schedulerRef = useRef<FrameScheduler | null>(null);
  const animFrameRef = useRef<number>(0);
  const playStartTimeRef = useRef(0);
  const playWallTimeRef = useRef(0);
  const clockSourceRef = useRef<'wall' | 'audio'>('wall');

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isMuted, setIsMuted] = useState(true);

  // =========================================================================
  // Frame rendering
  // =========================================================================

  const renderFrame = useCallback((frame: VideoFrame) => {
    const canvas = canvasRef.current;
    if (!canvas) { frame.close(); return; }
    const ctx = canvas.getContext('2d');
    if (!ctx) { frame.close(); return; }
    if (canvas.width !== frame.displayWidth || canvas.height !== frame.displayHeight) {
      canvas.width = frame.displayWidth;
      canvas.height = frame.displayHeight;
    }
    ctx.drawImage(frame, 0, 0, canvas.width, canvas.height);
    frame.close();
  }, []);

  const onFrame = useCallback((frame: VideoFrame) => {
    const scheduler = schedulerRef.current;
    if (scheduler) {
      scheduler.enqueue(frame);
    } else {
      renderFrame(frame);
    }
  }, [renderFrame]);

  // =========================================================================
  // Playback loop
  // =========================================================================

  const updatePlaybackTime = useCallback(() => {
    if (!isPlaying) return;

    let newTime: number;
    const audioClient = audioClientRef.current;

    if (audioClient && audioClient.isClockReady) {
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
      handleStop();
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
  }, [isPlaying, duration, renderFrame]);

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
        onError: (err) => console.error('[InlineMediaPlayer] H264 error:', err),
      });
      clientRef.current = client;
      client.connect();
    }

    if (audioStreamUrl) {
      const audioClient = new AudioStreamClient({
        websocketUrl: audioStreamUrl,
        volume: 0, // muted by default
        onError: (err) => console.warn('[InlineMediaPlayer] Audio error:', err),
      });
      audioClientRef.current = audioClient;
      audioClient.connect();
    }

    setIsPlaying(true);
    playStartTimeRef.current = 0;
    playWallTimeRef.current = performance.now();
    clockSourceRef.current = 'wall';

    return () => {
      schedulerRef.current?.dispose();
      clientRef.current?.dispose();
      const ac = audioClientRef.current;
      if (ac) { ac.setVolume(0); ac.dispose(); }
      schedulerRef.current = null;
      clientRef.current = null;
      audioClientRef.current = null;
    };
  }, [videoStreamUrl, audioStreamUrl, width, height, fps, onFrame]);

  // =========================================================================
  // Controls
  // =========================================================================

  const handleStop = useCallback(() => {
    setIsPlaying(false);
    schedulerRef.current?.flush();
    clientRef.current?.dispose();
    clientRef.current = null;
    const ac = audioClientRef.current;
    if (ac) { ac.setVolume(0); ac.dispose(); }
    audioClientRef.current = null;
    onStop();
  }, [onStop]);

  const handleToggleMute = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    audioClientRef.current?.setVolume(newMuted ? 0 : 0.8);
  }, [isMuted]);

  const handleStopClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    handleStop();
  }, [handleStop]);

  // =========================================================================
  // Render
  // =========================================================================

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex-1 relative bg-black overflow-hidden group">
      <canvas
        ref={canvasRef}
        className="w-full h-full object-contain"
        style={{ display: 'block' }}
      />

      {/* Progress bar (bottom 2px) */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-white/20">
        <div
          className="h-full bg-blue-500 transition-[width] duration-100"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Minimal controls overlay */}
      <div className="absolute bottom-1 left-1 right-1 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {/* Time */}
        <span className="text-[10px] text-white/80 tabular-nums">
          {formatTime(currentTime)}
        </span>
        <div className="flex-1" />
        {/* Mute toggle */}
        {audioStreamUrl && (
          <button
            className="p-0.5 text-[10px] text-white/80 hover:text-white"
            onClick={handleToggleMute}
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? '🔇' : '🔊'}
          </button>
        )}
        {/* Stop */}
        <button
          className="p-0.5 text-[10px] text-white/80 hover:text-white"
          onClick={handleStopClick}
          title="Stop"
        >
          ⏹
        </button>
      </div>
    </div>
  );
}
