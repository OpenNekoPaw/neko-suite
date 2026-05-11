/**
 * AudioService - Audio editing orchestration service
 *
 * Connects to neko-engine via EngineClient (HTTP) for:
 * - Audio probing (metadata extraction)
 * - Waveform data generation
 * - Audio streaming (PCM playback)
 * - Audio transcoding (trim, effects, export)
 * - Loudness analysis
 * - Silence detection
 *
 * Architecture:
 * AudioService → EngineClient (HTTP) → neko-engine Frame Server → Rust EngineApi
 */

import * as vscode from 'vscode';
import { EngineClient } from '@neko/neko-client';

import { getLogger } from '../utils/logger';
import type { AudioInfo, WaveformData } from '../types/api';

const logger = getLogger('AudioService');

const ENGINE_EXTENSION_ID = 'neko.neko-engine';

// =============================================================================
// AudioService
// =============================================================================

export class AudioService implements vscode.Disposable {
  private _client: EngineClient | null = null;
  private _port: number | null = null;
  private _disposed = false;

  /**
   * Try to create an AudioService instance.
   * Returns null if engine connection fails.
   */
  static async tryCreate(): Promise<AudioService | null> {
    const service = new AudioService();
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

      const ext = vscode.extensions.getExtension(ENGINE_EXTENSION_ID);
      if (!ext) {
        logger.error(`Extension ${ENGINE_EXTENSION_ID} not installed`);
        return false;
      }

      if (!ext.isActive) {
        await ext.activate();
      }

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

  getStreamWebSocketUrl(streamId: string): string | null {
    if (!this._port) return null;
    return `ws://127.0.0.1:${this._port}/v1/streams/${streamId}`;
  }

  // =========================================================================
  // Audio Probing
  // =========================================================================

  async probeAudio(filePath: string): Promise<AudioInfo> {
    if (!this._client) throw new Error('AudioService not available');
    const probe = await this._client.probe('videos', filePath);
    return {
      duration: probe.duration,
      codec: probe.audioCodec ?? '',
      sampleRate: probe.audioSampleRate ?? 0,
      channels: probe.audioChannels ?? 0,
      bitrate: probe.audioBitrate,
      format: probe.format,
    };
  }

  // =========================================================================
  // Waveform
  // =========================================================================

  async getWaveform(filePath: string): Promise<WaveformData> {
    if (!this._client) throw new Error('AudioService not available');
    const wf = await this._client.waveform(filePath);
    return {
      peaks: wf.peaks,
      duration: wf.duration,
      sampleRate: wf.sampleRate,
    };
  }

  // =========================================================================
  // Audio Streaming
  // =========================================================================

  async startStream(filePath: string): Promise<{ streamId: string; streamUrl: string } | null> {
    if (!this._client) return null;
    try {
      const handle = await this._client.createStream('audios', filePath, {
        sessionId: `audio-editor-${Date.now()}`,
      });
      return { streamId: handle.streamId, streamUrl: handle.wsUrl };
    } catch (error) {
      logger.error('Failed to start audio stream:', error);
      return null;
    }
  }

  async stopStream(streamId: string): Promise<void> {
    if (!this._client) return;
    try {
      await this._client.controlStream('audios', streamId, 'stop');
    } catch {
      // Ignore stop errors
    }
  }

  async seekStream(streamId: string, time: number): Promise<void> {
    if (!this._client) return;
    await this._client.controlStream('audios', streamId, 'seek', { time });
  }

  async pauseStream(streamId: string): Promise<void> {
    if (!this._client) return;
    await this._client.controlStream('audios', streamId, 'pause');
  }

  async resumeStream(streamId: string): Promise<void> {
    if (!this._client) return;
    await this._client.controlStream('audios', streamId, 'resume');
  }

  async setStreamSpeed(streamId: string, speed: number): Promise<void> {
    if (!this._client) return;
    await this._client.controlStream('audios', streamId, 'speed', { speed });
  }

  // =========================================================================
  // Mix Stream (Multi-Track Playback)
  // =========================================================================

  async startMixStream(
    config: Record<string, unknown>,
  ): Promise<{ streamId: string; streamUrl: string } | null> {
    if (!this._client) return null;
    try {
      const result = await this._client.dispatch({
        group: 'audios',
        action: 'mix_stream',
        options: {
          config,
          sessionId: `mix-stream-${Date.now()}`,
        },
      });

      if (result.status === 'error') {
        logger.error('Failed to start mix stream:', result.error);
        return null;
      }

      const data = result.data as Record<string, unknown> | undefined;
      const streamId = (data?.streamId as string) ?? '';
      const streamUrl = this._client.getStreamWsUrl(streamId);
      return { streamId, streamUrl };
    } catch (error) {
      logger.error('Failed to start mix stream:', error);
      return null;
    }
  }

  async mixExport(
    config: Record<string, unknown>,
    outputPath: string,
    format?: string,
    bitrate?: number,
  ): Promise<{ output: string }> {
    if (!this._client) throw new Error('AudioService not available');
    const result = await this._client.dispatch({
      group: 'audios',
      action: 'mix_export',
      options: {
        config,
        output: outputPath,
        ...(format && { format }),
        ...(bitrate && { bitrate }),
      },
    });

    if (result.status === 'error') {
      throw new Error(result.error?.message ?? 'Mix export failed');
    }

    const data = result.data as Record<string, unknown> | undefined;
    return { output: (data?.output as string) ?? outputPath };
  }

  // =========================================================================
  // Transcoding (Trim, Effects, Export)
  // =========================================================================

  async transcode(
    filePath: string,
    outputPath: string,
    options?: {
      startTime?: number;
      endTime?: number;
      format?: string;
      quality?: number;
      sampleRate?: number;
      bitrate?: number;
      channels?: number;
      effects?: Array<Record<string, unknown>>;
    },
  ): Promise<string> {
    if (!this._client) throw new Error('AudioService not available');
    const result = await this._client.dispatch({
      group: 'audios',
      action: 'transcode',
      options: {
        source: filePath,
        output: outputPath,
        ...options,
      },
    });

    if (result.status === 'error') {
      throw new Error(result.error?.message ?? 'Transcode failed');
    }

    const data = result.data as Record<string, unknown> | undefined;
    return (data?.output as string) ?? outputPath;
  }

  // =========================================================================
  // Analysis
  // =========================================================================

  async analyzeLoudness(
    filePath: string,
  ): Promise<{ integratedLoudness: number; truePeak: number; loudnessRange: number }> {
    if (!this._client) throw new Error('AudioService not available');
    const result = await this._client.analyzeLoudness(filePath);
    return {
      integratedLoudness: result.integratedLufs ?? -23,
      truePeak: result.truePeakDbfs ?? 0,
      loudnessRange: result.loudnessRange ?? 0,
    };
  }

  async detectSilence(
    filePath: string,
    threshold?: number,
    minDuration?: number,
  ): Promise<Array<{ start: number; end: number }>> {
    if (!this._client) throw new Error('AudioService not available');
    const result = await this._client.detectSilence(filePath, threshold, minDuration);
    return result.regions;
  }

  // =========================================================================
  // Audio Input / Recording (engine-proxy)
  // =========================================================================

  async listInputDevices(): Promise<
    Array<{
      id: string;
      name: string;
      sampleRates: number[];
      channels: number[];
      isDefault: boolean;
    }>
  > {
    if (!this._client) throw new Error('AudioService not available');
    return this._client.listInputDevices();
  }

  async recordStart(options: {
    outputPath: string;
    deviceId?: string;
    sampleRate?: number;
    channels?: number;
  }): Promise<{ streamId: string; monitorUrl: string }> {
    if (!this._client) throw new Error('AudioService not available');
    return this._client.recordStart(options);
  }

  async recordStop(streamId: string): Promise<{
    path: string;
    durationSeconds: number;
    format: string;
    sampleRate: number;
    channels: number;
  }> {
    if (!this._client) throw new Error('AudioService not available');
    return this._client.recordStop(streamId);
  }

  // =========================================================================
  // Disposal
  // =========================================================================

  async dispose(): Promise<void> {
    if (this._disposed) return;
    this._disposed = true;

    this._client = null;
    this._port = null;
    logger.info('AudioService disposed');
  }
}
