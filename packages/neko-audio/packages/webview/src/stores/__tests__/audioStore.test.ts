import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useAudioStore } from '../audioStore';
import type { AudioInfo, WaveformData } from '../../shared/types';

// =============================================================================
// Helpers
// =============================================================================

function getState() {
  return useAudioStore.getState();
}

const mockAudioInfo: AudioInfo = {
  duration: 120.5,
  codec: 'mp3',
  sampleRate: 44100,
  channels: 2,
  bitrate: 320000,
  format: 'mp3',
};

const mockWaveform: WaveformData = {
  peaks: [0.1, 0.5, 0.8, 0.3],
  duration: 120.5,
  sampleRate: 44100,
};

// =============================================================================
// Tests
// =============================================================================

describe('audioStore', () => {
  beforeEach(() => {
    getState().reset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // =========================================================================
  // File info
  // =========================================================================

  describe('file info', () => {
    it('setFileInfo sets path, name, audioInfo and clears loading', () => {
      expect(getState().isLoading).toBe(true);
      getState().setFileInfo('/test/audio.mp3', 'audio.mp3', mockAudioInfo);

      const s = getState();
      expect(s.filePath).toBe('/test/audio.mp3');
      expect(s.fileName).toBe('audio.mp3');
      expect(s.audioInfo).toEqual(mockAudioInfo);
      expect(s.isLoading).toBe(false);
      expect(s.error).toBeNull();
    });

    it('setWaveform stores waveform data', () => {
      getState().setWaveform(mockWaveform);
      expect(getState().waveform).toEqual(mockWaveform);
    });
  });

  // =========================================================================
  // Playback
  // =========================================================================

  describe('playback', () => {
    it('setPlaybackState updates state', () => {
      getState().setPlaybackState('playing');
      expect(getState().playbackState).toBe('playing');
    });

    it('setCurrentTime updates time', () => {
      getState().setCurrentTime(42.5);
      expect(getState().currentTime).toBe(42.5);
    });

    it('setVolume updates volume', () => {
      getState().setVolume(0.7);
      expect(getState().volume).toBe(0.7);
    });

    it('setSpeed updates speed', () => {
      getState().setSpeed(1.5);
      expect(getState().speed).toBe(1.5);
    });

    it('toggleMute toggles isMuted', () => {
      expect(getState().isMuted).toBe(false);
      getState().toggleMute();
      expect(getState().isMuted).toBe(true);
      getState().toggleMute();
      expect(getState().isMuted).toBe(false);
    });

    it('setStreamInfo and clearStreamInfo', () => {
      getState().setStreamInfo('stream-1', 'ws://localhost:8080/stream');
      expect(getState().streamId).toBe('stream-1');
      expect(getState().streamUrl).toBe('ws://localhost:8080/stream');

      getState().clearStreamInfo();
      expect(getState().streamId).toBeNull();
      expect(getState().streamUrl).toBeNull();
    });
  });

  // =========================================================================
  // Selection
  // =========================================================================

  describe('selection', () => {
    it('setSelection sets and clears selection', () => {
      getState().setSelection({ start: 5, end: 10 });
      expect(getState().selection).toEqual({ start: 5, end: 10 });

      getState().setSelection(null);
      expect(getState().selection).toBeNull();
    });
  });

  // =========================================================================
  // UI toggles
  // =========================================================================

  describe('UI toggles', () => {
    it.each([
      ['toggleSpectrum', 'showSpectrum'],
      ['toggleEffects', 'showEffects'],
      ['toggleRecording', 'showRecording'],
      ['toggleExport', 'showExport'],
    ] as const)('%s toggles %s', (action, field) => {
      expect(getState()[field]).toBe(false);
      (getState()[action] as () => void)();
      expect(getState()[field]).toBe(true);
      (getState()[action] as () => void)();
      expect(getState()[field]).toBe(false);
    });

    it('setError sets error and clears loading', () => {
      getState().setError('Something broke');
      expect(getState().error).toBe('Something broke');
      expect(getState().isLoading).toBe(false);
    });
  });

  // =========================================================================
  // Project mode
  // =========================================================================

  describe('project mode', () => {
    it('setProjectMode toggles project mode', () => {
      getState().setProjectMode(true);
      expect(getState().projectMode).toBe(true);
    });

    it('markers CRUD', () => {
      const marker = { id: 'm1', time: 5.0, label: 'Intro', color: '#ff0000' };
      getState().addMarker(marker);
      expect(getState().markers).toHaveLength(1);
      expect(getState().markers[0]).toEqual(marker);

      getState().addMarker({ id: 'm2', time: 10.0, label: 'Verse' });
      expect(getState().markers).toHaveLength(2);

      getState().removeMarker('m1');
      expect(getState().markers).toHaveLength(1);
      expect(getState().markers[0]!.id).toBe('m2');

      getState().setMarkers([]);
      expect(getState().markers).toHaveLength(0);
    });
  });

  // =========================================================================
  // Analysis
  // =========================================================================

  describe('analysis', () => {
    it('setSilenceRegions stores regions', () => {
      const regions = [
        { start: 0, end: 1.5 },
        { start: 30, end: 31 },
      ];
      getState().setSilenceRegions(regions);
      expect(getState().silenceRegions).toEqual(regions);
    });

    it('setLoudness stores loudness result', () => {
      const loudness = { integratedLoudness: -14.2, truePeak: -1.1, loudnessRange: 8.5 };
      getState().setLoudness(loudness);
      expect(getState().loudness).toEqual(loudness);
    });
  });

  // =========================================================================
  // Toast
  // =========================================================================

  describe('toast', () => {
    it('showToast sets toast message', () => {
      getState().showToast('Done!', 'success');
      const toast = getState().toast;
      expect(toast).not.toBeNull();
      expect(toast!.text).toBe('Done!');
      expect(toast!.level).toBe('success');
    });

    it('showToast defaults to info level', () => {
      getState().showToast('Info message');
      expect(getState().toast!.level).toBe('info');
    });

    it('showToast auto-clears after 4 seconds', () => {
      getState().showToast('Temporary');
      expect(getState().toast).not.toBeNull();

      vi.advanceTimersByTime(4000);
      expect(getState().toast).toBeNull();
    });

    it('clearToast immediately clears toast', () => {
      getState().showToast('Clear me');
      getState().clearToast();
      expect(getState().toast).toBeNull();
    });

    it('new toast replaces old toast before auto-clear', () => {
      getState().showToast('First');
      const firstId = getState().toast!.id;

      // Advance time so Date.now() returns a different value
      vi.advanceTimersByTime(1);

      getState().showToast('Second');
      expect(getState().toast!.text).toBe('Second');
      expect(getState().toast!.id).not.toBe(firstId);
    });
  });

  // =========================================================================
  // Reset
  // =========================================================================

  describe('reset', () => {
    it('resets all state to initial values', () => {
      getState().setFileInfo('/test.mp3', 'test.mp3', mockAudioInfo);
      getState().setPlaybackState('playing');
      getState().setSelection({ start: 1, end: 5 });
      getState().toggleSpectrum();
      getState().setProjectMode(true);

      getState().reset();

      const s = getState();
      expect(s.filePath).toBeNull();
      expect(s.playbackState).toBe('stopped');
      expect(s.selection).toBeNull();
      expect(s.showSpectrum).toBe(false);
      expect(s.projectMode).toBe(false);
      expect(s.isLoading).toBe(true);
    });
  });
});
