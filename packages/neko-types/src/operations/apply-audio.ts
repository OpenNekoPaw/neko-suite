// =============================================================================
// applyAudioOperation — 音频项目操作应用
// =============================================================================

import type { TimelineTrack } from '../types/timelineTrack';
import type { AudioOperation, AudioEffectSnapshot, AudioMarkerSnapshot } from './types';
import { arrayMove } from './helpers';
import { OperationError } from './errors';

// =============================================================================
// AudioProjectData v1 (legacy) — for migration
// =============================================================================

/** @deprecated Use AudioProjectData (v2) instead */
export interface AudioProjectDataV1 {
  version: string;
  name: string;
  audioSource: {
    filePath: string;
    duration: number;
    sampleRate: number;
    channels: number;
    format: string;
  } | null;
  effectsChain: AudioEffectSnapshot[];
  markers: AudioMarkerSnapshot[];
}

// =============================================================================
// AudioProjectData v2 — multi-track
// =============================================================================

/** Audio project data v2 — multi-track, reuses TimelineTrack from neko-types */
export interface AudioProjectData {
  version: string; // '2.0'
  name: string;
  sampleRate: number; // project sample rate (default 48000)
  channels: number; // project channels (default 2)
  tracks: TimelineTrack[]; // reuse from neko-types
  masterEffectsChain: AudioEffectSnapshot[]; // master bus effects
  markers: AudioMarkerSnapshot[]; // project-level markers
}

// =============================================================================
// applyAudioOperation — operates on masterEffectsChain and markers
// =============================================================================

export function applyAudioOperation(data: AudioProjectData, op: AudioOperation): AudioProjectData {
  switch (op.type) {
    case 'audio.effect.add': {
      const idx = op.payload.index ?? data.masterEffectsChain.length;
      const chain = [...data.masterEffectsChain];
      chain.splice(idx, 0, op.payload.effect);
      return { ...data, masterEffectsChain: chain };
    }

    case 'audio.effect.remove': {
      const chain = data.masterEffectsChain.filter((e) => e.id !== op.payload.effectId);
      return { ...data, masterEffectsChain: chain };
    }

    case 'audio.effect.update': {
      const chain = data.masterEffectsChain.map((e) =>
        e.id === op.payload.effectId ? { ...e, ...op.payload.updates } : e,
      );
      return { ...data, masterEffectsChain: chain };
    }

    case 'audio.effect.toggle': {
      const chain = data.masterEffectsChain.map((e) =>
        e.id === op.payload.effectId ? { ...e, enabled: !e.enabled } : e,
      );
      return { ...data, masterEffectsChain: chain };
    }

    case 'audio.effect.move': {
      return {
        ...data,
        masterEffectsChain: arrayMove(
          data.masterEffectsChain,
          op.payload.fromIndex,
          op.payload.toIndex,
        ),
      };
    }

    case 'audio.marker.add': {
      return { ...data, markers: [...data.markers, op.payload.marker] };
    }

    case 'audio.marker.remove': {
      return { ...data, markers: data.markers.filter((m) => m.id !== op.payload.markerId) };
    }

    case 'audio.marker.update': {
      const markers = data.markers.map((m) =>
        m.id === op.payload.markerId ? { ...m, ...op.payload.updates } : m,
      );
      return { ...data, markers };
    }

    default:
      throw OperationError.invalidOperation(`Unknown audio operation: ${(op as any).type}`);
  }
}
