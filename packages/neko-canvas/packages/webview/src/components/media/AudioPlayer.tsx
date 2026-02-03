/**
 * AudioPlayer - 音频播放器组件
 * 支持播放/暂停、进度条、音量控制、波形显示
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import clsx from 'clsx';

// =============================================================================
// Types
// =============================================================================

export interface AudioPlayerProps {
  src: string;
  className?: string;
  autoPlay?: boolean;
  loop?: boolean;
  showWaveform?: boolean;
  onDurationChange?: (duration: number) => void;
  onTimeUpdate?: (currentTime: number) => void;
  onEnded?: () => void;
}

// =============================================================================
// Component
// =============================================================================

export function AudioPlayer({
  src,
  className,
  autoPlay = false,
  loop = false,
  showWaveform = true,
  onDurationChange,
  onTimeUpdate,
  onEnded,
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [waveformData, setWaveformData] = useState<number[]>([]);

  // 播放/暂停
  const togglePlay = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play().catch((err) => {
        console.error('Audio play error:', err);
        setError('无法播放音频');
      });
    }
  }, [isPlaying]);

  // 进度跳转
  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;

    const time = parseFloat(e.target.value);
    audio.currentTime = time;
    setCurrentTime(time);
  }, []);

  // 音量控制
  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;

    const vol = parseFloat(e.target.value);
    audio.volume = vol;
    setVolume(vol);
    setIsMuted(vol === 0);
  }, []);

  // 静音切换
  const toggleMute = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const audio = audioRef.current;
    if (!audio) return;

    if (isMuted) {
      audio.muted = false;
      audio.volume = volume || 0.5;
      setIsMuted(false);
      if (volume === 0) setVolume(0.5);
    } else {
      audio.muted = true;
      setIsMuted(true);
    }
  }, [isMuted, volume]);

  // 生成模拟波形数据
  const generateWaveform = useCallback(() => {
    const bars = 50;
    const data: number[] = [];
    for (let i = 0; i < bars; i++) {
      // 生成类似音频波形的随机数据
      const base = Math.sin(i * 0.3) * 0.3 + 0.5;
      const noise = Math.random() * 0.4;
      data.push(Math.min(1, Math.max(0.1, base + noise)));
    }
    setWaveformData(data);
  }, []);

  // 绘制波形
  const drawWaveform = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || waveformData.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height } = canvas;
    const barWidth = width / waveformData.length;
    const progress = duration > 0 ? currentTime / duration : 0;

    ctx.clearRect(0, 0, width, height);

    waveformData.forEach((value, index) => {
      const x = index * barWidth;
      const barHeight = value * height * 0.8;
      const y = (height - barHeight) / 2;

      // 已播放部分用亮色
      const isPlayed = index / waveformData.length < progress;
      ctx.fillStyle = isPlayed ? '#3b82f6' : '#4b5563';

      ctx.fillRect(x + 1, y, barWidth - 2, barHeight);
    });
  }, [waveformData, currentTime, duration]);

  // 音频事件处理
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);
    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      onTimeUpdate?.(audio.currentTime);
    };
    const handleDurationChange = () => {
      setDuration(audio.duration);
      onDurationChange?.(audio.duration);
    };
    const handleLoadedData = () => {
      setIsLoading(false);
      generateWaveform();
    };
    const handleError = () => setError('音频加载失败');
    const handleEnded = () => {
      setIsPlaying(false);
      onEnded?.();
    };

    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('durationchange', handleDurationChange);
    audio.addEventListener('loadeddata', handleLoadedData);
    audio.addEventListener('error', handleError);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('durationchange', handleDurationChange);
      audio.removeEventListener('loadeddata', handleLoadedData);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [onDurationChange, onTimeUpdate, onEnded, generateWaveform]);

  // 绘制波形
  useEffect(() => {
    if (showWaveform) {
      drawWaveform();
    }
  }, [showWaveform, drawWaveform]);

  // 格式化时间
  const formatTime = (seconds: number): string => {
    if (!isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div
      className={clsx('flex flex-col bg-gray-900 rounded-lg p-3', className)}
      onClick={(e) => e.stopPropagation()}
    >
      {/* 隐藏的音频元素 */}
      <audio
        ref={audioRef}
        src={src}
        autoPlay={autoPlay}
        loop={loop}
        preload="metadata"
      />

      {/* 错误提示 */}
      {error && (
        <div className="flex items-center justify-center py-4 text-red-400 text-sm">
          {error}
        </div>
      )}

      {!error && (
        <>
          {/* 波形显示 */}
          {showWaveform && (
            <div className="mb-3">
              <canvas
                ref={canvasRef}
                width={300}
                height={60}
                className="w-full h-[60px] rounded"
              />
            </div>
          )}

          {/* 进度条 */}
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-gray-400 min-w-[40px]">
              {formatTime(currentTime)}
            </span>
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={currentTime}
              onChange={handleSeek}
              className="flex-1 h-1.5 bg-gray-700 rounded-full appearance-none cursor-pointer
                         [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
                         [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:cursor-pointer"
            />
            <span className="text-xs text-gray-400 min-w-[40px] text-right">
              {formatTime(duration)}
            </span>
          </div>

          {/* 控制按钮 */}
          <div className="flex items-center gap-2">
            {/* 播放/暂停 */}
            <button
              className={clsx(
                'w-10 h-10 rounded-full flex items-center justify-center transition-colors',
                isPlaying ? 'bg-blue-600 hover:bg-blue-700' : 'bg-gray-700 hover:bg-gray-600'
              )}
              onClick={togglePlay}
              disabled={isLoading}
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : isPlaying ? (
                <span className="text-lg">⏸</span>
              ) : (
                <span className="text-lg ml-0.5">▶</span>
              )}
            </button>

            <div className="flex-1" />

            {/* 音量控制 */}
            <button
              className="p-2 hover:bg-gray-700 rounded transition-colors text-gray-400"
              onClick={toggleMute}
            >
              {isMuted ? '🔇' : volume > 0.5 ? '🔊' : '🔉'}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.1}
              value={isMuted ? 0 : volume}
              onChange={handleVolumeChange}
              className="w-20 h-1 bg-gray-700 rounded-full appearance-none cursor-pointer
                         [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-2.5 [&::-webkit-slider-thumb]:h-2.5
                         [&::-webkit-slider-thumb]:bg-gray-400 [&::-webkit-slider-thumb]:rounded-full"
            />
          </div>
        </>
      )}
    </div>
  );
}
