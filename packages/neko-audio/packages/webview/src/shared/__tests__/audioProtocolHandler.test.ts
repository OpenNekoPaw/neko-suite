import { describe, expect, it, vi } from 'vitest';
import type { AudioResponseMessage } from '@neko/shared';
import { handleAudioResponseMessage } from '../audioProtocolHandler';

function createActions() {
  return {
    setFileInfo: vi.fn(),
    setWaveform: vi.fn(),
    setStreamInfo: vi.fn(),
    setSilenceRegions: vi.fn(),
    setLoudness: vi.fn(),
    showToast: vi.fn(),
  };
}

describe('audioProtocolHandler', () => {
  it('handles init file metadata', () => {
    const actions = createActions();
    const audioInfo = {
      duration: 12.5,
      codec: 'pcm',
      sampleRate: 48000,
      channels: 2,
      bitrate: 1536000,
      format: 'wav',
    };
    const message: AudioResponseMessage = {
      type: 'audio:init',
      filePath: '/tmp/dialog.wav',
      fileName: 'dialog.wav',
      audioInfo,
    };

    expect(handleAudioResponseMessage(message, actions)).toBe(true);
    expect(actions.setFileInfo).toHaveBeenCalledWith('/tmp/dialog.wav', 'dialog.wav', audioInfo);
  });

  it('handles waveform data', () => {
    const actions = createActions();
    const waveform = {
      peaks: [0, 0.5, -0.25],
      duration: 3,
      sampleRate: 44100,
    };
    const message: AudioResponseMessage = {
      type: 'audio:waveform',
      waveform,
    };

    expect(handleAudioResponseMessage(message, actions)).toBe(true);
    expect(actions.setWaveform).toHaveBeenCalledWith(waveform);
  });

  it('handles playback ready connection data and warnings', () => {
    const actions = createActions();
    const message: AudioResponseMessage = {
      type: 'audio:playbackReady',
      streamId: 'stream-1',
      wsUrl: 'ws://127.0.0.1:9999/v1/streams/stream-1',
      warnings: ['unsupported effect skipped'],
    };

    expect(handleAudioResponseMessage(message, actions)).toBe(true);
    expect(actions.setStreamInfo).toHaveBeenCalledWith(
      'stream-1',
      'ws://127.0.0.1:9999/v1/streams/stream-1',
    );
    expect(actions.showToast).toHaveBeenCalledWith('unsupported effect skipped', 'info');
  });

  it('surfaces export warnings', () => {
    const actions = createActions();
    const message: AudioResponseMessage = {
      type: 'audio:exportResult',
      success: true,
      outputPath: '/tmp/mix.wav',
      warnings: ['noise-reduction skipped'],
    };

    expect(handleAudioResponseMessage(message, actions)).toBe(true);
    expect(actions.showToast).toHaveBeenCalledWith(
      'Exported /tmp/mix.wav\nnoise-reduction skipped',
      'success',
    );
  });

  it('maps analysis results into store actions', () => {
    const actions = createActions();
    const loudness: AudioResponseMessage = {
      type: 'audio:analysisResult',
      kind: 'loudness',
      result: {
        integratedLoudness: -14,
        truePeak: -1,
        loudnessRange: 6,
      },
    };
    const silence: AudioResponseMessage = {
      type: 'audio:analysisResult',
      kind: 'silence',
      result: {
        regions: [{ start: 1, end: 2 }],
      },
    };

    handleAudioResponseMessage(loudness, actions);
    handleAudioResponseMessage(silence, actions);

    expect(actions.setLoudness).toHaveBeenCalledWith({
      integratedLoudness: -14,
      truePeak: -1,
      loudnessRange: 6,
    });
    expect(actions.setSilenceRegions).toHaveBeenCalledWith([{ start: 1, end: 2 }]);
  });

  it('shows typed audio errors', () => {
    const actions = createActions();
    const message: AudioResponseMessage = {
      type: 'audio:error',
      success: false,
      error: 'No audio project is open',
    };

    expect(handleAudioResponseMessage(message, actions)).toBe(true);
    expect(actions.showToast).toHaveBeenCalledWith('No audio project is open', 'error');
  });
});
