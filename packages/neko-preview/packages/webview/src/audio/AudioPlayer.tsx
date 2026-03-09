/**
 * AudioPlayer - Main audio preview component
 *
 * Connects to neko-engine's PCM audio stream via WebSocket,
 * plays through Web Audio API (AudioStreamClient), and visualizes waveform.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { AudioStreamClient } from '@neko/neko-client';
import { useExtensionMessage, useVscodeReady } from '../shared/useVscodeMessage';
import { useTranslation } from '../i18n/I18nContext';
import { WaveformCanvas } from './WaveformCanvas';
import { AudioControls } from './AudioControls';
import type { MediaInfo, PreviewInitMessage, PreviewWaveformMessage } from '../shared/types';
import { getLogger } from '../utils/logger';

const logger = getLogger('AudioPlayer');

export function AudioPlayer() {
  const { t } = useTranslation();
  const { postMessage } = useVscodeReady();

  // State
  const [mediaInfo, setMediaInfo] = useState<MediaInfo | null>(null);
  const [waveformData, setWaveformData] = useState<{
    peaks: number[];
    duration: number;
  } | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(1.0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Refs
  const audioClientRef = useRef<AudioStreamClient | null>(null);
  const playStartTimeRef = useRef(0);
  const playWallTimeRef = useRef(0);
  const animFrameRef = useRef(0);
  const statusThrottleRef = useRef(0);

  // =========================================================================
  // Time tracking during playback
  // =========================================================================

  const updatePlaybackTime = useCallback(() => {
    if (!isPlaying || !mediaInfo) return;

    let newTime: number;
    const audioClient = audioClientRef.current;
    if (audioClient && audioClient.isClockReady) {
      newTime = audioClient.getCurrentTime();
    } else {
      const elapsed = (performance.now() - playWallTimeRef.current) / 1000;
      newTime = playStartTimeRef.current + elapsed;
    }

    if (newTime >= mediaInfo.duration) {
      setCurrentTime(mediaInfo.duration);
      setIsPlaying(false);
      // Fade out before disposing
      const client = audioClientRef.current;
      if (client) {
        client.fadeOut().then(() => {
          client.dispose();
        });
        audioClientRef.current = null;
      }
      postMessage({ type: 'preview:stop' });
      postMessage({
        type: 'preview:statusUpdate',
        playbackState: 'stopped',
        currentTime: mediaInfo.duration,
      });
      return;
    }

    setCurrentTime(newTime);

    // Throttle status updates to ~1/sec
    const now = performance.now();
    if (now - statusThrottleRef.current > 1000) {
      statusThrottleRef.current = now;
      postMessage({ type: 'preview:statusUpdate', playbackState: 'playing', currentTime: newTime });
    }

    animFrameRef.current = requestAnimationFrame(updatePlaybackTime);
  }, [isPlaying, mediaInfo, postMessage]);

  useEffect(() => {
    if (isPlaying) {
      animFrameRef.current = requestAnimationFrame(updatePlaybackTime);
    }
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [isPlaying, updatePlaybackTime]);

  // =========================================================================
  // Extension message handling
  // =========================================================================

  useExtensionMessage((msg) => {
    switch (msg.type) {
      case 'preview:init': {
        const { mediaInfo: info } = (msg as PreviewInitMessage).payload;
        setMediaInfo(info);
        setIsLoading(false);
        break;
      }

      case 'preview:waveform': {
        const waveform = (msg as PreviewWaveformMessage).payload;
        setWaveformData({
          peaks: waveform.peaks,
          duration: waveform.duration,
        });
        break;
      }

      case 'preview:streamReady': {
        const { audioStreamUrl } = msg.payload as {
          streamId: string;
          streamUrl: string;
          audioStreamId?: string;
          audioStreamUrl?: string;
        };

        // Dispose previous client
        audioClientRef.current?.dispose();

        const streamUrl = audioStreamUrl;
        if (streamUrl) {
          const audioClient = new AudioStreamClient({
            websocketUrl: streamUrl,
            volume,
            onConnectionChange: (connected) => {
              logger.info(`Stream connected: ${connected}`);
            },
            onError: (err) => {
              logger.warn('Stream error:', err);
            },
          });
          audioClientRef.current = audioClient;
          audioClient.connect();
        }
        break;
      }

      default:
        break;
    }
  });

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const ac = audioClientRef.current;
      if (ac) {
        ac.setVolume(0);
        ac.dispose();
      }
    };
  }, []);

  // =========================================================================
  // Playback controls
  // =========================================================================

  const handlePlay = useCallback(() => {
    if (!mediaInfo) return;

    const startTime = currentTime >= mediaInfo.duration ? 0 : currentTime;
    setCurrentTime(startTime);
    setIsPlaying(true);
    playStartTimeRef.current = startTime;
    playWallTimeRef.current = performance.now();

    postMessage({ type: 'preview:play', startTime });
    postMessage({ type: 'preview:statusUpdate', playbackState: 'playing', currentTime: startTime });
  }, [mediaInfo, currentTime, postMessage]);

  const handlePause = useCallback(() => {
    setIsPlaying(false);
    audioClientRef.current?.pause();
    postMessage({ type: 'preview:pause' });
    postMessage({ type: 'preview:statusUpdate', playbackState: 'paused', currentTime });
  }, [postMessage, currentTime]);

  const handleResume = useCallback(() => {
    setIsPlaying(true);
    playStartTimeRef.current = currentTime;
    playWallTimeRef.current = performance.now();
    audioClientRef.current?.resume();
    postMessage({ type: 'preview:resume' });
    postMessage({ type: 'preview:statusUpdate', playbackState: 'playing', currentTime });
  }, [currentTime, postMessage]);

  const handleTogglePlay = useCallback(() => {
    if (isPlaying) {
      handlePause();
    } else if (audioClientRef.current) {
      handleResume();
    } else {
      handlePlay();
    }
  }, [isPlaying, handlePlay, handlePause, handleResume]);

  /** Scrub: drag-preview only — updates UI time without backend seek */
  const handleScrub = useCallback((time: number) => {
    setCurrentTime(time);
  }, []);

  /** Seek: commits to backend on mouseup */
  const handleSeek = useCallback(
    (time: number) => {
      setCurrentTime(time);
      if (isPlaying) {
        playStartTimeRef.current = time;
        playWallTimeRef.current = performance.now();
      }
      // Reset audio clock so it re-syncs after seek
      audioClientRef.current?.resetClock();
      postMessage({ type: 'preview:seek', time });
    },
    [isPlaying, postMessage],
  );

  const handleVolumeChange = useCallback((newVolume: number) => {
    setVolume(newVolume);
    audioClientRef.current?.setVolume(newVolume);
  }, []);

  // =========================================================================
  // Render
  // =========================================================================

  if (isLoading) {
    return (
      <div className="loading">
        <div className="loading__spinner" />
        <span>{t('preview.audio.loading')}</span>
      </div>
    );
  }

  if (error) {
    return <div className="error">{t('preview.audio.error', { error })}</div>;
  }

  if (!mediaInfo) {
    return <div className="error">{t('preview.audio.noMediaInfo')}</div>;
  }

  // Extract filename from path
  const fileName = mediaInfo.format || t('preview.audio.defaultFilename');

  return (
    <div className="audio-player">
      {/* File info header */}
      <div className="audio-player__info">
        <div className="audio-player__icon">
          <svg viewBox="0 0 24 24">
            <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
          </svg>
        </div>
        <div className="audio-player__meta">
          <div className="audio-player__filename">{fileName}</div>
          <div className="audio-player__details">
            {mediaInfo.audioCodec?.toUpperCase() ?? t('preview.audio.unknownCodec')} •{' '}
            {mediaInfo.audioSampleRate
              ? `${(mediaInfo.audioSampleRate / 1000).toFixed(1)} kHz`
              : ''}{' '}
            •{' '}
            {mediaInfo.audioChannels === 1
              ? t('preview.audio.mono')
              : mediaInfo.audioChannels === 2
                ? t('preview.audio.stereo')
                : `${mediaInfo.audioChannels}ch`}
            {mediaInfo.bitrate ? ` • ${Math.round(mediaInfo.bitrate / 1000)} kbps` : ''}
          </div>
        </div>
      </div>

      {/* Waveform visualization */}
      <div className="audio-player__waveform-container">
        <WaveformCanvas
          peaks={waveformData?.peaks ?? null}
          duration={mediaInfo.duration}
          currentTime={currentTime}
          onSeek={handleSeek}
        />
      </div>

      {/* Controls */}
      <AudioControls
        isPlaying={isPlaying}
        currentTime={currentTime}
        duration={mediaInfo.duration}
        volume={volume}
        onTogglePlay={handleTogglePlay}
        onSeek={handleSeek}
        onScrub={handleScrub}
        onVolumeChange={handleVolumeChange}
      />
    </div>
  );
}
