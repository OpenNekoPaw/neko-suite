// =============================================================================
// Audio Mix Config Builder — AudioProjectData → Engine render config
// =============================================================================

import type { TimelineElement } from '../types/element';
import type { AudioProperties } from '../types/audio';
import type { AudioProjectData } from '../types/audioProject';
import type { AudioEffectConfig, MixElementConfig, MixStreamConfig } from '../types/audioMix';
import {
  isPlannedAudioEffectType,
  normalizeAudioEffectType,
  normalizeRenderableAudioEffectType,
} from '../types/audioMix';

export interface MixConfigContext {
  projectDir: string;
  resolveSourcePath: (src: string, projectDir: string) => string;
}

export interface MixConfigWarning {
  code: 'planned-effect' | 'unknown-effect';
  message: string;
  effectId?: string;
  effectType: string;
  trackId?: string;
}

export interface MixConfigBuildResult {
  config: MixStreamConfig;
  warnings: MixConfigWarning[];
}

export function buildMixConfig(
  data: AudioProjectData,
  context: MixConfigContext,
): MixConfigBuildResult {
  const warnings: MixConfigWarning[] = [];

  const config: MixStreamConfig = {
    tracks: data.tracks.map((track) => {
      const mix = data.trackMix?.[track.id];
      return {
        id: track.id,
        muted: track.muted,
        solo: mix?.solo ?? false,
        volume: mix?.volume ?? 1,
        pan: mix?.pan ?? 0,
        effectChain: normalizeEffectChain(mix?.effectChain ?? [], warnings, track.id),
        elements: track.elements
          .filter(isAudioSourceElement)
          .map((element) => toMixElementConfig(element, context)),
      };
    }),
    masterEffects: normalizeMasterEffects(data, warnings),
    masterVolume: data.masterVolume ?? 1,
    sampleRate: data.sampleRate,
    channels: data.channels,
  };

  return { config, warnings };
}

function normalizeMasterEffects(
  data: AudioProjectData,
  warnings: MixConfigWarning[],
): AudioEffectConfig[] {
  return data.masterEffectsChain.flatMap((effect) => {
    const effectType = normalizeAudioEffectType(effect.type);
    if (effectType && isPlannedAudioEffectType(effectType)) {
      warnings.push({
        code: 'planned-effect',
        message: `Master effect "${effectType}" is planned but not renderable yet.`,
        effectId: effect.id,
        effectType,
      });
      return [];
    }

    const renderableType = normalizeRenderableAudioEffectType(effect.type);
    if (!renderableType) {
      warnings.push({
        code: 'unknown-effect',
        message: `Master effect "${effect.type}" is not supported by the render engine.`,
        effectId: effect.id,
        effectType: effect.type,
      });
      return [];
    }

    return [
      {
        id: effect.id,
        effectType: renderableType,
        enabled: effect.enabled,
        params: effect.params,
      },
    ];
  });
}

function normalizeEffectChain(
  effects: AudioEffectConfig[],
  warnings: MixConfigWarning[],
  trackId: string,
): AudioEffectConfig[] {
  return effects.flatMap((effect) => {
    const normalized = normalizeAudioEffectType(effect.effectType);
    if (normalized && isPlannedAudioEffectType(normalized)) {
      warnings.push({
        code: 'planned-effect',
        message: `Track effect "${normalized}" is planned but not renderable yet.`,
        effectId: effect.id,
        effectType: normalized,
        trackId,
      });
      return [];
    }

    const effectType = normalizeRenderableAudioEffectType(effect.effectType);
    if (!effectType) {
      warnings.push({
        code: 'unknown-effect',
        message: `Track effect "${effect.effectType}" is not supported by the render engine.`,
        effectId: effect.id,
        effectType: effect.effectType,
        trackId,
      });
      return [];
    }
    return [{ ...effect, effectType }];
  });
}

function toMixElementConfig(
  element: TimelineElement & { src: string },
  context: MixConfigContext,
): MixElementConfig {
  const topLevelAudio = getRuntimeAudioFields(element);

  return {
    id: element.id,
    src: context.resolveSourcePath(element.src, context.projectDir),
    startTime: element.startTime,
    duration: element.duration,
    trimStart: element.trimStart ?? 0,
    volume: topLevelAudio.volume ?? element.audio?.volume ?? 1,
    pan: topLevelAudio.pan ?? element.audio?.pan ?? 0,
    muted: element.muted ?? element.audio?.muted ?? false,
    fadeIn: topLevelAudio.fadeIn ?? element.audio?.fadeIn ?? 0,
    fadeOut: topLevelAudio.fadeOut ?? element.audio?.fadeOut ?? 0,
    gain: topLevelAudio.gain ?? element.audio?.gain ?? 0,
  };
}

function getRuntimeAudioFields(element: TimelineElement): Partial<AudioProperties> {
  const value = element as unknown;
  if (!isRecord(value)) {
    return {};
  }
  return {
    ...(typeof value['volume'] === 'number' ? { volume: value['volume'] } : {}),
    ...(typeof value['pan'] === 'number' ? { pan: value['pan'] } : {}),
    ...(typeof value['muted'] === 'boolean' ? { muted: value['muted'] } : {}),
    ...(typeof value['fadeIn'] === 'number' ? { fadeIn: value['fadeIn'] } : {}),
    ...(typeof value['fadeOut'] === 'number' ? { fadeOut: value['fadeOut'] } : {}),
    ...(typeof value['gain'] === 'number' ? { gain: value['gain'] } : {}),
  };
}

function isAudioSourceElement(
  element: TimelineElement,
): element is TimelineElement & { src: string } {
  return element.type === 'audio' && 'src' in element && typeof element.src === 'string';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
