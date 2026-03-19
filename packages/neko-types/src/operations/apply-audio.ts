// =============================================================================
// applyAudioOperation — 音频项目操作应用
// =============================================================================

import type { AudioOperation, AudioEffectSnapshot, AudioMarkerSnapshot } from './types';
import { arrayMove } from './helpers';
import { OperationError } from './errors';

/** 音频项目数据结构（与 AudioProject 对齐） */
export interface AudioProjectData {
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

export function applyAudioOperation(data: AudioProjectData, op: AudioOperation): AudioProjectData {
  switch (op.type) {
    case 'audio.effect.add': {
      const idx = op.payload.index ?? data.effectsChain.length;
      const chain = [...data.effectsChain];
      chain.splice(idx, 0, op.payload.effect);
      return { ...data, effectsChain: chain };
    }

    case 'audio.effect.remove': {
      const chain = data.effectsChain.filter((e) => e.id !== op.payload.effectId);
      return { ...data, effectsChain: chain };
    }

    case 'audio.effect.update': {
      const chain = data.effectsChain.map((e) =>
        e.id === op.payload.effectId ? { ...e, ...op.payload.updates } : e,
      );
      return { ...data, effectsChain: chain };
    }

    case 'audio.effect.toggle': {
      const chain = data.effectsChain.map((e) =>
        e.id === op.payload.effectId ? { ...e, enabled: !e.enabled } : e,
      );
      return { ...data, effectsChain: chain };
    }

    case 'audio.effect.move': {
      return {
        ...data,
        effectsChain: arrayMove(data.effectsChain, op.payload.fromIndex, op.payload.toIndex),
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
