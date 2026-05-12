/**
 * AudioToolBridge — Executes Agent audio tools in the Extension process.
 */

import * as path from 'path';
import type {
  AudioEffectConfig,
  AudioEffectSnapshot,
  AudioProjectData,
  TimelineTrack,
  TrackType,
} from '@neko/shared';
import {
  generateId,
  isPlannedAudioEffectType,
  normalizeAudioEffectType,
  normalizeRenderableAudioEffectType,
  TOOL_NAMES_AUDIO,
} from '@neko/shared';
import type { AudioService } from './AudioService';
import type {
  AudioProjectEditOperation,
  AudioProjectSessionGateway,
  ProjectSession,
} from './audioProjectSessionGateway';
import { getLogger } from '../utils/logger';
import { createDefaultAudioElement } from '../utils/audioElementFactory';

const logger = getLogger('AudioToolBridge');

type ToolArgs = Record<string, unknown>;

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

export class AudioToolBridge {
  constructor(
    private readonly gateway: AudioProjectSessionGateway,
    private readonly audioService: AudioService,
  ) {}

  async getProjectInfo(args: ToolArgs = {}): Promise<ToolResult> {
    return this.withSession(args, async (session) => {
      const data = session.projectData;
      return {
        name: data.name,
        documentUri: session.documentUri,
        version: data.version,
        sampleRate: data.sampleRate,
        channels: data.channels,
        bpm: data.bpm,
        trackCount: data.tracks.length,
        masterVolume: data.masterVolume ?? 1.0,
        markerCount: data.markers.length,
        masterEffectCount: data.masterEffectsChain.length,
      };
    });
  }

  async listTracks(args: ToolArgs = {}): Promise<ToolResult> {
    return this.withSession(args, async (session) => ({
      documentUri: session.documentUri,
      tracks: session.projectData.tracks.map((track) => {
        const mix = session.projectData.trackMix?.[track.id];
        return {
          id: track.id,
          name: track.name,
          type: track.type,
          muted: track.muted,
          locked: track.locked,
          hidden: track.hidden,
          solo: mix?.solo ?? false,
          volume: mix?.volume ?? 1,
          pan: mix?.pan ?? 0,
          effectCount: mix?.effectChain.length ?? 0,
          elementCount: track.elements.length,
        };
      }),
    }));
  }

  async addTrack(args: ToolArgs): Promise<ToolResult> {
    return this.applyProjectOperation(args, (session) => {
      const trackId = this.optionalString(args.trackId) ?? generateId();
      const track: TimelineTrack = {
        id: trackId,
        name: this.optionalString(args.name) ?? 'New Track',
        type: this.parseTrackType(args.trackType),
        elements: [],
        muted: false,
        locked: false,
        hidden: false,
        isMain: session.projectData.tracks.length === 0,
      };
      return {
        operation: {
          type: 'track.add',
          meta: this.createMeta('Add audio track'),
          payload: { track },
        },
        data: { trackId },
      };
    });
  }

  async removeTrack(args: ToolArgs): Promise<ToolResult> {
    const trackId = this.requiredString(args.trackId, 'trackId');
    if (!trackId.ok) return trackId.result;

    return this.applyProjectOperation(args, (session) => {
      const index = session.projectData.tracks.findIndex((track) => track.id === trackId.value);
      if (index < 0) {
        throw new Error(`Track not found: ${trackId.value}`);
      }
      return {
        operation: {
          type: 'track.remove',
          meta: this.createMeta('Remove audio track'),
          payload: { trackId: trackId.value },
          before: { track: session.projectData.tracks[index]!, index },
        },
      };
    });
  }

  async setTrackVolume(args: ToolArgs): Promise<ToolResult> {
    const trackId = this.requiredString(args.trackId, 'trackId');
    if (!trackId.ok) return trackId.result;
    const volume = this.requiredNumber(args.volume, 'volume');
    if (!volume.ok) return volume.result;

    return this.applyProjectOperation(args, (session) => ({
      operation: {
        type: 'track.mix.setVolume',
        meta: this.createMeta('Set track volume'),
        payload: { trackId: trackId.value, volume: volume.value },
        before: { volume: this.getTrackMix(session.projectData, trackId.value).volume },
      },
    }));
  }

  async setTrackPan(args: ToolArgs): Promise<ToolResult> {
    const trackId = this.requiredString(args.trackId, 'trackId');
    if (!trackId.ok) return trackId.result;
    const pan = this.requiredNumber(args.pan, 'pan');
    if (!pan.ok) return pan.result;

    return this.applyProjectOperation(args, (session) => ({
      operation: {
        type: 'track.mix.setPan',
        meta: this.createMeta('Set track pan'),
        payload: { trackId: trackId.value, pan: pan.value },
        before: { pan: this.getTrackMix(session.projectData, trackId.value).pan },
      },
    }));
  }

  async setTrackProperties(args: ToolArgs): Promise<ToolResult> {
    const trackId = this.requiredString(args.trackId, 'trackId');
    if (!trackId.ok) return trackId.result;

    return this.applyProjectOperation(args, (session) => {
      const track = this.findTrack(session.projectData, trackId.value);
      const updates = this.pickTrackUpdates(args);
      if (Object.keys(updates).length === 0) {
        throw new Error('At least one track property update is required');
      }

      return {
        operation: {
          type: 'track.update',
          meta: this.createMeta('Set track properties'),
          payload: { trackId: trackId.value, updates },
          before: { updates: this.pickBefore(track, updates) },
        },
      };
    });
  }

  async importAudio(args: ToolArgs): Promise<ToolResult> {
    const filePath = this.requiredString(args.filePath, 'filePath');
    if (!filePath.ok) return filePath.result;

    return this.applyProjectOperation(args, async (session) => {
      const audioInfo = await this.audioService.probeAudio(filePath.value);
      const trackId = this.optionalString(args.trackId) ?? generateId();
      const existingTrack = session.projectData.tracks.find((track) => track.id === trackId);
      const element = createDefaultAudioElement({
        filePath: filePath.value,
        duration: audioInfo.duration,
      });

      if (existingTrack) {
        return {
          operation: {
            type: 'element.add',
            meta: this.createMeta('Import audio'),
            payload: { trackId, element },
          },
          data: { trackId, elementId: element.id },
        };
      }

      const track: TimelineTrack = {
        id: trackId,
        name:
          this.optionalString(args.name) ??
          path.basename(filePath.value, path.extname(filePath.value)),
        type: 'audio',
        elements: [element],
        muted: false,
        locked: false,
        hidden: false,
        isMain: session.projectData.tracks.length === 0,
      };
      return {
        operation: {
          type: 'track.add',
          meta: this.createMeta('Import audio'),
          payload: { track },
        },
        data: { trackId, elementId: element.id },
      };
    });
  }

  async applyTrackEffect(args: ToolArgs): Promise<ToolResult> {
    const trackId = this.requiredString(args.trackId, 'trackId');
    if (!trackId.ok) return trackId.result;
    const effect = this.createRenderableEffect(args);
    if (!effect.ok) return effect.result;

    return this.applyProjectOperation(args, (session) => {
      const mix = this.getTrackMix(session.projectData, trackId.value);
      return {
        operation: {
          type: 'track.mix.effect.add',
          meta: this.createMeta('Apply track effect'),
          payload: {
            trackId: trackId.value,
            effect: effect.value,
            index: this.optionalNumber(args.index) ?? mix.effectChain.length,
          },
        },
        data: { effectId: effect.value.id },
      };
    });
  }

  async removeTrackEffect(args: ToolArgs): Promise<ToolResult> {
    const trackId = this.requiredString(args.trackId, 'trackId');
    if (!trackId.ok) return trackId.result;
    const effectId = this.requiredString(args.effectId, 'effectId');
    if (!effectId.ok) return effectId.result;

    return this.applyProjectOperation(args, (session) => {
      const mix = this.getTrackMix(session.projectData, trackId.value);
      const index = mix.effectChain.findIndex((effect) => effect.id === effectId.value);
      if (index < 0) {
        throw new Error(`Track effect not found: ${effectId.value}`);
      }
      return {
        operation: {
          type: 'track.mix.effect.remove',
          meta: this.createMeta('Remove track effect'),
          payload: { trackId: trackId.value, effectId: effectId.value },
          before: { effect: mix.effectChain[index]!, index },
        },
      };
    });
  }

  async applyMasterEffect(args: ToolArgs): Promise<ToolResult> {
    const effect = this.createMasterEffect(args);
    if (!effect.ok) return effect.result;

    return this.applyProjectOperation(args, () => ({
      operation: {
        type: 'audio.effect.add',
        meta: this.createMeta('Apply master effect'),
        payload: {
          effect: effect.value,
          index: this.optionalNumber(args.index),
        },
      },
      data: { effectId: effect.value.id },
    }));
  }

  async mixExport(args: ToolArgs): Promise<ToolResult> {
    const outputPath = this.requiredString(args.outputPath, 'outputPath');
    if (!outputPath.ok) return outputPath.result;

    try {
      const session = await this.resolveSession(args);
      if (!session) return this.noProjectResult();
      const mix = await this.gateway.buildMixConfig(session);
      const result = await this.audioService.mixExport(
        mix.config,
        outputPath.value,
        this.optionalString(args.format),
        this.optionalNumber(args.bitrate),
      );
      return {
        success: true,
        data: {
          output: result.output,
          warnings: [...mix.warnings.map((warning) => warning.message), ...result.warnings],
          documentUri: session.documentUri,
        },
      };
    } catch (error) {
      logger.error('mixExport failed', error);
      return { success: false, error: this.toErrorMessage(error) };
    }
  }

  async analyzeLoudness(args: ToolArgs): Promise<ToolResult> {
    const filePath = this.requiredString(args.filePath, 'filePath');
    if (!filePath.ok) return filePath.result;
    try {
      const result = await this.audioService.analyzeLoudness(filePath.value);
      return { success: true, data: result };
    } catch (error) {
      return { success: false, error: this.toErrorMessage(error) };
    }
  }

  async audioDenoise(args: ToolArgs): Promise<ToolResult> {
    const inputPath = this.requiredString(args.inputPath ?? args.filePath, 'inputPath');
    if (!inputPath.ok) return inputPath.result;
    const outputPath = this.requiredString(args.outputPath, 'outputPath');
    if (!outputPath.ok) return outputPath.result;

    try {
      const output = await this.audioService.transcode(inputPath.value, outputPath.value, {
        effects: [
          {
            id: generateId(),
            effectType: 'noise-gate',
            enabled: true,
            params: { threshold: -40, attack: 1, hold: 50, release: 100 },
          },
        ],
      });
      return {
        success: true,
        data: {
          output,
          note: 'Applied noise-gate threshold cleanup. Spectral denoise is not available yet.',
        },
      };
    } catch (error) {
      return { success: false, error: this.toErrorMessage(error) };
    }
  }

  async stemSeparation(): Promise<ToolResult> {
    return {
      success: false,
      error: 'Stem separation requires an Engine ML model that is not available yet',
    };
  }

  async executeAgentTool(toolName: string, args: ToolArgs): Promise<ToolResult> {
    switch (toolName) {
      case TOOL_NAMES_AUDIO.GET_AUDIO_PROJECT_INFO:
        return this.getProjectInfo(args);
      case TOOL_NAMES_AUDIO.LIST_AUDIO_TRACKS:
        return this.listTracks(args);
      case TOOL_NAMES_AUDIO.ADD_AUDIO_TRACK:
        return this.addTrack(args);
      case TOOL_NAMES_AUDIO.REMOVE_AUDIO_TRACK:
        return this.removeTrack(args);
      case TOOL_NAMES_AUDIO.SET_TRACK_PROPERTIES:
        return this.setTrackProperties(args);
      case TOOL_NAMES_AUDIO.IMPORT_AUDIO:
        return this.importAudio(args);
      case TOOL_NAMES_AUDIO.SET_TRACK_VOLUME:
        return this.setTrackVolume(args);
      case TOOL_NAMES_AUDIO.SET_TRACK_PAN:
        return this.setTrackPan(args);
      case TOOL_NAMES_AUDIO.APPLY_TRACK_EFFECT:
        return this.applyTrackEffect(args);
      case TOOL_NAMES_AUDIO.REMOVE_TRACK_EFFECT:
        return this.removeTrackEffect(args);
      case TOOL_NAMES_AUDIO.APPLY_MASTER_EFFECT:
        return this.applyMasterEffect(args);
      case TOOL_NAMES_AUDIO.MIX_EXPORT:
        return this.mixExport(args);
      case TOOL_NAMES_AUDIO.ANALYZE_AUDIO_LOUDNESS:
        return this.analyzeLoudness(args);
      case TOOL_NAMES_AUDIO.AUDIO_DENOISE:
        return this.audioDenoise(args);
      case TOOL_NAMES_AUDIO.STEM_SEPARATION:
        return this.stemSeparation();
      default:
        return { success: false, error: `Unknown audio tool: ${toolName}` };
    }
  }

  private async withSession(
    args: ToolArgs,
    fn: (session: ProjectSession) => Promise<unknown> | unknown,
  ): Promise<ToolResult> {
    try {
      const session = await this.resolveSession(args);
      if (!session) return this.noProjectResult();
      return { success: true, data: await fn(session) };
    } catch (error) {
      return { success: false, error: this.toErrorMessage(error) };
    }
  }

  private async applyProjectOperation(
    args: ToolArgs,
    createOperation: (
      session: ProjectSession,
    ) =>
      | { operation: AudioProjectEditOperation; data?: Record<string, unknown> }
      | Promise<{ operation: AudioProjectEditOperation; data?: Record<string, unknown> }>,
  ): Promise<ToolResult> {
    try {
      const session = await this.resolveSession(args);
      if (!session) return this.noProjectResult();
      const { operation, data } = await createOperation(session);
      const updated = await this.gateway.applyOperation(session, operation);
      return {
        success: true,
        data: {
          documentUri: updated.documentUri,
          operation,
          ...data,
        },
      };
    } catch (error) {
      return { success: false, error: this.toErrorMessage(error) };
    }
  }

  private async resolveSession(args: ToolArgs): Promise<ProjectSession | null> {
    return this.gateway.resolveSession(this.optionalString(args.documentUri));
  }

  private noProjectResult(): ToolResult {
    return { success: false, error: 'No audio project open' };
  }

  private createMeta(description: string) {
    return {
      id: generateId(),
      timestamp: Date.now(),
      source: 'ai' as const,
      description,
    };
  }

  private createRenderableEffect(
    args: ToolArgs,
  ): { ok: true; value: AudioEffectConfig } | { ok: false; result: ToolResult } {
    const raw = this.requiredString(args.effectType, 'effectType');
    if (!raw.ok) return { ok: false, result: raw.result };
    const normalized = normalizeAudioEffectType(raw.value);
    if (normalized && isPlannedAudioEffectType(normalized)) {
      return {
        ok: false,
        result: {
          success: false,
          error: `Effect "${normalized}" is planned but not currently renderable`,
        },
      };
    }

    const effectType = normalizeRenderableAudioEffectType(raw.value);
    if (!effectType) {
      return {
        ok: false,
        result: { success: false, error: `Unsupported audio effect: ${raw.value}` },
      };
    }

    return {
      ok: true,
      value: {
        id: this.optionalString(args.effectId) ?? generateId(),
        effectType,
        enabled: this.optionalBoolean(args.enabled) ?? true,
        params: this.objectParam(args.params),
      },
    };
  }

  private createMasterEffect(
    args: ToolArgs,
  ): { ok: true; value: AudioEffectSnapshot } | { ok: false; result: ToolResult } {
    const renderable = this.createRenderableEffect(args);
    if (!renderable.ok) return renderable;
    return {
      ok: true,
      value: {
        id: renderable.value.id,
        type: renderable.value.effectType,
        name: this.optionalString(args.name) ?? renderable.value.effectType,
        enabled: renderable.value.enabled,
        params: renderable.value.params,
      },
    };
  }

  private getTrackMix(data: AudioProjectData, trackId: string) {
    this.findTrack(data, trackId);
    return (
      data.trackMix?.[trackId] ?? {
        volume: 1,
        pan: 0,
        solo: false,
        effectChain: [],
      }
    );
  }

  private findTrack(data: AudioProjectData, trackId: string): TimelineTrack {
    const track = data.tracks.find((item) => item.id === trackId);
    if (!track) throw new Error(`Track not found: ${trackId}`);
    return track;
  }

  private pickTrackUpdates(args: ToolArgs): Partial<Omit<TimelineTrack, 'id' | 'elements'>> {
    const updates: Partial<Omit<TimelineTrack, 'id' | 'elements'>> = {};
    const name = this.optionalString(args.name);
    if (name !== undefined) updates.name = name;
    const type = this.optionalString(args.trackType ?? args.type);
    if (type !== undefined) updates.type = this.parseTrackType(type);
    const muted = this.optionalBoolean(args.muted);
    if (muted !== undefined) updates.muted = muted;
    const locked = this.optionalBoolean(args.locked);
    if (locked !== undefined) updates.locked = locked;
    const hidden = this.optionalBoolean(args.hidden);
    if (hidden !== undefined) updates.hidden = hidden;
    const isMain = this.optionalBoolean(args.isMain);
    if (isMain !== undefined) updates.isMain = isMain;
    return updates;
  }

  private pickBefore(
    track: TimelineTrack,
    updates: Partial<Omit<TimelineTrack, 'id' | 'elements'>>,
  ): Partial<Omit<TimelineTrack, 'id' | 'elements'>> {
    const before: Partial<Omit<TimelineTrack, 'id' | 'elements'>> = {};
    for (const key of Object.keys(updates) as Array<keyof typeof updates>) {
      before[key] = track[key] as never;
    }
    return before;
  }

  private parseTrackType(value: unknown): TrackType {
    const type = typeof value === 'string' ? value : 'audio';
    if (type !== 'audio') {
      throw new Error(`Unsupported audio project track type: ${type}`);
    }
    return type;
  }

  private requiredString(
    value: unknown,
    name: string,
  ): { ok: true; value: string } | { ok: false; result: ToolResult } {
    if (typeof value === 'string' && value.length > 0) return { ok: true, value };
    return { ok: false, result: { success: false, error: `${name} required` } };
  }

  private requiredNumber(
    value: unknown,
    name: string,
  ): { ok: true; value: number } | { ok: false; result: ToolResult } {
    if (typeof value === 'number' && Number.isFinite(value)) return { ok: true, value };
    return { ok: false, result: { success: false, error: `${name} required` } };
  }

  private optionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  }

  private optionalNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
  }

  private optionalBoolean(value: unknown): boolean | undefined {
    return typeof value === 'boolean' ? value : undefined;
  }

  private objectParam(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  }

  private toErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
