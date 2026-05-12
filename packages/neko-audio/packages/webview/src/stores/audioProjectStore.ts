/**
 * Audio Project Store — 管理 .nka v2 项目数据 + EditOperation dispatch + undo/redo
 *
 * 支持 audio.* (master effects/markers) + track.* + element.* 操作。
 * 所有修改通过 dispatch 进行，支持操作级别的 undo/redo 和 Extension 同步。
 */

import { create } from 'zustand';
import {
  applyOperation,
  invertOperation,
  buildMixConfig,
  createDefaultTrackMixState,
  type AudioProjectData,
  type EditOperation,
  type AudioEffectSnapshot,
  type AudioMarkerSnapshot,
  type AudioOperation,
  type BatchOperation,
  type ElementAddOperation,
  type ElementRemoveOperation,
  type ElementUpdateOperation,
  type TrackAddOperation,
  type TrackRemoveOperation,
  type TrackReorderOperation,
  type TrackToggleOperation,
  type TrackUpdateOperation,
  type TrackOperation,
  type TrackMixOperation,
  type ElementOperation,
  type ElementSplitOperation,
  type AudioTrackMixState,
} from '@neko/shared';
import type { TimelineTrack, TimelineElement } from '@neko/shared';
import type { AudioEffectConfig, MixStreamConfig } from '@neko/shared';
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
export interface AudioTrackViewState {
  color: string;
  height: number;
}

export type AudioTrackUIState = AudioTrackMixState & AudioTrackViewState;

function createDefaultTrackViewState(index: number): AudioTrackViewState {
  return {
    color: DEFAULT_TRACK_COLORS[index % DEFAULT_TRACK_COLORS.length]!,
    height: 80,
  };
}

function createDefaultTrackUIState(index: number): AudioTrackUIState {
  return { ...createDefaultTrackMixState(), ...createDefaultTrackViewState(index) };
}

type AudioProjectEditOperation =
  | AudioOperation
  | TrackMixOperation
  | TrackOperation
  | ElementOperation
  | ElementSplitOperation
  | BatchOperation;

function applyAudioProjectOperation(
  data: AudioProjectData,
  op: AudioProjectEditOperation,
): AudioProjectData {
  return applyOperation(data, op);
}

function getPersistedTrackMixState(
  data: AudioProjectData | null,
  trackId: string,
): AudioTrackMixState {
  return data?.trackMix?.[trackId] ?? createDefaultTrackMixState();
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function pickBefore<T extends object>(source: T, updates: Partial<T>): Partial<T> {
  const before: Partial<T> = {};
  for (const key of Object.keys(updates) as Array<keyof T>) {
    before[key] = source[key];
  }
  return before;
}

export interface AudioProjectStore {
  // State
  audioProjectData: AudioProjectData | null;
  waveforms: Record<string, WaveformData>; // elementId → waveform
  trackViewState: Record<string, AudioTrackViewState>; // trackId → local view state
  opUndoStack: EditOperation[];
  opRedoStack: EditOperation[];

  // Init / Reset
  initProject: (data: AudioProjectData, waveforms?: Record<string, WaveformData>) => void;
  syncProject: (data: AudioProjectData, operation?: EditOperation) => void;
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
  setBpm: (bpm: number) => void;

  // Convenience: tracks
  addTrack: (track: TimelineTrack, index?: number) => void;
  removeTrack: (trackId: string) => void;
  updateTrack: (trackId: string, updates: Partial<Omit<TimelineTrack, 'id' | 'elements'>>) => void;
  reorderTrack: (fromIndex: number, toIndex: number) => void;
  toggleTrackField: (trackId: string, field: 'muted' | 'locked' | 'hidden') => void;

  // Convenience: elements
  addElement: (trackId: string, element: TimelineElement) => void;
  removeElement: (trackId: string, elementId: string) => void;
  updateElement: (trackId: string, elementId: string, updates: Partial<TimelineElement>) => void;
  splitElementAt: (trackId: string, elementId: string, time: number) => void;

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
  trackViewState: {},
  opUndoStack: [],
  opRedoStack: [],

  initProject: (data, waveforms = {}) => {
    const trackView: Record<string, AudioTrackViewState> = {};
    data.tracks.forEach((track, i) => {
      trackView[track.id] = createDefaultTrackViewState(i);
    });
    set({
      audioProjectData: data,
      waveforms,
      trackViewState: trackView,
      opUndoStack: [],
      opRedoStack: [],
    });
  },

  syncProject: (data, operation) => {
    set((state) => {
      const trackView: Record<string, AudioTrackViewState> = {};
      data.tracks.forEach((track, index) => {
        trackView[track.id] = state.trackViewState[track.id] ?? createDefaultTrackViewState(index);
      });

      return {
        audioProjectData: data,
        trackViewState: trackView,
        opUndoStack: operation
          ? [...state.opUndoStack.slice(-(MAX_OP_HISTORY_SIZE - 1)), operation]
          : state.opUndoStack,
        opRedoStack: operation ? [] : state.opRedoStack,
      };
    });
  },

  reset: () => {
    set({
      audioProjectData: null,
      waveforms: {},
      trackViewState: {},
      opUndoStack: [],
      opRedoStack: [],
    });
  },

  dispatch: (op) => {
    const { audioProjectData, opUndoStack } = get();
    if (!audioProjectData) return;

    try {
      const newData = applyAudioProjectOperation(audioProjectData, op as AudioProjectEditOperation);
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
        data = applyAudioProjectOperation(data, op as AudioProjectEditOperation);
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
      const newData = applyAudioProjectOperation(
        audioProjectData,
        inv as AudioProjectEditOperation,
      );
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
      const newData = applyAudioProjectOperation(audioProjectData, op as AudioProjectEditOperation);
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
    const effect = get().audioProjectData?.masterEffectsChain.find((item) => item.id === effectId);
    if (!effect) return;
    get().dispatch({
      type: 'audio.effect.toggle',
      meta: createMeta('user', 'Toggle effect'),
      payload: { effectId, field: 'enabled' },
      before: { value: effect.enabled },
    });
  },

  updateEffectParams: (effectId, updates) => {
    const data = get().audioProjectData;
    if (!data) return;
    const effect = data.masterEffectsChain.find((e: AudioEffectSnapshot) => e.id === effectId);
    if (!effect) return;
    const before = pickBefore<Omit<AudioEffectSnapshot, 'id'>>(effect, updates);
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
    const before = pickBefore<Omit<AudioMarkerSnapshot, 'id'>>(marker, updates);
    get().dispatch({
      type: 'audio.marker.update',
      meta: createMeta('user', 'Update marker'),
      payload: { markerId, updates },
      before: { updates: before },
    });
  },

  setBpm: (bpm) => {
    const data = get().audioProjectData;
    if (!data) return;
    get().dispatch({
      type: 'audio.setBpm',
      meta: createMeta('user', 'Set project BPM'),
      payload: { bpm: clamp(Math.round(bpm), 20, 300) },
      before: { bpm: data.bpm },
    });
  },

  // =========================================================================
  // Convenience: tracks
  // =========================================================================

  addTrack: (track, index) => {
    const operation: TrackAddOperation = {
      type: 'track.add',
      meta: createMeta('user', `Add track: ${track.name}`),
      payload: { track, index },
    };
    get().dispatch(operation);
  },

  removeTrack: (trackId) => {
    const data = get().audioProjectData;
    if (!data) return;
    const idx = data.tracks.findIndex((t) => t.id === trackId);
    if (idx === -1) return;
    const track = data.tracks[idx]!;
    const operation: TrackRemoveOperation = {
      type: 'track.remove',
      meta: createMeta('user', `Remove track: ${track.name}`),
      payload: { trackId },
      before: { track, index: idx },
    };
    get().dispatch(operation);
  },

  updateTrack: (trackId, updates) => {
    const data = get().audioProjectData;
    if (!data) return;
    const track = data.tracks.find((t) => t.id === trackId);
    if (!track) return;
    const before = pickBefore<Omit<TimelineTrack, 'id' | 'elements'>>(track, updates);
    const operation: TrackUpdateOperation = {
      type: 'track.update',
      meta: createMeta('user', 'Update track'),
      payload: { trackId, updates },
      before: { updates: before },
    };
    get().dispatch(operation);
  },

  reorderTrack: (fromIndex, toIndex) => {
    const trackId = get().audioProjectData?.tracks[fromIndex]?.id;
    if (!trackId) return;
    const operation: TrackReorderOperation = {
      type: 'track.reorder',
      meta: createMeta('user', 'Reorder track'),
      payload: { trackId, fromIndex, toIndex },
    };
    get().dispatch(operation);
  },

  toggleTrackField: (trackId, field) => {
    const track = get().audioProjectData?.tracks.find((item) => item.id === trackId);
    if (!track) return;
    const operation: TrackToggleOperation = {
      type: 'track.toggle',
      meta: createMeta('user', `Toggle track ${field}`),
      payload: { trackId, field },
      before: { value: track[field] },
    };
    get().dispatch(operation);
  },

  // =========================================================================
  // Convenience: elements
  // =========================================================================

  addElement: (trackId, element) => {
    const operation: ElementAddOperation = {
      type: 'element.add',
      meta: createMeta('user', `Add element: ${element.name}`),
      payload: { trackId, element },
    };
    get().dispatch(operation);
  },

  removeElement: (trackId, elementId) => {
    const data = get().audioProjectData;
    if (!data) return;
    const track = data.tracks.find((t) => t.id === trackId);
    if (!track) return;
    const idx = track.elements.findIndex((e) => e.id === elementId);
    if (idx === -1) return;
    const element = track.elements[idx]!;
    const operation: ElementRemoveOperation = {
      type: 'element.remove',
      meta: createMeta('user', `Remove element: ${element.name}`),
      payload: { trackId, elementId },
      before: { element, index: idx, rippleAffected: [] },
    };
    get().dispatch(operation);
  },

  updateElement: (trackId, elementId, updates) => {
    const data = get().audioProjectData;
    if (!data) return;
    const track = data.tracks.find((t) => t.id === trackId);
    if (!track) return;
    const element = track.elements.find((e) => e.id === elementId);
    if (!element) return;
    const before = pickBefore<TimelineElement>(element, updates);
    const operation: ElementUpdateOperation = {
      type: 'element.update',
      meta: createMeta('user', 'Update element'),
      payload: { trackId, elementId, updates },
      before: { updates: before },
    };
    get().dispatch(operation);
  },

  splitElementAt: (trackId, elementId, time) => {
    const data = get().audioProjectData;
    if (!data) return;
    const track = data.tracks.find((item) => item.id === trackId);
    if (!track) return;
    const element = track.elements.find((item) => item.id === elementId);
    if (!element) return;

    const origDuration = element.duration ?? 0;
    const splitOffset = time - element.startTime;
    if (splitOffset <= 0.01 || splitOffset >= origDuration - 0.01) return;

    const rightElement: TimelineElement = {
      ...element,
      id: crypto.randomUUID(),
      startTime: time,
      duration: origDuration - splitOffset,
      trimStart: (element.trimStart ?? 0) + splitOffset,
    };

    get().dispatchBatch([
      {
        type: 'element.update',
        meta: createMeta('user', 'Split clip left segment'),
        payload: { trackId, elementId, updates: { duration: splitOffset } },
        before: { updates: { duration: origDuration } },
      },
      {
        type: 'element.add',
        meta: createMeta('user', 'Split clip right segment'),
        payload: { trackId, element: rightElement },
      },
    ]);
  },

  // =========================================================================
  // Track UI state (local, not persisted to .nka directly)
  // =========================================================================

  getTrackUIState: (trackId) => {
    const data = get().audioProjectData;
    const index = data?.tracks.findIndex((t) => t.id === trackId) ?? 0;
    const view = get().trackViewState[trackId] ?? createDefaultTrackViewState(Math.max(0, index));
    const mix = getPersistedTrackMixState(data, trackId);
    return { ...mix, ...view };
  },

  toggleSolo: (trackId) => {
    const data = get().audioProjectData;
    if (!data) return;
    const current = getPersistedTrackMixState(data, trackId);
    get().dispatch({
      type: 'track.mix.setSolo',
      meta: createMeta('user', 'Set track solo'),
      payload: { trackId, solo: !current.solo },
      before: { solo: current.solo },
    });
  },

  setTrackVolume: (trackId, volume) => {
    const data = get().audioProjectData;
    if (!data) return;
    const current = getPersistedTrackMixState(data, trackId);
    get().dispatch({
      type: 'track.mix.setVolume',
      meta: createMeta('user', 'Set track volume'),
      payload: { trackId, volume: clamp(volume, 0, 2) },
      before: { volume: current.volume },
    });
  },

  setTrackPan: (trackId, pan) => {
    const data = get().audioProjectData;
    if (!data) return;
    const current = getPersistedTrackMixState(data, trackId);
    get().dispatch({
      type: 'track.mix.setPan',
      meta: createMeta('user', 'Set track pan'),
      payload: { trackId, pan: clamp(pan, -1, 1) },
      before: { pan: current.pan },
    });
  },

  setTrackColor: (trackId, color) => {
    set((s) => {
      const current = s.trackViewState[trackId] ?? createDefaultTrackViewState(0);
      return {
        trackViewState: {
          ...s.trackViewState,
          [trackId]: { ...current, color },
        },
      };
    });
  },

  setTrackHeight: (trackId, height) => {
    set((s) => {
      const current = s.trackViewState[trackId] ?? createDefaultTrackViewState(0);
      return {
        trackViewState: {
          ...s.trackViewState,
          [trackId]: { ...current, height: clamp(height, 40, 200) },
        },
      };
    });
  },

  addTrackEffect: (trackId, effect) => {
    const data = get().audioProjectData;
    if (!data) return;
    const mix = getPersistedTrackMixState(data, trackId);
    get().dispatch({
      type: 'track.mix.effect.add',
      meta: createMeta('user', 'Add track effect'),
      payload: { trackId, effect, index: mix.effectChain.length },
    });
  },

  removeTrackEffect: (trackId, effectId) => {
    const data = get().audioProjectData;
    if (!data) return;
    const mix = getPersistedTrackMixState(data, trackId);
    const index = mix.effectChain.findIndex((effect) => effect.id === effectId);
    if (index === -1) return;
    const effect = mix.effectChain[index]!;
    get().dispatch({
      type: 'track.mix.effect.remove',
      meta: createMeta('user', 'Remove track effect'),
      payload: { trackId, effectId },
      before: { effect, index },
    });
  },

  updateTrackEffect: (trackId, effectId, updates) => {
    const data = get().audioProjectData;
    if (!data) return;
    const effect = getPersistedTrackMixState(data, trackId).effectChain.find(
      (item) => item.id === effectId,
    );
    if (!effect) return;
    const before: Partial<Omit<AudioEffectConfig, 'id'>> = {};
    for (const key of Object.keys(updates) as Array<keyof Omit<AudioEffectConfig, 'id'>>) {
      before[key] = effect[key] as never;
    }
    get().dispatch({
      type: 'track.mix.effect.update',
      meta: createMeta('user', 'Update track effect'),
      payload: { trackId, effectId, updates },
      before: { updates: before },
    });
  },

  // =========================================================================
  // Mix config builder — assembles MixStreamConfig from project + UI state
  // =========================================================================

  buildMixStreamConfig: () => {
    const { audioProjectData } = get();
    if (!audioProjectData) return null;
    return buildMixConfig(audioProjectData, {
      projectDir: '',
      resolveSourcePath: (src) => src,
    }).config;
  },
}));
