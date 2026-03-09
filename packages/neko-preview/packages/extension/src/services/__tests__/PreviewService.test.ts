import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Mock vscode module
// ============================================================================

const mockGetExtension = vi.fn();
const mockExecuteCommand = vi.fn();

vi.mock('vscode', () => ({
  Disposable: { from: vi.fn() },
  extensions: {
    getExtension: (...args: unknown[]) => mockGetExtension(...args),
  },
  commands: {
    executeCommand: (...args: unknown[]) => mockExecuteCommand(...args),
  },
}));

// ============================================================================
// Mock @neko/neko-client
// ============================================================================

const mockDispatch = vi.fn();

vi.mock('@neko/neko-client', () => ({
  EngineClient: vi.fn().mockImplementation((port: number) => ({
    port,
    dispatch: mockDispatch,
  })),
}));

import { PreviewService, type MediaInfo } from '../../services/PreviewService';

// ============================================================================
// Helper to create an initialized PreviewService
// ============================================================================

async function createService(port = 8080): Promise<PreviewService> {
  mockGetExtension.mockReturnValue({
    id: 'neko.neko-engine',
    isActive: true,
    activate: vi.fn(),
  });
  mockExecuteCommand.mockResolvedValue({ port });

  const service = await PreviewService.tryCreate();
  expect(service).not.toBeNull();
  return service!;
}

// ============================================================================
// Tests
// ============================================================================

describe('PreviewService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('tryCreate()', () => {
    it('should create a service when engine extension is available', async () => {
      const service = await createService(9090);

      expect(service).not.toBeNull();
      expect(service.isAvailable).toBe(true);
      expect(service.port).toBe(9090);
    });

    it('should return null when engine extension is not installed', async () => {
      mockGetExtension.mockReturnValue(undefined);

      const service = await PreviewService.tryCreate();

      expect(service).toBeNull();
    });

    it('should return null when ensureFrameServer returns null', async () => {
      mockGetExtension.mockReturnValue({
        id: 'neko.neko-engine',
        isActive: true,
      });
      mockExecuteCommand.mockResolvedValue(null);

      const service = await PreviewService.tryCreate();

      expect(service).toBeNull();
    });

    it('should activate engine extension if not active', async () => {
      const mockActivate = vi.fn().mockResolvedValue(undefined);
      mockGetExtension.mockReturnValue({
        id: 'neko.neko-engine',
        isActive: false,
        activate: mockActivate,
      });
      mockExecuteCommand.mockResolvedValue({ port: 8080 });

      const service = await PreviewService.tryCreate();

      expect(service).not.toBeNull();
      expect(mockActivate).toHaveBeenCalled();
    });
  });

  describe('isAvailable', () => {
    it('should return true when client and port are present', async () => {
      const service = await createService();
      expect(service.isAvailable).toBe(true);
    });

    it('should return false after disposal', async () => {
      const service = await createService();
      await service.dispose();
      expect(service.isAvailable).toBe(false);
    });
  });

  describe('getStreamWebSocketUrl()', () => {
    it('should build correct WebSocket URL', async () => {
      const service = await createService(3000);

      const url = service.getStreamWebSocketUrl('stream-abc');

      expect(url).toBe('ws://127.0.0.1:3000/v1/streams/stream-abc');
    });

    it('should return null after disposal', async () => {
      const service = await createService(3000);
      await service.dispose();

      const url = service.getStreamWebSocketUrl('stream-abc');

      expect(url).toBeNull();
    });
  });

  describe('probeMedia()', () => {
    it('should parse probe response into MediaInfo', async () => {
      const service = await createService();

      mockDispatch.mockResolvedValue({
        status: 'ok',
        data: {
          duration: 120.5,
          format: 'mp4',
          videoStreams: [
            {
              codec: 'h264',
              width: 1920,
              height: 1080,
              fps: 30,
              bitrate: 5000000,
            },
          ],
          audioStreams: [
            {
              codec: 'aac',
              sampleRate: 44100,
              channels: 2,
            },
          ],
        },
      });

      const info = await service.probeMedia('/path/to/video.mp4');

      expect(info).toEqual({
        duration: 120.5,
        width: 1920,
        height: 1080,
        fps: 30,
        codec: 'h264',
        format: 'mp4',
        bitrate: 5000000,
        hasAudio: true,
        audioCodec: 'aac',
        audioSampleRate: 44100,
        audioChannels: 2,
      });
    });

    it('should handle audio-only files', async () => {
      const service = await createService();

      mockDispatch.mockResolvedValue({
        status: 'ok',
        data: {
          duration: 240,
          format: 'mp3',
          videoStreams: [],
          audioStreams: [
            {
              codec: 'mp3',
              sampleRate: 48000,
              channels: 2,
            },
          ],
        },
      });

      const info = await service.probeMedia('/path/to/song.mp3');

      expect(info.hasAudio).toBe(true);
      expect(info.width).toBe(0);
      expect(info.height).toBe(0);
      expect(info.codec).toBe('');
      expect(info.audioCodec).toBe('mp3');
    });

    it('should throw on error response', async () => {
      const service = await createService();

      mockDispatch.mockResolvedValue({
        status: 'error',
        error: { code: 'PROBE_FAILED', message: 'Unsupported format' },
      });

      await expect(service.probeMedia('/path/to/bad.file')).rejects.toThrow('Unsupported format');
    });
  });

  describe('startVideoPlayback()', () => {
    const mediaInfo: MediaInfo = {
      duration: 60,
      width: 1280,
      height: 720,
      fps: 24,
      codec: 'h264',
      format: 'mp4',
      hasAudio: true,
      audioCodec: 'aac',
      audioSampleRate: 44100,
      audioChannels: 2,
    };

    it('should start video and audio streams', async () => {
      const service = await createService();

      // Video stream response
      mockDispatch.mockResolvedValueOnce({
        status: 'ok',
        data: { streamId: 'video-1' },
      });
      // Audio stream response
      mockDispatch.mockResolvedValueOnce({
        status: 'ok',
        data: { streamId: 'audio-1' },
      });

      const result = await service.startVideoPlayback('/path/to/video.mp4', mediaInfo);

      expect(result.videoStreamId).toBe('video-1');
      expect(result.audioStreamId).toBe('audio-1');
      expect(mockDispatch).toHaveBeenCalledTimes(2);
    });

    it('should skip audio stream if media has no audio', async () => {
      const service = await createService();

      const noAudioInfo = { ...mediaInfo, hasAudio: false };

      mockDispatch.mockResolvedValueOnce({
        status: 'ok',
        data: { streamId: 'video-1' },
      });

      const result = await service.startVideoPlayback('/path/to/video.mp4', noAudioInfo);

      expect(result.videoStreamId).toBe('video-1');
      expect(result.audioStreamId).toBeNull();
      // Only 1 dispatch call (video only)
      expect(mockDispatch).toHaveBeenCalledTimes(1);
    });

    it('should seek to startTime when not zero', async () => {
      const service = await createService();

      // Video stream
      mockDispatch.mockResolvedValueOnce({ status: 'ok', data: { streamId: 'video-1' } });
      // Audio stream
      mockDispatch.mockResolvedValueOnce({ status: 'ok', data: { streamId: 'audio-1' } });
      // Seek video
      mockDispatch.mockResolvedValueOnce({ status: 'ok' });
      // Seek audio
      mockDispatch.mockResolvedValueOnce({ status: 'ok' });

      await service.startVideoPlayback('/path/to/video.mp4', mediaInfo, 30);

      // 2 stream starts + 2 seeks = 4 dispatches
      expect(mockDispatch).toHaveBeenCalledTimes(4);
    });

    it('should set speed when not 1.0', async () => {
      const service = await createService();

      // Video stream
      mockDispatch.mockResolvedValueOnce({ status: 'ok', data: { streamId: 'video-1' } });
      // Audio stream
      mockDispatch.mockResolvedValueOnce({ status: 'ok', data: { streamId: 'audio-1' } });
      // Speed video
      mockDispatch.mockResolvedValueOnce({ status: 'ok' });
      // Speed audio
      mockDispatch.mockResolvedValueOnce({ status: 'ok' });

      await service.startVideoPlayback('/path/to/video.mp4', mediaInfo, 0, 2.0);

      // 2 stream starts + 2 speed sets = 4 dispatches
      expect(mockDispatch).toHaveBeenCalledTimes(4);
    });

    it('should return null stream IDs on error', async () => {
      const service = await createService();

      mockDispatch.mockResolvedValueOnce({
        status: 'error',
        error: { code: 'STREAM_FAILED', message: 'Cannot start stream' },
      });

      const result = await service.startVideoPlayback('/path/to/video.mp4', mediaInfo);

      expect(result.videoStreamId).toBeNull();
      expect(result.audioStreamId).toBeNull();
    });
  });

  describe('stopStreams()', () => {
    it('should stop both video and audio streams', async () => {
      const service = await createService();

      mockDispatch.mockResolvedValue({ status: 'ok' });

      await service.stopStreams('video-1', 'audio-1');

      expect(mockDispatch).toHaveBeenCalledTimes(2);
    });

    it('should handle null stream IDs gracefully', async () => {
      const service = await createService();

      await service.stopStreams(null, null);

      expect(mockDispatch).not.toHaveBeenCalled();
    });

    it('should ignore stop errors', async () => {
      const service = await createService();

      mockDispatch.mockRejectedValue(new Error('Stream not found'));

      // Should not throw
      await expect(service.stopStreams('video-1', 'audio-1')).resolves.toBeUndefined();
    });
  });

  describe('seekStreams()', () => {
    it('should seek both streams to the specified time', async () => {
      const service = await createService();

      mockDispatch.mockResolvedValue({ status: 'ok' });

      await service.seekStreams('video-1', 'audio-1', 42.5);

      expect(mockDispatch).toHaveBeenCalledTimes(2);
      // Verify the seek request
      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          group: 'videos',
          action: 'seek',
          options: expect.objectContaining({
            streamId: 'video-1',
            time: 42.5,
          }),
        }),
      );
    });
  });

  describe('pauseStreams()', () => {
    it('should pause both streams', async () => {
      const service = await createService();

      mockDispatch.mockResolvedValue({ status: 'ok' });

      await service.pauseStreams('video-1', 'audio-1');

      expect(mockDispatch).toHaveBeenCalledTimes(2);
      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({ group: 'videos', action: 'pause' }),
      );
      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({ group: 'audios', action: 'pause' }),
      );
    });
  });

  describe('resumeStreams()', () => {
    it('should resume both streams', async () => {
      const service = await createService();

      mockDispatch.mockResolvedValue({ status: 'ok' });

      await service.resumeStreams('video-1', 'audio-1');

      expect(mockDispatch).toHaveBeenCalledTimes(2);
      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({ group: 'videos', action: 'resume' }),
      );
      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({ group: 'audios', action: 'resume' }),
      );
    });
  });

  describe('setStreamSpeed()', () => {
    it('should set speed on both streams', async () => {
      const service = await createService();

      mockDispatch.mockResolvedValue({ status: 'ok' });

      await service.setStreamSpeed('video-1', 'audio-1', 1.5);

      expect(mockDispatch).toHaveBeenCalledTimes(2);
      expect(mockDispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          group: 'videos',
          action: 'speed',
          options: expect.objectContaining({ speed: 1.5 }),
        }),
      );
    });
  });

  describe('getWaveform()', () => {
    it('should mix multi-channel peaks to mono', async () => {
      const service = await createService();

      mockDispatch.mockResolvedValue({
        status: 'ok',
        data: {
          resourceId: 'res-1',
          waveform: {
            sampleRate: 44100,
            channels: 2,
            peaksPerSecond: 100,
            duration: 0.03,
            peaks: [
              [0.5, 0.3, 0.8],
              [0.2, 0.9, 0.1],
            ],
          },
        },
      });

      const result = await service.getWaveform('/path/to/audio.mp3');

      // Max across channels: max(0.5,0.2)=0.5, max(0.3,0.9)=0.9, max(0.8,0.1)=0.8
      expect(result.peaks).toEqual([0.5, 0.9, 0.8]);
      expect(result.duration).toBe(0.03);
      expect(result.sampleRate).toBe(44100);
    });

    it('should return single channel as-is', async () => {
      const service = await createService();

      mockDispatch.mockResolvedValue({
        status: 'ok',
        data: {
          resourceId: 'res-1',
          waveform: {
            sampleRate: 48000,
            channels: 1,
            peaksPerSecond: 100,
            duration: 0.02,
            peaks: [[0.4, 0.7]],
          },
        },
      });

      const result = await service.getWaveform('/path/to/mono.wav');

      expect(result.peaks).toEqual([0.4, 0.7]);
    });

    it('should return empty array for no peaks', async () => {
      const service = await createService();

      mockDispatch.mockResolvedValue({
        status: 'ok',
        data: {
          resourceId: 'res-1',
          waveform: {
            sampleRate: 44100,
            channels: 0,
            peaksPerSecond: 100,
            duration: 0,
            peaks: [],
          },
        },
      });

      const result = await service.getWaveform('/path/to/silent.wav');

      expect(result.peaks).toEqual([]);
    });

    it('should throw on error response', async () => {
      const service = await createService();

      mockDispatch.mockResolvedValue({
        status: 'error',
        error: {
          code: 'WAVEFORM_FAILED',
          message: 'Cannot generate waveform',
        },
      });

      await expect(service.getWaveform('/path/to/bad.mp3')).rejects.toThrow(
        'Cannot generate waveform',
      );
    });
  });

  describe('captureFrame()', () => {
    it('should return base64 encoded frame data', async () => {
      const service = await createService();

      mockDispatch.mockResolvedValue({
        status: 'ok',
        data: { data: 'base64encodeddata' },
      });

      const result = await service.captureFrame('/path/to/video.mp4', 5.0);

      expect(result).toBe('base64encodeddata');
    });

    it('should throw on error response', async () => {
      const service = await createService();

      mockDispatch.mockResolvedValue({
        status: 'error',
        error: { code: 'CAPTURE_FAILED', message: 'No frame at time' },
      });

      await expect(service.captureFrame('/path/to/video.mp4', -1)).rejects.toThrow(
        'No frame at time',
      );
    });
  });

  describe('dispatch()', () => {
    it('should throw when service is not available', async () => {
      const service = await createService();
      await service.dispose();

      await expect(service.dispatch({ group: 'videos', action: 'probe' })).rejects.toThrow(
        'PreviewService not available',
      );
    });

    it('should forward request to EngineClient.dispatch()', async () => {
      const service = await createService();

      mockDispatch.mockResolvedValue({ status: 'ok' });

      await service.dispatch({
        group: 'videos',
        action: 'stream',
        id: 'test-id',
        options: { quality: 'high' },
        body: { key: 'value' },
      });

      expect(mockDispatch).toHaveBeenCalledWith({
        group: 'videos',
        action: 'stream',
        id: 'test-id',
        options: { quality: 'high' },
        body: { key: 'value' },
      });
    });

    it('should merge legacy top-level fields into options', async () => {
      const service = await createService();

      mockDispatch.mockResolvedValue({ status: 'ok' });

      await service.dispatch({
        group: 'videos',
        action: 'stream',
        source: '/path/to/file',
        sessionId: 'session-1',
        streamId: 'stream-1',
        options: { quality: 'high' },
      });

      expect(mockDispatch).toHaveBeenCalledWith({
        group: 'videos',
        action: 'stream',
        id: undefined,
        options: {
          quality: 'high',
          source: '/path/to/file',
          sessionId: 'session-1',
          streamId: 'stream-1',
        },
        body: undefined,
      });
    });
  });

  describe('dispose()', () => {
    it('should mark service as unavailable', async () => {
      const service = await createService();

      await service.dispose();

      expect(service.isAvailable).toBe(false);
      expect(service.port).toBeNull();
    });

    it('should be idempotent (calling dispose twice does not throw)', async () => {
      const service = await createService();

      await service.dispose();
      await service.dispose();

      expect(service.isAvailable).toBe(false);
    });
  });
});
