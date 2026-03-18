/**
 * useAudioPlayback - Manages AudioStreamClient lifecycle and time tracking
 *
 * Handles:
 * - AudioStreamClient creation/disposal on stream URL change
 * - requestAnimationFrame time tracking loop
 * - Playback end detection
 * - Volume/speed sync
 */

import { useRef, useEffect, useCallback } from 'react';
import { AudioStreamClient } from '@neko/neko-client';
import { useAudioStore } from '../stores/audioStore';
import { postMessage } from '../shared/useVscodeMessage';
import { getLogger } from '../utils/logger';

const logger = getLogger('useAudioPlayback');

export function useAudioPlayback() {
  const audioClientRef = useRef<AudioStreamClient | null>(null);
  const playStartTimeRef = useRef(0);
  const playWallTimeRef = useRef(0);
  const animFrameRef = useRef(0);

  const {
    audioInfo,
    playbackState,
    currentTime,
    volume,
    streamUrl,
    isMuted,
    setPlaybackState,
    setCurrentTime,
    clearStreamInfo,
  } = useAudioStore();

  const duration = audioInfo?.duration ?? 0;

  // =========================================================================
  // Time tracking during playback
  // =========================================================================

  const updatePlaybackTime = useCallback(() => {
    if (playbackState !== 'playing') return;

    let newTime: number;
    const audioClient = audioClientRef.current;
    if (audioClient && audioClient.isClockReady) {
      newTime = audioClient.getCurrentTime();
    } else {
      const elapsed = (performance.now() - playWallTimeRef.current) / 1000;
      newTime = playStartTimeRef.current + elapsed;
    }

    if (newTime >= duration) {
      setCurrentTime(duration);
      setPlaybackState('stopped');
      // Fade out before disposing
      const client = audioClientRef.current;
      if (client) {
        client.fadeOut().then(() => {
          client.dispose();
        });
        audioClientRef.current = null;
      }
      postMessage({ type: 'editor:stop' });
      return;
    }

    setCurrentTime(newTime);
    animFrameRef.current = requestAnimationFrame(updatePlaybackTime);
  }, [playbackState, duration, setCurrentTime, setPlaybackState]);

  useEffect(() => {
    if (playbackState === 'playing') {
      animFrameRef.current = requestAnimationFrame(updatePlaybackTime);
    }
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [playbackState, updatePlaybackTime]);

  // =========================================================================
  // Stream URL change → create AudioStreamClient
  // =========================================================================

  useEffect(() => {
    if (!streamUrl) return;

    // Dispose previous client
    audioClientRef.current?.dispose();

    const audioClient = new AudioStreamClient({
      websocketUrl: streamUrl,
      volume: isMuted ? 0 : volume,
      onConnectionChange: (connected) => {
        logger.info(`Stream connected: ${connected}`);
      },
      onError: (err) => {
        logger.warn('Stream error:', err);
      },
    });

    audioClientRef.current = audioClient;
    audioClient.connect();

    return () => {
      audioClient.dispose();
      if (audioClientRef.current === audioClient) {
        audioClientRef.current = null;
      }
    };
    // Only reconnect on streamUrl change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamUrl]);

  // =========================================================================
  // Volume sync
  // =========================================================================

  useEffect(() => {
    audioClientRef.current?.setVolume(isMuted ? 0 : volume);
  }, [volume, isMuted]);

  // =========================================================================
  // Cleanup on unmount
  // =========================================================================

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
  // Playback control callbacks
  // =========================================================================

  const play = useCallback(() => {
    if (!audioInfo) return;

    const startTime = currentTime >= duration ? 0 : currentTime;
    setCurrentTime(startTime);
    setPlaybackState('playing');
    playStartTimeRef.current = startTime;
    playWallTimeRef.current = performance.now();

    postMessage({ type: 'editor:play', startTime });
  }, [audioInfo, currentTime, duration, setCurrentTime, setPlaybackState]);

  const pause = useCallback(() => {
    setPlaybackState('paused');
    audioClientRef.current?.pause();
    postMessage({ type: 'editor:pause' });
  }, [setPlaybackState]);

  const resume = useCallback(() => {
    setPlaybackState('playing');
    playStartTimeRef.current = currentTime;
    playWallTimeRef.current = performance.now();
    audioClientRef.current?.resume();
    postMessage({ type: 'editor:resume' });
  }, [currentTime, setPlaybackState]);

  const togglePlay = useCallback(() => {
    if (playbackState === 'playing') {
      pause();
    } else if (audioClientRef.current) {
      resume();
    } else {
      play();
    }
  }, [playbackState, play, pause, resume]);

  const seek = useCallback(
    (time: number) => {
      setCurrentTime(time);
      if (playbackState === 'playing') {
        playStartTimeRef.current = time;
        playWallTimeRef.current = performance.now();
      }
      audioClientRef.current?.resetClock();
      postMessage({ type: 'editor:seek', time });
    },
    [playbackState, setCurrentTime],
  );

  const stop = useCallback(() => {
    setPlaybackState('stopped');
    setCurrentTime(0);
    clearStreamInfo();
    const client = audioClientRef.current;
    if (client) {
      client.fadeOut().then(() => client.dispose());
      audioClientRef.current = null;
    }
    postMessage({ type: 'editor:stop' });
  }, [setPlaybackState, setCurrentTime, clearStreamInfo]);

  return {
    play,
    pause,
    resume,
    togglePlay,
    seek,
    stop,
    audioClientRef,
  };
}
