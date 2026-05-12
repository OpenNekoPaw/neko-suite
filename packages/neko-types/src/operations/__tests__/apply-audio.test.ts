// =============================================================================
// Audio Operations 测试
// =============================================================================

import { describe, it, expect } from 'vitest';
import { applyOperation, invertOperation } from '../index';
import { applyAudioOperation } from '../apply-audio';
import type { AudioProjectData } from '../apply-audio';
import type { AudioEffectAddOperation, AudioEffectSnapshot, AudioMarkerSnapshot } from '../types';

function createAudioProject(overrides: Partial<AudioProjectData> = {}): AudioProjectData {
  return {
    version: '2.1',
    name: 'Test Audio Project',
    sampleRate: 48000,
    channels: 2,
    tracks: [],
    masterEffectsChain: [],
    markers: [],
    ...overrides,
  };
}

function createEffect(overrides: Partial<AudioEffectSnapshot> = {}): AudioEffectSnapshot {
  return {
    id: 'fx-1',
    type: 'parametric-eq',
    name: 'EQ',
    enabled: true,
    params: { frequency: 1000, gain: 0 },
    ...overrides,
  };
}

function createMarker(overrides: Partial<AudioMarkerSnapshot> = {}): AudioMarkerSnapshot {
  return {
    id: 'm-1',
    time: 5.0,
    label: 'Marker 1',
    color: '#ff0000',
    ...overrides,
  };
}

function meta() {
  return { id: 'test', timestamp: Date.now(), source: 'user' as const };
}

describe('applyAudioOperation', () => {
  // =========================================================================
  // audio.effect.*
  // =========================================================================

  describe('audio.effect.add', () => {
    it('should add effect to end of chain', () => {
      const project = createAudioProject();
      const effect = createEffect({ id: 'fx-1' });

      const result = applyAudioOperation(project, {
        type: 'audio.effect.add',
        meta: meta(),
        payload: { effect },
      });

      expect(result.masterEffectsChain).toHaveLength(1);
      expect(result.masterEffectsChain[0]!.id).toBe('fx-1');
    });

    it('should add effect at specific index', () => {
      const fx1 = createEffect({ id: 'fx-1' });
      const fx2 = createEffect({ id: 'fx-2' });
      const project = createAudioProject({ masterEffectsChain: [fx1, fx2] });
      const newFx = createEffect({ id: 'fx-3' });

      const result = applyAudioOperation(project, {
        type: 'audio.effect.add',
        meta: meta(),
        payload: { effect: newFx, index: 1 },
      });

      expect(result.masterEffectsChain).toHaveLength(3);
      expect(result.masterEffectsChain[1]!.id).toBe('fx-3');
    });

    it('roundtrips appended effects without moving them on redo', () => {
      const fx1 = createEffect({ id: 'fx-1' });
      const fx2 = createEffect({ id: 'fx-2' });
      const fx3 = createEffect({ id: 'fx-3' });
      const project = createAudioProject({ masterEffectsChain: [fx1, fx2] });
      const op: AudioEffectAddOperation = {
        type: 'audio.effect.add',
        meta: meta(),
        payload: { effect: fx3 },
      };

      const added = applyOperation(project, op) as AudioProjectData;
      const undo = invertOperation(op);
      const undone = applyOperation(added, undo) as AudioProjectData;
      const redone = applyOperation(undone, op) as AudioProjectData;

      expect(added.masterEffectsChain.map((effect) => effect.id)).toEqual(['fx-1', 'fx-2', 'fx-3']);
      expect(undone.masterEffectsChain.map((effect) => effect.id)).toEqual(['fx-1', 'fx-2']);
      expect(redone.masterEffectsChain.map((effect) => effect.id)).toEqual([
        'fx-1',
        'fx-2',
        'fx-3',
      ]);
    });
  });

  describe('audio.effect.remove', () => {
    it('should remove effect by id', () => {
      const fx1 = createEffect({ id: 'fx-1' });
      const fx2 = createEffect({ id: 'fx-2' });
      const project = createAudioProject({ masterEffectsChain: [fx1, fx2] });

      const result = applyAudioOperation(project, {
        type: 'audio.effect.remove',
        meta: meta(),
        payload: { effectId: 'fx-1' },
        before: { effect: fx1, index: 0 },
      });

      expect(result.masterEffectsChain).toHaveLength(1);
      expect(result.masterEffectsChain[0]!.id).toBe('fx-2');
    });

    it('undoes remove at the original index', () => {
      const fx1 = createEffect({ id: 'fx-1' });
      const fx2 = createEffect({ id: 'fx-2' });
      const fx3 = createEffect({ id: 'fx-3' });
      const project = createAudioProject({ masterEffectsChain: [fx1, fx2, fx3] });

      const removed = applyOperation(project, {
        type: 'audio.effect.remove',
        meta: meta(),
        payload: { effectId: 'fx-2' },
        before: { effect: fx2, index: 1 },
      }) as AudioProjectData;
      const restored = applyOperation(
        removed,
        invertOperation({
          type: 'audio.effect.remove',
          meta: meta(),
          payload: { effectId: 'fx-2' },
          before: { effect: fx2, index: 1 },
        }),
      ) as AudioProjectData;

      expect(removed.masterEffectsChain.map((effect) => effect.id)).toEqual(['fx-1', 'fx-3']);
      expect(restored.masterEffectsChain.map((effect) => effect.id)).toEqual([
        'fx-1',
        'fx-2',
        'fx-3',
      ]);
    });
  });

  describe('audio.effect.update', () => {
    it('should update effect params', () => {
      const fx = createEffect({ id: 'fx-1', params: { frequency: 1000, gain: 0 } });
      const project = createAudioProject({ masterEffectsChain: [fx] });

      const result = applyAudioOperation(project, {
        type: 'audio.effect.update',
        meta: meta(),
        payload: { effectId: 'fx-1', updates: { params: { frequency: 2000, gain: 3 } } },
        before: { updates: { params: { frequency: 1000, gain: 0 } } },
      });

      expect(result.masterEffectsChain[0]!.params).toEqual({ frequency: 2000, gain: 3 });
    });
  });

  describe('audio.effect.toggle', () => {
    it('should toggle effect enabled state', () => {
      const fx = createEffect({ id: 'fx-1', enabled: true });
      const project = createAudioProject({ masterEffectsChain: [fx] });

      const result = applyAudioOperation(project, {
        type: 'audio.effect.toggle',
        meta: meta(),
        payload: { effectId: 'fx-1', field: 'enabled' },
        before: { value: true },
      });

      expect(result.masterEffectsChain[0]!.enabled).toBe(false);
    });

    it('inverts with before metadata for consistent toggle shape', () => {
      const op = {
        type: 'audio.effect.toggle' as const,
        meta: meta(),
        payload: { effectId: 'fx-1', field: 'enabled' as const },
        before: { value: true },
      };

      expect(invertOperation(op)).toMatchObject({
        type: 'audio.effect.toggle',
        payload: { effectId: 'fx-1', field: 'enabled' },
        before: { value: false },
      });
    });
  });

  describe('audio.setBpm', () => {
    it('updates project BPM and roundtrips through invert', () => {
      const project = createAudioProject({ bpm: 120 });
      const op = {
        type: 'audio.setBpm' as const,
        meta: meta(),
        payload: { bpm: 140 },
        before: { bpm: 120 },
      };

      const updated = applyOperation(project, op) as AudioProjectData;
      const restored = applyOperation(updated, invertOperation(op)) as AudioProjectData;

      expect(updated.bpm).toBe(140);
      expect(restored.bpm).toBe(120);
    });

    it('restores an unset BPM through invert without forcing a default', () => {
      const project = createAudioProject();
      const op = {
        type: 'audio.setBpm' as const,
        meta: meta(),
        payload: { bpm: 140 },
        before: {},
      };

      const updated = applyOperation(project, op) as AudioProjectData;
      const restored = applyOperation(updated, invertOperation(op)) as AudioProjectData;

      expect(updated.bpm).toBe(140);
      expect(Object.hasOwn(restored, 'bpm')).toBe(false);
    });
  });

  describe('audio.effect.move', () => {
    it('should reorder effects', () => {
      const fx1 = createEffect({ id: 'fx-1' });
      const fx2 = createEffect({ id: 'fx-2' });
      const fx3 = createEffect({ id: 'fx-3' });
      const project = createAudioProject({ masterEffectsChain: [fx1, fx2, fx3] });

      const result = applyAudioOperation(project, {
        type: 'audio.effect.move',
        meta: meta(),
        payload: { effectId: 'fx-1', fromIndex: 0, toIndex: 2 },
      });

      expect(result.masterEffectsChain.map((e) => e.id)).toEqual(['fx-2', 'fx-3', 'fx-1']);
    });

    it('should reject mismatched effectId and fromIndex', () => {
      const fx1 = createEffect({ id: 'fx-1' });
      const fx2 = createEffect({ id: 'fx-2' });
      const project = createAudioProject({ masterEffectsChain: [fx1, fx2] });

      expect(() =>
        applyAudioOperation(project, {
          type: 'audio.effect.move',
          meta: meta(),
          payload: { effectId: 'fx-2', fromIndex: 0, toIndex: 1 },
        }),
      ).toThrow('Audio effect not found at index 0: fx-2');
    });

    it('should roundtrip through invert', () => {
      const fx1 = createEffect({ id: 'fx-1' });
      const fx2 = createEffect({ id: 'fx-2' });
      const fx3 = createEffect({ id: 'fx-3' });
      const project = createAudioProject({ masterEffectsChain: [fx1, fx2, fx3] });
      const op = {
        type: 'audio.effect.move' as const,
        meta: meta(),
        payload: { effectId: 'fx-1', fromIndex: 0, toIndex: 2 },
      };

      const moved = applyOperation(project, op) as AudioProjectData;
      const restored = applyOperation(moved, invertOperation(op)) as AudioProjectData;

      expect(moved.masterEffectsChain.map((effect) => effect.id)).toEqual(['fx-2', 'fx-3', 'fx-1']);
      expect(restored.masterEffectsChain.map((effect) => effect.id)).toEqual([
        'fx-1',
        'fx-2',
        'fx-3',
      ]);
    });
  });

  // =========================================================================
  // audio.marker.*
  // =========================================================================

  describe('audio.marker.add', () => {
    it('should add marker', () => {
      const project = createAudioProject();
      const marker = createMarker({ id: 'm-1' });

      const result = applyAudioOperation(project, {
        type: 'audio.marker.add',
        meta: meta(),
        payload: { marker },
      });

      expect(result.markers).toHaveLength(1);
      expect(result.markers[0]!.id).toBe('m-1');
    });
  });

  describe('audio.marker.remove', () => {
    it('should remove marker by id', () => {
      const m1 = createMarker({ id: 'm-1' });
      const m2 = createMarker({ id: 'm-2' });
      const project = createAudioProject({ markers: [m1, m2] });

      const result = applyAudioOperation(project, {
        type: 'audio.marker.remove',
        meta: meta(),
        payload: { markerId: 'm-1' },
        before: { marker: m1 },
      });

      expect(result.markers).toHaveLength(1);
      expect(result.markers[0]!.id).toBe('m-2');
    });
  });

  describe('audio.marker.update', () => {
    it('should update marker fields', () => {
      const m = createMarker({ id: 'm-1', label: 'Old', time: 5.0 });
      const project = createAudioProject({ markers: [m] });

      const result = applyAudioOperation(project, {
        type: 'audio.marker.update',
        meta: meta(),
        payload: { markerId: 'm-1', updates: { label: 'New', time: 10.0 } },
        before: { updates: { label: 'Old', time: 5.0 } },
      });

      expect(result.markers[0]!.label).toBe('New');
      expect(result.markers[0]!.time).toBe(10.0);
    });
  });

  // =========================================================================
  // unknown operation
  // =========================================================================

  describe('unknown operation', () => {
    it('should throw on unknown operation type', () => {
      const project = createAudioProject();

      expect(() =>
        applyAudioOperation(project, {
          type: 'audio.unknown' as any,
          meta: meta(),
          payload: {},
        } as any),
      ).toThrow('Unknown audio operation');
    });
  });
});
