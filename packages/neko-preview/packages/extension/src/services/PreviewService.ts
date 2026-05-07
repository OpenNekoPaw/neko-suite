/**
 * PreviewService - Media preview orchestration service
 *
 * Connects to neko-engine's Frame Server via EngineClient (HTTP) for:
 * - Media probing (metadata extraction)
 * - Video playback control (start/stop/seek via H.264 stream)
 * - Waveform data generation
 *
 * Architecture:
 * PreviewService → EngineClient (HTTP) → neko-engine Frame Server → Rust EngineApi
 */

import * as vscode from 'vscode';
import { EngineClient } from '@neko/neko-client';
import type { ActionRequest as EngineActionRequest, ActionResponse } from '@neko/neko-client';
import type {
  PreviewManifest,
  PreviewVariant,
  PreviewVariantRequest,
  RegisterPreviewAssetRequest,
} from '@neko/shared';
import { getLogger } from '../utils/logger';

const logger = getLogger('PreviewService');

const ENGINE_EXTENSION_ID = 'neko.neko-engine';

// =============================================================================
// Types
// =============================================================================

/**
 * Extended ActionRequest accepting legacy top-level source/sessionId/streamId.
 * These are merged into options before forwarding to EngineClient.
 */
interface ActionRequest extends EngineActionRequest {
  source?: string;
  sessionId?: string;
  streamId?: string;
}

export interface MediaInfo {
  duration: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
  format: string;
  bitrate?: number;
  hasAudio: boolean;
  audioCodec?: string;
  audioSampleRate?: number;
  audioChannels?: number;
  metadata?: Record<string, string>;
  coverArt?: { mimeType: string; dataBase64: string };
}

// =============================================================================
// PreviewService
// =============================================================================

export class PreviewService implements vscode.Disposable {
  private _client: EngineClient | null = null;
  private _port: number | null = null;
  private _disposed = false;

  /**
   * Try to create a PreviewService instance.
   * Returns null if engine connection fails.
   */
  static async tryCreate(): Promise<PreviewService | null> {
    const service = new PreviewService();
    const initialized = await service.initialize();
    if (initialized) {
      return service;
    }
    await service.dispose();
    return null;
  }

  private constructor() {}

  private async initialize(): Promise<boolean> {
    try {
      logger.info('Connecting to neko-engine Frame Server...');

      // 1. Ensure engine extension is activated
      const ext = vscode.extensions.getExtension(ENGINE_EXTENSION_ID);
      if (!ext) {
        logger.error(`Extension ${ENGINE_EXTENSION_ID} not installed`);
        return false;
      }

      if (!ext.isActive) {
        await ext.activate();
      }

      // 2. Ensure Frame Server is running → get port
      const result = await vscode.commands.executeCommand<{ port: number } | null>(
        'neko.engine.ensureFrameServer',
      );
      if (!result) {
        logger.error('ensureFrameServer returned null');
        return false;
      }

      this._port = result.port;
      this._client = new EngineClient(result.port);
      logger.info(`Connected to Frame Server on port ${this._port}`);

      return true;
    } catch (error) {
      logger.error(`Failed to initialize: ${error instanceof Error ? error.message : error}`);
      return false;
    }
  }

  // =========================================================================
  // Properties
  // =========================================================================

  get isAvailable(): boolean {
    return this._client !== null && this._port !== null && !this._disposed;
  }

  get port(): number | null {
    return this._port;
  }

  /**
   * Build WebSocket URL for a specific stream
   */
  getStreamWebSocketUrl(streamId: string): string | null {
    if (!this._port) return null;
    return `ws://127.0.0.1:${this._port}/v1/streams/${streamId}`;
  }

  getPreviewBaseUrl(): string | null {
    if (!this._port) return null;
    return `http://127.0.0.1:${this._port}`;
  }

  // =========================================================================
  // Media Probing
  // =========================================================================

  /**
   * Probe a media file and return its metadata
   */
  async probeMedia(filePath: string): Promise<MediaInfo> {
    const result = await this.dispatch({
      group: 'videos',
      action: 'probe',
      options: { source: filePath },
    });

    if (result.status === 'error') {
      throw new Error(result.error?.message ?? 'Probe failed');
    }

    const data = result.data as Record<string, unknown>;
    const videoStreams = (data.videoStreams as Array<Record<string, unknown>>) ?? [];
    const audioStreams = (data.audioStreams as Array<Record<string, unknown>>) ?? [];
    const video = videoStreams[0] ?? {};
    const audio = audioStreams[0];

    return {
      duration: (data.duration as number) ?? 0,
      width: (video.width as number) ?? 0,
      height: (video.height as number) ?? 0,
      fps: (video.fps as number) ?? 0,
      codec: (video.codec as string) ?? '',
      format: (data.format as string) ?? '',
      bitrate: video.bitrate as number | undefined,
      hasAudio: audioStreams.length > 0,
      audioCodec: audio?.codec as string | undefined,
      audioSampleRate: audio?.sampleRate as number | undefined,
      audioChannels: audio?.channels as number | undefined,
      metadata: data.metadata as Record<string, string> | undefined,
      coverArt: data.coverArt as { mimeType: string; dataBase64: string } | undefined,
    };
  }

  async registerPreviewAsset(request: RegisterPreviewAssetRequest): Promise<PreviewManifest> {
    if (!this._client || this._disposed) {
      throw new Error('PreviewService not available');
    }
    return this._client.registerPreviewAsset(request);
  }

  async requestPreviewVariant(
    assetId: string,
    request: PreviewVariantRequest,
  ): Promise<PreviewVariant> {
    if (!this._client || this._disposed) {
      throw new Error('PreviewService not available');
    }
    return this._client.requestPreviewVariant(assetId, request);
  }

  async unregisterPreviewAsset(assetIdOrToken: string): Promise<void> {
    if (!this._client || this._disposed) return;
    await this._client.unregisterPreviewAsset(assetIdOrToken);
  }

  // =========================================================================
  // Video Playback Control
  // =========================================================================

  /**
   * Start video playback via H.264 stream.
   * Also starts audio stream if the media has audio tracks.
   * Does NOT track stream IDs internally — caller is responsible for lifecycle.
   */
  async startVideoPlayback(
    filePath: string,
    mediaInfo: MediaInfo,
    startTime: number = 0,
    speed: number = 1.0,
  ): Promise<{ videoStreamId: string | null; audioStreamId: string | null }> {
    // Start video stream
    const videoResult = await this.dispatch({
      group: 'videos',
      action: 'stream',
      options: {
        source: filePath,
        sessionId: `preview-${Date.now()}`,
      },
    });

    if (videoResult.status === 'error') {
      logger.error('Failed to start video playback:', videoResult.error);
      return { videoStreamId: null, audioStreamId: null };
    }

    const videoData = videoResult.data as Record<string, unknown> | undefined;
    const videoStreamId = (videoData?.streamId as string) ?? null;

    // Start audio stream if media has audio
    let audioStreamId: string | null = null;
    if (mediaInfo.hasAudio) {
      const audioResult = await this.dispatch({
        group: 'audios',
        action: 'stream',
        options: {
          source: filePath,
          sessionId: `preview-audio-${Date.now()}`,
        },
      });

      if (audioResult.status === 'error') {
        logger.warn('Failed to start audio stream:', audioResult.error);
      } else {
        const audioData = audioResult.data as Record<string, unknown> | undefined;
        audioStreamId = (audioData?.streamId as string) ?? null;
      }
    }

    // Seek to startTime if not 0
    if (startTime > 0 && videoStreamId) {
      await this.dispatch({
        group: 'videos',
        action: 'seek',
        options: { streamId: videoStreamId, time: startTime },
      });
      if (audioStreamId) {
        await this.dispatch({
          group: 'audios',
          action: 'seek',
          options: { streamId: audioStreamId, time: startTime },
        });
      }
    }

    // Set playback speed if not 1.0
    if (videoStreamId && speed !== 1.0) {
      await this.dispatch({
        group: 'videos',
        action: 'speed',
        options: { streamId: videoStreamId, speed },
      });
      if (audioStreamId) {
        await this.dispatch({
          group: 'audios',
          action: 'speed',
          options: { streamId: audioStreamId, speed },
        });
      }
    }

    return { videoStreamId, audioStreamId };
  }

  /**
   * Stop specific streams by their IDs.
   */
  async stopStreams(videoStreamId: string | null, audioStreamId: string | null): Promise<void> {
    if (audioStreamId) {
      try {
        await this.dispatch({
          group: 'audios',
          action: 'stop',
          options: { streamId: audioStreamId },
        });
      } catch {
        // Ignore stop errors
      }
    }

    if (videoStreamId) {
      try {
        await this.dispatch({
          group: 'videos',
          action: 'stop',
          options: { streamId: videoStreamId },
        });
      } catch {
        // Ignore stop errors
      }
    }
  }

  /**
   * Seek specific streams to a time.
   */
  async seekStreams(
    videoStreamId: string | null,
    audioStreamId: string | null,
    time: number,
  ): Promise<void> {
    if (videoStreamId) {
      await this.dispatch({
        group: 'videos',
        action: 'seek',
        options: { streamId: videoStreamId, time },
      });
    }
    if (audioStreamId) {
      await this.dispatch({
        group: 'audios',
        action: 'seek',
        options: { streamId: audioStreamId, time },
      });
    }
  }

  /**
   * Set speed on specific streams.
   */
  async setStreamSpeed(
    videoStreamId: string | null,
    audioStreamId: string | null,
    speed: number,
  ): Promise<void> {
    if (videoStreamId) {
      await this.dispatch({
        group: 'videos',
        action: 'speed',
        options: { streamId: videoStreamId, speed },
      });
    }
    if (audioStreamId) {
      await this.dispatch({
        group: 'audios',
        action: 'speed',
        options: { streamId: audioStreamId, speed },
      });
    }
  }

  /**
   * Pause specific streams.
   */
  async pauseStreams(videoStreamId: string | null, audioStreamId: string | null): Promise<void> {
    if (videoStreamId) {
      await this.dispatch({
        group: 'videos',
        action: 'pause',
        options: { streamId: videoStreamId },
      });
    }
    if (audioStreamId) {
      await this.dispatch({
        group: 'audios',
        action: 'pause',
        options: { streamId: audioStreamId },
      });
    }
  }

  /**
   * Resume specific streams.
   */
  async resumeStreams(videoStreamId: string | null, audioStreamId: string | null): Promise<void> {
    if (videoStreamId) {
      await this.dispatch({
        group: 'videos',
        action: 'resume',
        options: { streamId: videoStreamId },
      });
    }
    if (audioStreamId) {
      await this.dispatch({
        group: 'audios',
        action: 'resume',
        options: { streamId: audioStreamId },
      });
    }
  }

  // =========================================================================
  // Audio Operations
  // =========================================================================

  /**
   * Get waveform data for visualization.
   *
   * Engine returns multi-channel peaks at a fixed 100 peaks/sec resolution.
   * This method mixes all channels down to a single mono peaks array.
   */
  async getWaveform(
    filePath: string,
  ): Promise<{ peaks: number[]; duration: number; sampleRate: number }> {
    const result = await this.dispatch({
      group: 'audios',
      action: 'waveform',
      options: { source: filePath },
    });

    if (result.status === 'error') {
      throw new Error(result.error?.message ?? 'Waveform generation failed');
    }

    // Engine response: { resourceId, waveform: WaveformData }
    // WaveformData: { sampleRate, channels, peaksPerSecond, duration, peaks: number[][] }
    const data = result.data as Record<string, unknown>;
    const waveform = data.waveform as {
      sampleRate: number;
      channels: number;
      peaksPerSecond: number;
      duration: number;
      peaks: number[][];
    };

    // Mix multi-channel peaks down to mono (take max across channels)
    let monoPeaks: number[];
    if (waveform.peaks.length === 0) {
      monoPeaks = [];
    } else if (waveform.peaks.length === 1) {
      monoPeaks = waveform.peaks[0] ?? [];
    } else {
      const len = waveform.peaks[0]?.length ?? 0;
      monoPeaks = new Array<number>(len);
      for (let i = 0; i < len; i++) {
        let max = 0;
        for (const ch of waveform.peaks) {
          const v = Math.abs(ch[i] ?? 0);
          if (v > max) max = v;
        }
        monoPeaks[i] = max;
      }
    }

    return {
      peaks: monoPeaks,
      duration: waveform.duration,
      sampleRate: waveform.sampleRate,
    };
  }

  /**
   * Capture a single video frame as JPEG
   */
  async captureFrame(filePath: string, time: number, quality: number = 80): Promise<string> {
    const result = await this.dispatch({
      group: 'videos',
      action: 'capture',
      options: {
        source: filePath,
        time,
        quality,
        format: 'jpeg',
      },
    });

    if (result.status === 'error') {
      throw new Error(result.error?.message ?? 'Frame capture failed');
    }

    const data = result.data as Record<string, unknown> | undefined;
    return (data?.data as string) ?? '';
  }

  // =========================================================================
  // Dispatch
  // =========================================================================

  async dispatch(request: ActionRequest): Promise<ActionResponse> {
    if (!this._client || this._disposed) {
      throw new Error('PreviewService not available');
    }

    // Merge legacy top-level fields into options
    const options: Record<string, unknown> = { ...request.options };
    if (request.source !== undefined) options.source = request.source;
    if (request.sessionId !== undefined) options.sessionId = request.sessionId;
    if (request.streamId !== undefined) options.streamId = request.streamId;

    return this._client.dispatch({
      group: request.group,
      action: request.action,
      id: request.id,
      options: Object.keys(options).length > 0 ? options : undefined,
      body: request.body,
    });
  }

  // =========================================================================
  // Disposal
  // =========================================================================

  async dispose(): Promise<void> {
    if (this._disposed) return;
    this._disposed = true;

    // No need to stop Frame Server — managed by neko-engine extension
    this._client = null;
    this._port = null;
    logger.info('PreviewService disposed');
  }
}
