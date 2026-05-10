/**
 * AudioToolBridge — Bridges agent tool calls to AudioService + active webview postMessage.
 */

import type { AudioService } from './AudioService';
import type { AudioProjectProvider } from '../providers/AudioProjectProvider';
import { getLogger } from '../utils/logger';

const logger = getLogger('AudioToolBridge');

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export class AudioToolBridge {
  constructor(
    private readonly audioService: AudioService,
    private readonly getProjectProvider: () => AudioProjectProvider | null,
  ) {}

  async getProjectInfo(): Promise<ToolResult> {
    const provider = this.getProjectProvider();
    if (!provider) return { success: false, error: 'No audio project open' };
    const data = provider.getProjectData();
    if (!data) return { success: false, error: 'No project data loaded' };
    return {
      success: true,
      data: {
        name: data.name,
        version: data.version,
        sampleRate: data.sampleRate,
        channels: data.channels,
        bpm: data.bpm,
        trackCount: data.tracks.length,
        masterVolume: data.masterVolume ?? 1.0,
        markerCount: data.markers.length,
        masterEffectCount: data.masterEffectsChain.length,
      },
    };
  }

  async listTracks(): Promise<ToolResult> {
    const provider = this.getProjectProvider();
    if (!provider) return { success: false, error: 'No audio project open' };
    const data = provider.getProjectData();
    if (!data) return { success: false, error: 'No project data loaded' };
    return {
      success: true,
      data: data.tracks.map((t) => ({
        id: t.id,
        name: t.name,
        type: t.type,
        muted: t.muted,
        locked: t.locked,
        elementCount: t.elements.length,
      })),
    };
  }

  async addTrack(args: Record<string, unknown>): Promise<ToolResult> {
    const provider = this.getProjectProvider();
    if (!provider) return { success: false, error: 'No audio project open' };
    provider.postMessage({
      type: 'agent:addTrack',
      name: (args.name as string) ?? 'New Track',
      trackType: (args.trackType as string) ?? 'audio',
    });
    return { success: true, data: { message: 'Track add request sent' } };
  }

  async removeTrack(args: Record<string, unknown>): Promise<ToolResult> {
    const trackId = args.trackId as string;
    if (!trackId) return { success: false, error: 'trackId required' };
    const provider = this.getProjectProvider();
    if (!provider) return { success: false, error: 'No audio project open' };
    provider.postMessage({ type: 'agent:removeTrack', trackId });
    return { success: true, data: { message: 'Track removal request sent' } };
  }

  async setTrackVolume(args: Record<string, unknown>): Promise<ToolResult> {
    const trackId = args.trackId as string;
    const volume = args.volume as number;
    if (!trackId || volume === undefined)
      return { success: false, error: 'trackId and volume required' };
    const provider = this.getProjectProvider();
    if (!provider) return { success: false, error: 'No audio project open' };
    provider.postMessage({ type: 'agent:setTrackVolume', trackId, volume });
    return { success: true };
  }

  async setTrackPan(args: Record<string, unknown>): Promise<ToolResult> {
    const trackId = args.trackId as string;
    const pan = args.pan as number;
    if (!trackId || pan === undefined) return { success: false, error: 'trackId and pan required' };
    const provider = this.getProjectProvider();
    if (!provider) return { success: false, error: 'No audio project open' };
    provider.postMessage({ type: 'agent:setTrackPan', trackId, pan });
    return { success: true };
  }

  async importAudio(args: Record<string, unknown>): Promise<ToolResult> {
    const filePath = args.filePath as string;
    const trackId = args.trackId as string;
    if (!filePath) return { success: false, error: 'filePath required' };
    const provider = this.getProjectProvider();
    if (!provider) return { success: false, error: 'No audio project open' };
    provider.postMessage({ type: 'agent:importAudio', filePath, trackId: trackId ?? undefined });
    return { success: true, data: { message: 'Import request sent' } };
  }

  async mixExport(args: Record<string, unknown>): Promise<ToolResult> {
    const outputPath = args.outputPath as string;
    const format = (args.format as string) ?? 'wav';
    if (!outputPath) return { success: false, error: 'outputPath required' };

    try {
      const config = (args.config ?? {}) as Record<string, unknown>;
      const result = await this.audioService.mixExport(config, outputPath, format);
      return { success: true, data: result };
    } catch (e) {
      logger.error('mixExport failed', e);
      return { success: false, error: String(e) };
    }
  }

  async analyzeLoudness(args: Record<string, unknown>): Promise<ToolResult> {
    const filePath = args.filePath as string;
    if (!filePath) return { success: false, error: 'filePath required' };
    try {
      const result = await this.audioService.analyzeLoudness(filePath);
      return { success: true, data: result };
    } catch (e) {
      return { success: false, error: String(e) };
    }
  }

  async executeAgentTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
    switch (toolName) {
      case 'GetAudioProjectInfo':
        return this.getProjectInfo();
      case 'ListAudioTracks':
        return this.listTracks();
      case 'AddAudioTrack':
        return this.addTrack(args);
      case 'RemoveAudioTrack':
        return this.removeTrack(args);
      case 'ImportAudio':
        return this.importAudio(args);
      case 'SetTrackVolume':
        return this.setTrackVolume(args);
      case 'SetTrackPan':
        return this.setTrackPan(args);
      case 'MixExport':
        return this.mixExport(args);
      case 'AnalyzeAudioLoudness':
        return this.analyzeLoudness(args);
      default:
        return { success: false, error: `Unknown audio tool: ${toolName}` };
    }
  }
}
