/**
 * AudioPlayerControls - Playback controls for audio diff viewer.
 * Extracted from AudioDiffViewer.tsx.
 */

import { memo, useRef, useState, useCallback, useEffect } from 'react';
import { AudioStreamClient } from '@neko/neko-client';
import { ConsoleLogger, LogLevel } from '@neko/shared';
import { useTranslation } from '../../../i18n/I18nContext';
import type { AudioStreamConfig } from '@neko/shared';
import { formatTime } from './audioUtils';

const logger = new ConsoleLogger('AudioPlayerControls', LogLevel.Info);

interface AudioPlayerControlsProps {
  audioStreamConfig: AudioStreamConfig | null;
  currentTime: number;
  duration: number;
  playingVersion: 'current' | 'previous' | 'both';
  onPlayingVersionChange: (version: 'current' | 'previous' | 'both') => void;
  onTimeChange: (time: number) => void;
  onAudioStreamControl?: (action: 'play' | 'pause' | 'seek', payload?: { time?: number }) => void;
  /** Disable Play while git show is extracting the previous version */
  isFetchingPrevious?: boolean;
}

export const AudioPlayerControls = memo(function AudioPlayerControls({
  audioStreamConfig,
  currentTime,
  duration,
  playingVersion,
  onPlayingVersionChange,
  onTimeChange,
  onAudioStreamControl,
  isFetchingPrevious,
}: AudioPlayerControlsProps) {
  const { t } = useTranslation();
  const currentClientRef = useRef<AudioStreamClient | null>(null);
  const previousClientRef = useRef<AudioStreamClient | null>(null);
  const rafRef = useRef<number>(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // Create and connect AudioStreamClients when config arrives.
  // Config arrives after user clicks Play (neko-preview pattern:
  // streams created lazily on first play).
  useEffect(() => {
    if (!audioStreamConfig) return;

    const { port, currentAudioStreamId, previousAudioStreamId } = audioStreamConfig;
    const baseUrl = `ws://127.0.0.1:${port}/v1/streams`;

    const currentClient = new AudioStreamClient({
      websocketUrl: `${baseUrl}/${currentAudioStreamId}`,
      volume: playingVersion === 'previous' ? 0 : 1,
      onError: (err) => logger.error('Current stream error', err),
    });

    const previousClient = new AudioStreamClient({
      websocketUrl: `${baseUrl}/${previousAudioStreamId}`,
      volume: playingVersion === 'current' ? 0 : 1,
      onError: (err) => logger.error('Previous stream error', err),
    });

    currentClientRef.current = currentClient;
    previousClientRef.current = previousClient;

    // Connect immediately — streams just created, data flows right away.
    // No local pause needed (neko-preview pattern).
    void currentClient.connect();
    void previousClient.connect();

    return () => {
      cancelAnimationFrame(rafRef.current);
      currentClient.dispose();
      previousClient.dispose();
      currentClientRef.current = null;
      previousClientRef.current = null;
    };
  }, [audioStreamConfig]); // eslint-disable-line react-hooks/exhaustive-deps

  // Time tracking via requestAnimationFrame polling AudioStreamClient.getCurrentTime()
  useEffect(() => {
    if (!isPlaying) {
      cancelAnimationFrame(rafRef.current);
      return;
    }

    const tick = () => {
      const client = currentClientRef.current;
      if (client?.isClockReady) {
        onTimeChange(client.getCurrentTime());
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(rafRef.current);
  }, [isPlaying, onTimeChange]);

  // Mute/unmute based on playingVersion
  useEffect(() => {
    const cur = currentClientRef.current;
    const prev = previousClientRef.current;
    if (cur) cur.setVolume(playingVersion === 'previous' ? 0 : 1);
    if (prev) prev.setVolume(playingVersion === 'current' ? 0 : 1);
  }, [playingVersion]);

  const handlePlayPause = useCallback(() => {
    const cur = currentClientRef.current;
    const prev = previousClientRef.current;

    if (isPlaying) {
      cur?.pause();
      prev?.pause();
      onAudioStreamControl?.('pause');
      setIsPlaying(false);
    } else {
      // If clients exist (not first play), resume them
      if (cur) cur.resume();
      if (prev) prev.resume();
      // Send play — on first click this triggers lazy stream creation
      // in the extension (neko-preview pattern); on subsequent clicks
      // it resumes the engine streams.
      onAudioStreamControl?.('play');
      setIsPlaying(true);
    }
  }, [isPlaying, onAudioStreamControl]);

  const handleSeek = useCallback(
    (time: number) => {
      onTimeChange(time);
      // Reset audio clocks for seek
      currentClientRef.current?.resetClock();
      previousClientRef.current?.resetClock();
      // Tell extension to seek engine streams
      onAudioStreamControl?.('seek', { time });
    },
    [onTimeChange, onAudioStreamControl],
  );

  return (
    <div className="flex items-center gap-4 p-3 bg-[var(--vscode-editor-background)] border-t border-[var(--vscode-panel-border)]">
      <button
        type="button"
        className={`w-8 h-8 flex items-center justify-center rounded transition-colors ${
          isFetchingPrevious
            ? 'opacity-40 cursor-not-allowed text-[var(--vscode-foreground)]'
            : 'bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)]'
        }`}
        onClick={isFetchingPrevious ? undefined : handlePlayPause}
        disabled={isFetchingPrevious}
        title={
          isFetchingPrevious ? t('mediaDiff.audio.fetchingPrevious') : isPlaying ? 'Pause' : 'Play'
        }
      >
        {isPlaying ? '\u23F8' : '\u25B6'}
      </button>

      <div className="flex items-center gap-1 text-xs">
        <button
          type="button"
          className={`px-2 py-1 rounded ${
            playingVersion === 'previous'
              ? 'bg-red-500 text-white'
              : 'bg-[var(--vscode-input-background)] text-[var(--vscode-foreground)]'
          }`}
          onClick={() => onPlayingVersionChange('previous')}
        >
          {t('mediaDiff.audio.previous')}
        </button>
        <button
          type="button"
          className={`px-2 py-1 rounded ${
            playingVersion === 'both'
              ? 'bg-purple-500 text-white'
              : 'bg-[var(--vscode-input-background)] text-[var(--vscode-foreground)]'
          }`}
          onClick={() => onPlayingVersionChange('both')}
        >
          {t('mediaDiff.audio.playBoth')}
        </button>
        <button
          type="button"
          className={`px-2 py-1 rounded ${
            playingVersion === 'current'
              ? 'bg-green-500 text-white'
              : 'bg-[var(--vscode-input-background)] text-[var(--vscode-foreground)]'
          }`}
          onClick={() => onPlayingVersionChange('current')}
        >
          {t('mediaDiff.audio.current')}
        </button>
      </div>

      <span className="text-xs text-[var(--vscode-foreground)] font-mono min-w-[100px]">
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>

      <div className="flex-1">
        <input
          type="range"
          min={0}
          max={duration || 1}
          step={0.01}
          value={currentTime}
          onChange={(e) => handleSeek(parseFloat(e.target.value))}
          className="w-full h-1 bg-[var(--vscode-input-background)] rounded-lg appearance-none cursor-pointer"
        />
      </div>
    </div>
  );
});
