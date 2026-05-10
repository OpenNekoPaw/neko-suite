/**
 * Audio Project Store — 管理 .nka v2 项目数据 + EditOperation dispatch + undo/redo
 *
 * 支持 audio.* (master effects/markers) + track.* + element.* 操作。
 * 所有修改通过 dispatch 进行，支持操作级别的 undo/redo 和 Extension 同步。
 */

import { create } from 'zustand';
import {
  applyAudioOperation,
  applyOperation,
  invertOperation,
  type AudioProjectData,
  type EditOperation,
  type AudioEffectSnapshot,
  type AudioMarkerSnapshot,
  type AudioOperation,
  type TrackOperation,
  type ElementOperation,
  type ElementSplitOperation,
} from '@neko/shared';
import type { TimelineTrack, TimelineElement } from '@neko/shared';
import type {
  AudioEffectConfig,
  MixStreamConfig,
  MixTrackConfig,
  MixElementConfig,
} from '@neko/shared';
import type { WaveformData } from '../shared/types';
import { syncOperationToExtension } from './utils/extension-sync';
import { createMeta } from './utils/operation-helpers';
import { getLogger } from '../utils/logger';

const logger = getLogger('AudioProjectStore');

const MAX_OP_HISTORY_SIZE = 200;

const DEFAULT_TRACK_COLORS = [
  '#3b82f6',
  '#22c55e',
  '#ef4444',
  '#f59e0b',
  '#8b5cf6',
  '#06b6d4',
  '#ec4899',
  '#14b8a6',
];

/** Per-track UI state (local, not serialized to .nka) */
export interface AudioTrackUIState {
  solo: boolean;
  volume: number;
  pan: number;
  color: string;
  height: number;
  effectChain: AudioEffectConfig[];
}

function createDefaultTrackUIState(index: number): AudioTrackUIState {
  return {
    solo: false,
    volume: 1.0,
    pan: 0.0,
    color: DEFAULT_TRACK_COLORS[index % DEFAULT_TRACK_COLORS.length]!,
    height: 80,
    effectChain: [],
  };
}

export interface AudioProjectStore {
  // State
  audioProjectData: AudioProjectData | null;
  waveforms: Record<string, WaveformData>; // elementId → waveform
  trackUIState: Record<string, AudioTrackUIState>; // trackId → UI state
  opUndoStack: EditOperation[];
  opRedoStack: EditOperation[];

  // Init / Reset
  initProject: (data: AudioProjectData, waveforms?: Record<string, WaveformData>) => void;
  reset: () => void;

  // Dispatch (supports audio.* / track.* / element.*)
  dispatch: (op: EditOperation) => void;
  dispatchBatch: (ops: EditOperation[]) => void;

  // Undo / Redo
  opUndo: () => void;
  opRedo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  // Waveform
  setWaveform: (elementId: string, waveform: WaveformData) => void;

  // Convenience: master effects
  addEffect: (effect: AudioEffectSnapshot) => void;
  removeEffect: (effectId: string) => void;
  toggleEffect: (effectId: string) => void;
  updateEffectParams: (effectId: string, params: Partial<Omit<AudioEffectSnapshot, 'id'>>) => void;
  moveEffect: (fromIndex: number, toIndex: number) => void;

  // Convenience: markers
  addMarker: (marker: AudioMarkerSnapshot) => void;
  removeMarker: (markerId: string) => void;
  updateMarker: (markerId: string, updates: Partial<Omit<AudioMarkerSnapshot, 'id'>>) => void;

  // Convenience: tracks
  addTrack: (track: TimelineTrack, index?: number) => void;
  removeTrack: (trackId: string) => void;
  updateTrack: (trackId: string, updates: Partial<TimelineTrack>) => void;
  reorderTrack: (fromIndex: number, toIndex: number) => void;
  toggleTrackField: (trackId: string, field: 'muted' | 'locked' | 'hidden') => void;

  // Convenience: elements
  addElement: (trackId: string, element: TimelineElement) => void;
  removeElement: (trackId: string, elementId: string) => void;
  updateElement: (trackId: string, elementId: string, updates: Partial<TimelineElement>) => void;

  // Track UI state (local, not in .nka)
  toggleSolo: (trackId: string) => void;
  setTrackVolume: (trackId: string, volume: number) => void;
  setTrackPan: (trackId: string, pan: number) => void;
  setTrackColor: (trackId: string, color: string) => void;
  setTrackHeight: (trackId: string, height: number) => void;
  addTrackEffect: (trackId: string, effect: AudioEffectConfig) => void;
  removeTrackEffect: (trackId: string, effectId: string) => void;
  updateTrackEffect: (
    trackId: string,
    effectId: string,
    updates: Partial<AudioEffectConfig>,
  ) => void;
  getTrackUIState: (trackId: string) => AudioTrackUIState;

  // Mix config builder
  buildMixStreamConfig: () => MixStreamConfig | null;
}

export const useAudioProjectStore = create<AudioProjectStore>()((set, get) => ({
  audioProjectData: null,
  waveforms: {},
  trackUIState: {},
  opUndoStack: [],
  opRedoStack: [],

  initProject: (data, waveforms = {}) => {
    const trackUI: Record<string, AudioTrackUIState> = {};
    data.tracks.forEach((track, i) => {
      const saved = data.trackMix?.[track.id];
      trackUI[track.id] = {
        solo: saved?.solo ?? false,
        volume: saved?.volume ?? 1.0,
        pan: saved?.pan ?? 0.0,
        color: DEFAULT_TRACK_COLORS[i % DEFAULT_TRACK_COLORS.length]!,
        height: 80,
        effectChain: saved?.effectChain ?? [],
      };
    });
    set({
      audioProjectData: data,
      waveforms,
      trackUIState: trackUI,
      opUndoStack: [],
      opRedoStack: [],
    });
  },

  reset: () => {
    set({
      audioProjectData: null,
      waveforms: {},
      trackUIState: {},
      opUndoStack: [],
      opRedoStack: [],
    });
  },

  dispatch: (op) => {
    const { audioProjectData, opUndoStack } = get();
    if (!audioProjectData) return;

    try {
      const opType = op.type;
      let newData: AudioProjectData;
      if (opType.startsWith('audio.')) {
        newData = applyAudioOperation(audioProjectData, op as AudioOperation);
      } else {
        newData = applyOperation(
          audioProjectData,
          op as TrackOperation | ElementOperation | ElementSplitOperation | AudioOperation,
        );
      }
      set({
        audioProjectData: newData,
        opUndoStack: [...opUndoStack.slice(-(MAX_OP_HISTORY_SIZE - 1)), op],
        opRedoStack: [],
      });
      syncOperationToExtension(op);
    } catch (e) {
      logger.error('dispatch failed', e);
    }
  },

  dispatchBatch: (ops) => {
    const { audioProjectData, opUndoStack } = get();
    if (!audioProjectData || ops.length === 0) return;

    const batchOp: EditOperation = {
      type: 'batch',
      meta: createMeta('user'),
      payload: { operations: ops },
    };

    try {
      let data = audioProjectData;
      for (const op of ops) {
        data = applyAudioOperation(data, op as any);
      }
      set({
        audioProjectData: data,
        opUndoStack: [...opUndoStack.slice(-(MAX_OP_HISTORY_SIZE - 1)), batchOp],
        opRedoStack: [],
      });
      syncOperationToExtension(batchOp);
    } catch (e) {
      logger.error('batch failed', e);
    }
  },

  opUndo: () => {
    const { opUndoStack, audioProjectData } = get();
    if (opUndoStack.length === 0 || !audioProjectData) return;

    const op = opUndoStack[opUndoStack.length - 1]!;

    try {
      const inv = invertOperation(op);
      const newData = applyAudioOperation(audioProjectData, inv as any);
      const { opRedoStack } = get();
      set({
        audioProjectData: newData,
        opUndoStack: opUndoStack.slice(0, -1),
        opRedoStack: [...opRedoStack, op],
      });
      syncOperationToExtension(inv);
    } catch (e) {
      logger.error('opUndo failed', e);
    }
  },

  opRedo: () => {
    const { opRedoStack, audioProjectData } = get();
    if (opRedoStack.length === 0 || !audioProjectData) return;

    const op = opRedoStack[opRedoStack.length - 1]!;

    try {
      const newData = applyAudioOperation(audioProjectData, op as any);
      const { opUndoStack } = get();
      set({
        audioProjectData: newData,
        opUndoStack: [...opUndoStack, op],
        opRedoStack: opRedoStack.slice(0, -1),
      });
      syncOperationToExtension(op);
    } catch (e) {
      logger.error('opRedo failed', e);
    }
  },

  canUndo: () => get().opUndoStack.length > 0,
  canRedo: () => get().opRedoStack.length > 0,

  // Waveform
  setWaveform: (elementId, waveform) => {
    set((s) => ({ waveforms: { ...s.waveforms, [elementId]: waveform } }));
  },

  // =========================================================================
  // Convenience actions — 构建 EditOperation 并 dispatch
  // =========================================================================

  addEffect: (effect) => {
    get().dispatch({
      type: 'audio.effect.add',
      meta: createMeta('user', `Add effect: ${effect.name}`),
      payload: { effect },
    });
  },

  removeEffect: (effectId) => {
    const data = get().audioProjectData;
    if (!data) return;
    const idx = data.masterEffectsChain.findIndex((e: AudioEffectSnapshot) => e.id === effectId);
    if (idx === -1) return;
    const effect = data.masterEffectsChain[idx]!;
    get().dispatch({
      type: 'audio.effect.remove',
      meta: createMeta('user', `Remove effect: ${effect.name}`),
      payload: { effectId },
      before: { effect, index: idx },
    });
  },

  toggleEffect: (effectId) => {
    get().dispatch({
      type: 'audio.effect.toggle',
      meta: createMeta('user', 'Toggle effect'),
      payload: { effectId, field: 'enabled' },
    });
  },

  updateEffectParams: (effectId, updates) => {
    const data = get().audioProjectData;
    if (!data) return;
    const effect = data.masterEffectsChain.find((e: AudioEffectSnapshot) => e.id === effectId);
    if (!effect) return;
    const before: Partial<Omit<AudioEffectSnapshot, 'id'>> = {};
    for (const key of Object.keys(updates) as Array<keyof typeof updates>) {
      (before as any)[key] = (effect as any)[key];
    }
    get().dispatch({
      type: 'audio.effect.update',
      meta: createMeta('user', 'Update effect params'),
      payload: { effectId, updates },
      before: { updates: before },
    });
  },

  moveEffect: (fromIndex, toIndex) => {
    const data = get().audioProjectData;
    if (!data) return;
    const effect = data.masterEffectsChain[fromIndex];
    if (!effect) return;
    get().dispatch({
      type: 'audio.effect.move',
      meta: createMeta('user', 'Move effect'),
      payload: { effectId: effect.id, fromIndex, toIndex },
    });
  },

  addMarker: (marker) => {
    get().dispatch({
      type: 'audio.marker.add',
      meta: createMeta('user', `Add marker: ${marker.label}`),
      payload: { marker },
    });
  },

  removeMarker: (markerId) => {
    const data = get().audioProjectData;
    if (!data) return;
    const marker = data.markers.find((m) => m.id === markerId);
    if (!marker) return;
    get().dispatch({
      type: 'audio.marker.remove',
      meta: createMeta('user', `Remove marker: ${marker.label}`),
      payload: { markerId },
      before: { marker },
    });
  },

  updateMarker: (markerId, updates) => {
    const data = get().audioProjectData;
    if (!data) return;
    const marker = data.markers.find((m) => m.id === markerId);
    if (!marker) return;
    const before: Partial<Omit<AudioMarkerSnapshot, 'id'>> = {};
    for (const key of Object.keys(updates) as Array<keyof typeof updates>) {
      (before as any)[key] = (marker as any)[key];
    }
    get().dispatch({
      type: 'audio.marker.update',
      meta: createMeta('user', 'Update marker'),
      payload: { markerId, updates },
      before: { updates: before },
    });
  },

  // =========================================================================
  // Convenience: tracks
  // =========================================================================

  addTrack: (track, index) => {
    get().dispatch({
      type: 'track.add',
      meta: createMeta('user', `Add track: ${track.name}`),
      payload: { track, index },
    } as any);
  },

  removeTrack: (trackId) => {
    const data = get().audioProjectData;
    if (!data) return;
    const idx = data.tracks.findIndex((t) => t.id === trackId);
    if (idx === -1) return;
    const track = data.tracks[idx]!;
    get().dispatch({
      type: 'track.remove',
      meta: createMeta('user', `Remove track: ${track.name}`),
      payload: { trackId },
      before: { track, index: idx },
    } as any);
  },

  updateTrack: (trackId, updates) => {
    const data = get().audioProjectData;
    if (!data) return;
    const track = data.tracks.find((t) => t.id === trackId);
    if (!track) return;
    const before: Record<string, unknown> = {};
    for (const key of Object.keys(updates)) {
      before[key] = (track as any)[key];
    }
    get().dispatch({
      type: 'track.update',
      meta: createMeta('user', 'Update track'),
      payload: { trackId, updates },
      before: { updates: before },
    } as any);
  },

  reorderTrack: (fromIndex, toIndex) => {
    get().dispatch({
      type: 'track.reorder',
      meta: createMeta('user', 'Reorder track'),
      payload: { fromIndex, toIndex },
    } as any);
  },

  toggleTrackField: (trackId, field) => {
    get().dispatch({
      type: 'track.toggle',
      meta: createMeta('user', `Toggle track ${field}`),
      payload: { trackId, field },
    } as any);
  },

  // =========================================================================
  // Convenience: elements
  // =========================================================================

  addElement: (trackId, element) => {
    get().dispatch({
      type: 'element.add',
      meta: createMeta('user', `Add element: ${element.name}`),
      payload: { trackId, element },
    } as any);
  },

  removeElement: (trackId, elementId) => {
    const data = get().audioProjectData;
    if (!data) return;
    const track = data.tracks.find((t) => t.id === trackId);
    if (!track) return;
    const idx = track.elements.findIndex((e) => e.id === elementId);
    if (idx === -1) return;
    const element = track.elements[idx]!;
    get().dispatch({
      type: 'element.remove',
      meta: createMeta('user', `Remove element: ${element.name}`),
      payload: { trackId, elementId },
      before: { element, index: idx, rippleAffected: [] },
    } as any);
  },

  updateElement: (trackId, elementId, updates) => {
    const data = get().audioProjectData;
    if (!data) return;
    const track = data.tracks.find((t) => t.id === trackId);
    if (!track) return;
    const element = track.elements.find((e) => e.id === elementId);
    if (!element) return;
    const before: Record<string, unknown> = {};
    for (const key of Object.keys(updates)) {
      before[key] = (element as any)[key];
    }
    get().dispatch({
      type: 'element.update',
      meta: createMeta('user', 'Update element'),
      payload: { trackId, elementId, updates },
      before: { updates: before },
    } as any);
  },

  // =========================================================================
  // Track UI state (local, not persisted to .nka directly)
  // =========================================================================

  getTrackUIState: (trackId) => {
    const state = get().trackUIState[trackId];
    if (state) return state;
    const data = get().audioProjectData;
    const index = data?.tracks.findIndex((t) => t.id === trackId) ?? 0;
    return createDefaultTrackUIState(Math.max(0, index));
  },

  toggleSolo: (trackId) => {
    set((s) => {
      const current = s.trackUIState[trackId] ?? createDefaultTrackUIState(0);
      return {
        trackUIState: {
          ...s.trackUIState,
          [trackId]: { ...current, solo: !current.solo },
        },
      };
    });
  },

  setTrackVolume: (trackId, volume) => {
    set((s) => {
      const current = s.trackUIState[trackId] ?? createDefaultTrackUIState(0);
      return {
        trackUIState: {
          ...s.trackUIState,
          [trackId]: { ...current, volume: Math.max(0, Math.min(2, volume)) },
        },
      };
    });
  },

  setTrackPan: (trackId, pan) => {
    set((s) => {
      const current = s.trackUIState[trackId] ?? createDefaultTrackUIState(0);
      return {
        trackUIState: {
          ...s.trackUIState,
          [trackId]: { ...current, pan: Math.max(-1, Math.min(1, pan)) },
        },
      };
    });
  },

  setTrackColor: (trackId, color) => {
    set((s) => {
      const current = s.trackUIState[trackId] ?? createDefaultTrackUIState(0);
      return {
        trackUIState: {
          ...s.trackUIState,
          [trackId]: { ...current, color },
        },
      };
    });
  },

  setTrackHeight: (trackId, height) => {
    set((s) => {
      const current = s.trackUIState[trackId] ?? createDefaultTrackUIState(0);
      return {
        trackUIState: {
          ...s.trackUIState,
          [trackId]: { ...current, height: Math.max(40, Math.min(200, height)) },
        },
      };
    });
  },

  addTrackEffect: (trackId, effect) => {
    set((s) => {
      const current = s.trackUIState[trackId] ?? createDefaultTrackUIState(0);
      return {
        trackUIState: {
          ...s.trackUIState,
          [trackId]: { ...current, effectChain: [...current.effectChain, effect] },
        },
      };
    });
  },

  removeTrackEffect: (trackId, effectId) => {
    set((s) => {
      const current = s.trackUIState[trackId] ?? createDefaultTrackUIState(0);
      return {
        trackUIState: {
          ...s.trackUIState,
          [trackId]: {
            ...current,
            effectChain: current.effectChain.filter((e) => e.id !== effectId),
          },
        },
      };
    });
  },

  updateTrackEffect: (trackId, effectId, updates) => {
    set((s) => {
      const current = s.trackUIState[trackId] ?? createDefaultTrackUIState(0);
      return {
        trackUIState: {
          ...s.trackUIState,
          [trackId]: {
            ...current,
            effectChain: current.effectChain.map((e) =>
              e.id === effectId ? { ...e, ...updates } : e,
            ),
          },
        },
      };
    });
  },

  // =========================================================================
  // Mix config builder — assembles MixStreamConfig from project + UI state
  // =========================================================================

  buildMixStreamConfig: () => {
    const { audioProjectData, trackUIState } = get();
    if (!audioProjectData) return null;

    const tracks: MixTrackConfig[] = audioProjectData.tracks.map((track) => {
      const ui = trackUIState[track.id] ?? createDefaultTrackUIState(0);

      const elements: MixElementConfig[] = track.elements
        .filter((el) => el.type === 'audio' && 'src' in el)
        .map((el) => {
          const src = (el as unknown as Record<string, unknown>).src as string;
          const audio = el as unknown as Record<string, unknown>;
          return {
            id: el.id,
            src,
            startTime: el.startTime,
            duration: el.duration,
            trimStart: el.trimStart ?? 0,
            volume: (audio.volume as number) ?? 1.0,
            pan: (audio.pan as number) ?? 0.0,
            muted: el.muted ?? false,
            fadeIn: (audio.fadeIn as number) ?? 0,
            fadeOut: (audio.fadeOut as number) ?? 0,
            gain: (audio.gain as number) ?? 0,
          };
        });

      return {
        id: track.id,
        muted: track.muted,
        solo: ui.solo,
        volume: ui.volume,
        pan: ui.pan,
        effectChain: ui.effectChain,
        elements,
      };
    });

    const masterEffects: AudioEffectConfig[] = audioProjectData.masterEffectsChain.map((e) => ({
      id: e.id,
      effectType: e.type,
      enabled: e.enabled,
      params: e.params,
    }));

    const config: MixStreamConfig = {
      tracks,
      masterEffects,
      masterVolume: audioProjectData.masterVolume ?? 1.0,
      sampleRate: audioProjectData.sampleRate,
      channels: audioProjectData.channels,
    };

    return config;
  },
}));
