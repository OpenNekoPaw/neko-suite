/**
 * AudioPlayer - Main audio preview component (modern layout)
 *
 * Connects to neko-engine's PCM audio stream via WebSocket,
 * plays through Web Audio API (AudioStreamClient), and provides
 * three switchable views: cover art, lyrics, waveform.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { AudioStreamClient } from '@neko/neko-client';
import { useExtensionMessage, useVscodeReady } from '../shared/useVscodeMessage';
import { useTranslation } from '../i18n/I18nContext';
import { CoverView } from './CoverView';
import { LyricsView } from './LyricsView';
import { WaveformCanvas } from './WaveformCanvas';
import { SpectrumCanvas } from './SpectrumCanvas';
import { AudioControls, type ViewMode } from './AudioControls';
import type {
  MediaInfo,
  PreviewInitMessage,
  PreviewLyricsMessage,
  PreviewStreamReadyMessage,
  PreviewStreamReconnectMessage,
  PreviewWaveformMessage,
} from '../shared/types';
import { getLogger } from '../utils/logger';
import { parseLrc, type LrcLine } from './lrc-parser';

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
  const [speed, setSpeed] = useState(1.0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('cover');
  const [fileName, setFileName] = useState('');
  const [lyrics, setLyrics] = useState<LrcLine[]>([]);

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
      const client = audioClientRef.current;
      if (client) {
        client.pause();
      }
      postMessage({ type: 'preview:eof' });
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
      postMessage({
        type: 'preview:statusUpdate',
        playbackState: 'playing',
        currentTime: newTime,
      });
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

  // Cleanup on unmount — dispose audio client
  useEffect(() => {
    return () => {
      const client = audioClientRef.current;
      if (client) {
        client.dispose();
        audioClientRef.current = null;
      }
    };
  }, []);

  // =========================================================================
  // Extension message handlers
  // =========================================================================

  useExtensionMessage((msg) => {
    switch (msg.type) {
      case 'preview:init': {
        const initMsg = msg as PreviewInitMessage;
        setMediaInfo(initMsg.payload.mediaInfo);
        const path = initMsg.payload.filePath;
        setFileName(
          path
            .split('/')
            .pop()
            ?.replace(/\.[^.]+$/, '') ?? t('preview.audio.defaultFilename'),
        );
        setIsLoading(false);
        logger.info('Media info received', initMsg.payload.mediaInfo);
        break;
      }
      case 'preview:waveform': {
        const waveMsg = msg as PreviewWaveformMessage;
        setWaveformData({ peaks: waveMsg.payload.peaks, duration: waveMsg.payload.duration });
        break;
      }
      case 'preview:streamReady': {
        const streamMsg = msg as PreviewStreamReadyMessage;
        const wsUrl = streamMsg.payload.audioStreamUrl ?? streamMsg.payload.streamUrl;
        logger.info('Audio stream ready', wsUrl);
        // Dispose previous client if any (e.g. stream recreation)
        const prev = audioClientRef.current;
        if (prev) {
          prev.dispose();
        }
        const client = new AudioStreamClient({ websocketUrl: wsUrl, volume });
        audioClientRef.current = client;
        client.connect().catch((err) => {
          logger.error('AudioStreamClient connect failed', err);
        });
        break;
      }
      case 'preview:streamReconnect': {
        // EOF closed the WebSocket — reconnect to the same streamId
        const reconnectMsg = msg as PreviewStreamReconnectMessage;
        const wsUrl = reconnectMsg.payload.audioStreamUrl;
        if (!wsUrl) break;
        logger.info('Audio stream reconnect', wsUrl);
        const prev = audioClientRef.current;
        if (prev) {
          prev.dispose();
        }
        const client = new AudioStreamClient({ websocketUrl: wsUrl, volume });
        audioClientRef.current = client;
        client.connect().catch((err) => {
          logger.error('AudioStreamClient reconnect failed', err);
        });
        break;
      }
      case 'preview:lyrics': {
        const lyricsMsg = msg as PreviewLyricsMessage;
        const result = parseLrc(lyricsMsg.payload.lrcContent);
        if (result.lines.length > 0) {
          setLyrics(result.lines);
          setViewMode('lyrics');
        }
        break;
      }
    }
  });

  // =========================================================================
  // Playback controls
  // =========================================================================

  const handleTogglePlay = useCallback(() => {
    if (isPlaying) {
      // Pause — keep client alive
      postMessage({ type: 'preview:pause' });
      setIsPlaying(false);
      const client = audioClientRef.current;
      if (client) {
        client.pause();
      }
    } else {
      // Resume — reuse existing client
      const client = audioClientRef.current;
      if (client) {
        client.resume();
      }
      postMessage({ type: 'preview:play', startTime: currentTime });
      playStartTimeRef.current = currentTime;
      playWallTimeRef.current = performance.now();
      setIsPlaying(true);
    }
  }, [isPlaying, currentTime, postMessage]);

  const handleSeek = useCallback(
    (time: number) => {
      setCurrentTime(time);
      playStartTimeRef.current = time;
      playWallTimeRef.current = performance.now();
      // Reset audio clock so post-seek packets re-establish timing
      const client = audioClientRef.current;
      if (client) {
        client.resetClock();
      }
      postMessage({ type: 'preview:seek', time });
    },
    [postMessage],
  );

  const handleScrub = useCallback((time: number) => {
    setCurrentTime(time);
  }, []);

  const handleVolumeChange = useCallback((v: number) => {
    setVolume(v);
    const client = audioClientRef.current;
    if (client) {
      client.setVolume(v);
    }
  }, []);

  const handleSpeedChange = useCallback(
    (s: number) => {
      setSpeed(s);
      postMessage({ type: 'preview:speed', speed: s });
    },
    [postMessage],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      const client = audioClientRef.current;
      if (client) {
        client.dispose();
        audioClientRef.current = null;
      }
    };
  }, []);

  // =========================================================================
  // Derived values
  // =========================================================================

  const subtitle = mediaInfo
    ? [
        mediaInfo.audioCodec?.toUpperCase(),
        mediaInfo.audioSampleRate ? `${(mediaInfo.audioSampleRate / 1000).toFixed(1)} kHz` : null,
        mediaInfo.audioChannels === 1
          ? t('preview.audio.mono')
          : mediaInfo.audioChannels === 2
            ? t('preview.audio.stereo')
            : mediaInfo.audioChannels
              ? `${mediaInfo.audioChannels}ch`
              : null,
        mediaInfo.bitrate ? `${Math.round(mediaInfo.bitrate / 1000)} kbps` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : '';

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

  // Build cover art data URI from engine metadata
  const coverUri = mediaInfo?.coverArt
    ? `data:${mediaInfo.coverArt.mimeType};base64,${mediaInfo.coverArt.dataBase64}`
    : undefined;

  // Use metadata title if available, otherwise filename
  const displayName = mediaInfo?.metadata?.title || fileName;

  return (
    <div className="audio-player">
      {/* Main visual area — switchable views */}
      <div className="audio-player__visual">
        <div className="audio-player__visual-content">
          {/* Cover */}
          <div
            className={`audio-player__view ${viewMode === 'cover' ? 'audio-player__view--active' : ''}`}
          >
            <CoverView fileName={fileName} isPlaying={isPlaying} coverUri={coverUri} />
          </div>

          {/* Lyrics */}
          <div
            className={`audio-player__view ${viewMode === 'lyrics' ? 'audio-player__view--active' : ''}`}
          >
            <LyricsView lyrics={lyrics} currentTime={currentTime} />
          </div>

          {/* Waveform */}
          <div
            className={`audio-player__view ${viewMode === 'waveform' ? 'audio-player__view--active' : ''}`}
          >
            <div className="audio-player__waveform-container">
              <WaveformCanvas
                peaks={waveformData?.peaks ?? null}
                duration={mediaInfo.duration}
                currentTime={currentTime}
                onSeekCommit={handleSeek}
                onSeeking={handleScrub}
              />
            </div>
          </div>

          {/* Spectrum */}
          <div
            className={`audio-player__view ${viewMode === 'spectrum' ? 'audio-player__view--active' : ''}`}
          >
            <SpectrumCanvas audioClient={audioClientRef.current} isPlaying={isPlaying} />
          </div>
        </div>
      </div>

      {/* Metadata */}
      <div className="audio-player__info">
        <div className="audio-player__title">{displayName}</div>
        {mediaInfo?.metadata?.artist && (
          <div className="audio-player__subtitle">{mediaInfo.metadata.artist}</div>
        )}
        {subtitle && !mediaInfo?.metadata?.artist && (
          <div className="audio-player__subtitle">{subtitle}</div>
        )}
      </div>

      {/* Controls */}
      <AudioControls
        isPlaying={isPlaying}
        currentTime={currentTime}
        duration={mediaInfo.duration}
        volume={volume}
        speed={speed}
        viewMode={viewMode}
        onTogglePlay={handleTogglePlay}
        onSeek={handleSeek}
        onScrub={handleScrub}
        onVolumeChange={handleVolumeChange}
        onSpeedChange={handleSpeedChange}
        onViewModeChange={setViewMode}
      />
    </div>
  );
}
