/**
 * useEffectsChain - Manages an ordered list of audio effects
 *
 * Provides add/remove/reorder/toggle/updateParams operations.
 * The chain is sent to the extension for server-side transcode via "Apply".
 */

import { useCallback, useState } from 'react';
import type {
  AudioEffectInstance,
  AudioEffectType,
  AudioEffectParams,
} from '../types/audioEffects';
import { createAudioEffectInstance } from '../types/audioEffects';

export interface EffectsChain {
  effects: AudioEffectInstance[];
  addEffect: (type: AudioEffectType) => void;
  removeEffect: (id: string) => void;
  toggleEffect: (id: string) => void;
  updateParams: (id: string, params: Partial<AudioEffectParams>) => void;
  moveEffect: (fromIndex: number, toIndex: number) => void;
  clearAll: () => void;
  /** Replace entire effects list (used for project restore) */
  replaceAll: (effects: AudioEffectInstance[]) => void;
}

export function useEffectsChain(): EffectsChain {
  const [effects, setEffects] = useState<AudioEffectInstance[]>([]);

  const addEffect = useCallback((type: AudioEffectType) => {
    const instance = createAudioEffectInstance(type);
    setEffects((prev) => [...prev, instance]);
  }, []);

  const removeEffect = useCallback((id: string) => {
    setEffects((prev) => prev.filter((e) => e.id !== id));
  }, []);

  const toggleEffect = useCallback((id: string) => {
    setEffects((prev) => prev.map((e) => (e.id === id ? { ...e, enabled: !e.enabled } : e)));
  }, []);

  const updateParams = useCallback((id: string, params: Partial<AudioEffectParams>) => {
    setEffects((prev) =>
      prev.map((e) =>
        e.id === id ? { ...e, params: { ...e.params, ...params } as AudioEffectParams } : e,
      ),
    );
  }, []);

  const moveEffect = useCallback((fromIndex: number, toIndex: number) => {
    setEffects((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      if (moved) {
        next.splice(toIndex, 0, moved);
      }
      return next;
    });
  }, []);

  const clearAll = useCallback(() => {
    setEffects([]);
  }, []);

  const replaceAll = useCallback((newEffects: AudioEffectInstance[]) => {
    setEffects(newEffects);
  }, []);

  return {
    effects,
    addEffect,
    removeEffect,
    toggleEffect,
    updateParams,
    moveEffect,
    clearAll,
    replaceAll,
  };
}
