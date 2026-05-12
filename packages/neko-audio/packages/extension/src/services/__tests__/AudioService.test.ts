/**
 * AudioService unit tests
 *
 * Tests AudioService methods with mocked EngineClient.
 * Verifies request construction, response parsing, and error handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Mocks — must be set up before importing AudioService
// =============================================================================

// Mock vscode module
vi.mock('vscode', () => ({
  extensions: {
    getExtension: vi.fn(),
  },
  commands: {
    executeCommand: vi.fn(),
  },
  Disposable: class {
    dispose() {}
  },
}));

// Mock logger
vi.mock('../../utils/logger', () => ({
  getLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// Mock EngineClient with all methods used by AudioService
const mockDispatch = vi.fn();
const mockProbe = vi.fn();
const mockWaveform = vi.fn();
const mockCreateStream = vi.fn();
const mockControlStream = vi.fn();
const mockAnalyzeLoudness = vi.fn();
const mockDetectSilence = vi.fn();
const mockGetStreamWsUrl = vi.fn((id: string) => `ws://127.0.0.1:9999/v1/streams/${id}`);

vi.mock('@neko/neko-client', () => ({
  EngineClient: function MockEngineClient() {
    return {
      dispatch: mockDispatch,
      probe: mockProbe,
      waveform: mockWaveform,
      createStream: mockCreateStream,
      controlStream: mockControlStream,
      analyzeLoudness: mockAnalyzeLoudness,
      detectSilence: mockDetectSilence,
      getStreamWsUrl: mockGetStreamWsUrl,
    };
  },
}));

import { AudioService } from '../AudioService';
import * as vscode from 'vscode';
import type { MixStreamConfig } from '@neko/shared';

const EMPTY_MIX_CONFIG: MixStreamConfig = {
  tracks: [],
  masterEffects: [],
  masterVolume: 1,
  sampleRate: 48000,
  channels: 2,
};

// =============================================================================
// Helper: create an initialized AudioService
// =============================================================================

async function createTestService(): Promise<AudioService> {
  const mockExt = { isActive: true, activate: vi.fn() };
  (vscode.extensions.getExtension as ReturnType<typeof vi.fn>).mockReturnValue(mockExt);
  (vscode.commands.executeCommand as ReturnType<typeof vi.fn>).mockResolvedValue({ port: 9999 });

  const service = await AudioService.tryCreate();
  expect(service).not.toBeNull();
  return service!;
}

// =============================================================================
// Tests
// =============================================================================

describe('AudioService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // Initialization
  // =========================================================================

  describe('tryCreate', () => {
    it('returns null when engine extension is not installed', async () => {
      (vscode.extensions.getExtension as ReturnType<typeof vi.fn>).mockReturnValue(null);
      const service = await AudioService.tryCreate();
      expect(service).toBeNull();
    });

    it('returns null when ensureFrameServer returns null', async () => {
      const mockExt = { isActive: true, activate: vi.fn() };
      (vscode.extensions.getExtension as ReturnType<typeof vi.fn>).mockReturnValue(mockExt);
      (vscode.commands.executeCommand as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      const service = await AudioService.tryCreate();
      expect(service).toBeNull();
    });

    it('creates service when engine is available', async () => {
      const service = await createTestService();
      expect(service.isAvailable).toBe(true);
      expect(service.port).toBe(9999);
    });

    it('activates inactive extension', async () => {
      const mockExt = { isActive: false, activate: vi.fn().mockResolvedValue(undefined) };
      (vscode.extensions.getExtension as ReturnType<typeof vi.fn>).mockReturnValue(mockExt);
      (vscode.commands.executeCommand as ReturnType<typeof vi.fn>).mockResolvedValue({
        port: 9999,
      });

      await AudioService.tryCreate();
      expect(mockExt.activate).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // probeAudio
  // =========================================================================

  describe('probeAudio', () => {
    it('parses probe response correctly', async () => {
      const service = await createTestService();

      mockProbe.mockResolvedValue({
        duration: 120.5,
        format: 'mp3',
        audioCodec: 'mp3',
        audioSampleRate: 44100,
        audioChannels: 2,
        audioBitrate: 320000,
      });

      const info = await service.probeAudio('/test/audio.mp3');
      expect(info).toEqual({
        duration: 120.5,
        codec: 'mp3',
        sampleRate: 44100,
        channels: 2,
        bitrate: 320000,
        format: 'mp3',
      });

      expect(mockProbe).toHaveBeenCalledWith('videos', '/test/audio.mp3');
    });

    it('handles missing audio streams gracefully', async () => {
      const service = await createTestService();

      mockProbe.mockResolvedValue({
        duration: 10,
        format: 'wav',
        audioCodec: undefined,
        audioSampleRate: undefined,
        audioChannels: undefined,
        audioBitrate: undefined,
      });

      const info = await service.probeAudio('/test/empty.wav');
      expect(info.codec).toBe('');
      expect(info.sampleRate).toBe(0);
      expect(info.channels).toBe(0);
    });

    it('throws on error response', async () => {
      const service = await createTestService();
      mockProbe.mockRejectedValue(new Error('File not found'));

      await expect(service.probeAudio('/bad/path')).rejects.toThrow('File not found');
    });
  });

  // =========================================================================
  // getWaveform
  // =========================================================================

  describe('getWaveform', () => {
    it('returns mono peaks for single-channel audio', async () => {
      const service = await createTestService();

      mockWaveform.mockResolvedValue({
        peaks: [0.1, 0.5, 0.8, 0.3],
        sampleRate: 44100,
        channels: 1,
        duration: 2,
        peaksPerSecond: 10,
      });

      const waveform = await service.getWaveform('/test/mono.wav');
      expect(waveform.peaks).toEqual([0.1, 0.5, 0.8, 0.3]);
      expect(waveform.duration).toBe(2);
    });

    it('returns downmixed peaks from EngineClient', async () => {
      const service = await createTestService();

      mockWaveform.mockResolvedValue({
        peaks: [0.3, 0.5],
        sampleRate: 44100,
        channels: 2,
        duration: 1,
        peaksPerSecond: 10,
      });

      const waveform = await service.getWaveform('/test/stereo.wav');
      expect(waveform.peaks).toEqual([0.3, 0.5]);
    });

    it('handles empty peaks array', async () => {
      const service = await createTestService();

      mockWaveform.mockResolvedValue({
        peaks: [],
        sampleRate: 44100,
        channels: 0,
        duration: 0,
        peaksPerSecond: 0,
      });

      const waveform = await service.getWaveform('/test/empty.wav');
      expect(waveform.peaks).toEqual([]);
    });
  });

  // =========================================================================
  // transcode
  // =========================================================================

  describe('transcode', () => {
    it('dispatches transcode with all options', async () => {
      const service = await createTestService();

      mockDispatch.mockResolvedValue({
        status: 'ok',
        data: { output: '/out/result.mp3' },
      });

      const result = await service.transcode('/in/audio.wav', '/out/result.mp3', {
        format: 'mp3',
        sampleRate: 48000,
        bitrate: 192000,
        channels: 1,
        effects: [
          {
            id: 'fx-1',
            effectType: 'compressor',
            enabled: true,
            params: { threshold: -20 },
          },
        ],
      });

      expect(result).toBe('/out/result.mp3');
      expect(mockDispatch).toHaveBeenCalledWith({
        group: 'audios',
        action: 'transcode',
        options: {
          source: '/in/audio.wav',
          output: '/out/result.mp3',
          format: 'mp3',
          sampleRate: 48000,
          bitrate: 192000,
          channels: 1,
          effects: [
            {
              id: 'fx-1',
              effectType: 'compressor',
              enabled: true,
              params: { threshold: -20 },
            },
          ],
        },
      });
    });

    it('dispatches trim with start/end times', async () => {
      const service = await createTestService();
      mockDispatch.mockResolvedValue({ status: 'ok', data: {} });

      await service.transcode('/in/audio.wav', '/out/trimmed.wav', {
        startTime: 5.0,
        endTime: 15.0,
      });

      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          options: expect.objectContaining({ startTime: 5.0, endTime: 15.0 }),
        }),
      );
    });

    it('throws on transcode error', async () => {
      const service = await createTestService();
      mockDispatch.mockResolvedValue({
        status: 'error',
        error: { message: 'Unsupported codec' },
      });

      await expect(service.transcode('/in.wav', '/out.mp3')).rejects.toThrow('Unsupported codec');
    });
  });

  // =========================================================================
  // analyzeLoudness
  // =========================================================================

  describe('analyzeLoudness', () => {
    it('parses loudness response', async () => {
      const service = await createTestService();

      mockAnalyzeLoudness.mockResolvedValue({
        integratedLufs: -14.2,
        truePeakDbfs: -1.1,
        loudnessRange: 8.5,
        recommendedGain: 0.2,
        targetLufs: -14,
      });

      const result = await service.analyzeLoudness('/test/audio.mp3');
      expect(result).toEqual({
        integratedLoudness: -14.2,
        truePeak: -1.1,
        loudnessRange: 8.5,
      });
    });
  });

  // =========================================================================
  // detectSilence
  // =========================================================================

  describe('detectSilence', () => {
    it('returns silence regions', async () => {
      const service = await createTestService();

      mockDetectSilence.mockResolvedValue({
        totalDuration: 60,
        silenceDuration: 2.5,
        silenceRatio: 0.04,
        regionCount: 2,
        regions: [
          { start: 0, end: 1.5, duration: 1.5 },
          { start: 30, end: 31, duration: 1 },
        ],
      });

      const regions = await service.detectSilence('/test/audio.mp3', -40, 0.5);
      expect(regions).toHaveLength(2);
      expect(regions[0]).toEqual({ start: 0, end: 1.5, duration: 1.5 });
    });

    it('passes threshold and minDuration options', async () => {
      const service = await createTestService();
      mockDetectSilence.mockResolvedValue({
        totalDuration: 10,
        silenceDuration: 0,
        silenceRatio: 0,
        regionCount: 0,
        regions: [],
      });

      await service.detectSilence('/test.wav', -35, 0.3);
      expect(mockDetectSilence).toHaveBeenCalledWith('/test.wav', -35, 0.3);
    });
  });

  // =========================================================================
  // Streaming
  // =========================================================================

  describe('streaming', () => {
    it('startStream returns streamId and WebSocket URL', async () => {
      const service = await createTestService();

      mockCreateStream.mockResolvedValue({
        streamId: 'stream-abc',
        wsUrl: 'ws://127.0.0.1:9999/v1/streams/stream-abc',
      });

      const result = await service.startStream('/test/audio.mp3');
      expect(result).toEqual({
        streamId: 'stream-abc',
        streamUrl: 'ws://127.0.0.1:9999/v1/streams/stream-abc',
      });
    });

    it('startStream returns null on error', async () => {
      const service = await createTestService();
      mockCreateStream.mockRejectedValue(new Error('fail'));

      const result = await service.startStream('/bad.mp3');
      expect(result).toBeNull();
    });

    it('getStreamWebSocketUrl returns correct URL', async () => {
      const service = await createTestService();
      expect(service.getStreamWebSocketUrl('s1')).toBe('ws://127.0.0.1:9999/v1/streams/s1');
    });

    it('setStreamLoop sends loop region and clear commands', async () => {
      const service = await createTestService();

      await service.setStreamLoop('stream-abc', { inPoint: 1.25, outPoint: 4.5 });
      await service.setStreamLoop('stream-abc', null);

      expect(mockControlStream).toHaveBeenNthCalledWith(1, 'audios', 'stream-abc', 'loop', {
        inPoint: 1.25,
        outPoint: 4.5,
      });
      expect(mockControlStream).toHaveBeenNthCalledWith(2, 'audios', 'stream-abc', 'loop', {
        clear: true,
      });
    });

    it('updateMixStream dispatches full config replacement and returns warnings', async () => {
      const service = await createTestService();
      mockDispatch.mockResolvedValue({
        status: 'ok',
        data: {
          streamId: 'stream-abc',
          status: 'updated',
          warnings: ['unsupported effect skipped'],
        },
      });

      const result = await service.updateMixStream('stream-abc', EMPTY_MIX_CONFIG);

      expect(result).toEqual({
        streamId: 'stream-abc',
        warnings: ['unsupported effect skipped'],
      });
      expect(mockDispatch).toHaveBeenCalledWith({
        group: 'audios',
        action: 'mix_stream',
        options: {
          action: 'update',
          streamId: 'stream-abc',
          config: EMPTY_MIX_CONFIG,
        },
      });
    });
  });

  // =========================================================================
  // Mix export
  // =========================================================================

  describe('mixExport', () => {
    it('returns output and warnings from mix export', async () => {
      const service = await createTestService();
      mockDispatch.mockResolvedValue({
        status: 'ok',
        data: {
          output: '/out/mix.wav',
          warnings: ['unsupported effect skipped'],
        },
      });

      const result = await service.mixExport(EMPTY_MIX_CONFIG, '/out/mix.wav', 'wav', 192000);

      expect(result).toEqual({
        output: '/out/mix.wav',
        warnings: ['unsupported effect skipped'],
      });
      expect(mockDispatch).toHaveBeenCalledWith({
        group: 'audios',
        action: 'mix_export',
        options: {
          config: EMPTY_MIX_CONFIG,
          output: '/out/mix.wav',
          format: 'wav',
          bitrate: 192000,
        },
      });
    });
  });

  // =========================================================================
  // Disposal
  // =========================================================================

  describe('dispose', () => {
    it('marks service as unavailable after dispose', async () => {
      const service = await createTestService();
      expect(service.isAvailable).toBe(true);

      await service.dispose();
      expect(service.isAvailable).toBe(false);
      expect(service.port).toBeNull();
    });

    it('throws on dispatch after dispose', async () => {
      const service = await createTestService();
      await service.dispose();

      await expect(service.probeAudio('/test.mp3')).rejects.toThrow('AudioService not available');
    });
  });
});
