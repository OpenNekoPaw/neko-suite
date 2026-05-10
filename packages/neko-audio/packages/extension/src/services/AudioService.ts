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
import type { ActionResponse } from '@neko/neko-client';
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
    const result = await this.dispatch({
      group: 'videos',
      action: 'probe',
      options: { source: filePath },
    });

    if (result.status === 'error') {
      throw new Error(result.error?.message ?? 'Probe failed');
    }

    const data = result.data as Record<string, unknown>;
    const audioStreams = (data.audioStreams as Array<Record<string, unknown>>) ?? [];
    const audio = audioStreams[0] ?? {};

    return {
      duration: (data.duration as number) ?? 0,
      codec: (audio.codec as string) ?? '',
      sampleRate: (audio.sampleRate as number) ?? 0,
      channels: (audio.channels as number) ?? 0,
      bitrate: audio.bitrate as number | undefined,
      format: (data.format as string) ?? '',
    };
  }

  // =========================================================================
  // Waveform
  // =========================================================================

  async getWaveform(filePath: string): Promise<WaveformData> {
    const result = await this.dispatch({
      group: 'audios',
      action: 'waveform',
      options: { source: filePath },
    });

    if (result.status === 'error') {
      throw new Error(result.error?.message ?? 'Waveform generation failed');
    }

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

  // =========================================================================
  // Audio Streaming
  // =========================================================================

  async startStream(filePath: string): Promise<{ streamId: string; streamUrl: string } | null> {
    const result = await this.dispatch({
      group: 'audios',
      action: 'stream',
      options: {
        source: filePath,
        sessionId: `audio-editor-${Date.now()}`,
      },
    });

    if (result.status === 'error') {
      logger.error('Failed to start audio stream:', result.error);
      return null;
    }

    const data = result.data as Record<string, unknown> | undefined;
    const streamId = (data?.streamId as string) ?? '';
    const streamUrl = this.getStreamWebSocketUrl(streamId);

    if (!streamUrl) return null;
    return { streamId, streamUrl };
  }

  async stopStream(streamId: string): Promise<void> {
    try {
      await this.dispatch({
        group: 'audios',
        action: 'stop',
        options: { streamId },
      });
    } catch {
      // Ignore stop errors
    }
  }

  async seekStream(streamId: string, time: number): Promise<void> {
    await this.dispatch({
      group: 'audios',
      action: 'seek',
      options: { streamId, time },
    });
  }

  async pauseStream(streamId: string): Promise<void> {
    await this.dispatch({
      group: 'audios',
      action: 'pause',
      options: { streamId },
    });
  }

  async resumeStream(streamId: string): Promise<void> {
    await this.dispatch({
      group: 'audios',
      action: 'resume',
      options: { streamId },
    });
  }

  async setStreamSpeed(streamId: string, speed: number): Promise<void> {
    await this.dispatch({
      group: 'audios',
      action: 'speed',
      options: { streamId, speed },
    });
  }

  // =========================================================================
  // Mix Stream (Multi-Track Playback)
  // =========================================================================

  async startMixStream(
    config: Record<string, unknown>,
  ): Promise<{ streamId: string; streamUrl: string } | null> {
    const result = await this.dispatch({
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
    const streamUrl = this.getStreamWebSocketUrl(streamId);

    if (!streamUrl) return null;
    return { streamId, streamUrl };
  }

  async mixExport(
    config: Record<string, unknown>,
    outputPath: string,
    format?: string,
    bitrate?: number,
  ): Promise<{ output: string }> {
    const result = await this.dispatch({
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
    const result = await this.dispatch({
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
    const result = await this.dispatch({
      group: 'audios',
      action: 'loudness',
      options: { source: filePath },
    });

    if (result.status === 'error') {
      throw new Error(result.error?.message ?? 'Loudness analysis failed');
    }

    const data = result.data as Record<string, unknown>;
    return {
      integratedLoudness: (data.integratedLoudness as number) ?? -23,
      truePeak: (data.truePeak as number) ?? 0,
      loudnessRange: (data.loudnessRange as number) ?? 0,
    };
  }

  async detectSilence(
    filePath: string,
    threshold?: number,
    minDuration?: number,
  ): Promise<Array<{ start: number; end: number }>> {
    const result = await this.dispatch({
      group: 'audios',
      action: 'silence',
      options: {
        source: filePath,
        ...(threshold !== undefined && { threshold }),
        ...(minDuration !== undefined && { minDuration }),
      },
    });

    if (result.status === 'error') {
      throw new Error(result.error?.message ?? 'Silence detection failed');
    }

    const data = result.data as Record<string, unknown>;
    return (data.regions as Array<{ start: number; end: number }>) ?? [];
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
  // Dispatch
  // =========================================================================

  private async dispatch(request: {
    group: string;
    action: string;
    options?: Record<string, unknown>;
  }): Promise<ActionResponse> {
    if (!this._client || this._disposed) {
      throw new Error('AudioService not available');
    }

    return this._client.dispatch({
      group: request.group,
      action: request.action,
      options: request.options,
    });
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
