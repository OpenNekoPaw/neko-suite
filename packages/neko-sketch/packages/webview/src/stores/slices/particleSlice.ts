/**
 * Particle Slice - particle emitter state
 *
 * Manages particle emitter configurations and preview toggle.
 */
import type { StateCreator } from 'zustand';
import type { ParticleEmitterConfig } from '../../types/particle';
import { DEFAULT_EMITTER } from '../../types/particle';

let emitterCounter = 0;

export interface ParticleSlice {
  // ── State ──
  emitters: ParticleEmitterConfig[];
  isParticlePreviewActive: boolean;

  // ── Actions ──
  addEmitter: (name?: string) => void;
  removeEmitter: (id: string) => void;
  updateEmitter: (id: string, updates: Partial<ParticleEmitterConfig>) => void;
  toggleParticlePreview: () => void;
  clearEmitters: () => void;
}

export const createParticleSlice: StateCreator<ParticleSlice> = (set) => ({
  emitters: [],
  isParticlePreviewActive: false,

  addEmitter: (name) => {
    const id = `emitter-${++emitterCounter}-${Date.now()}`;
    const emitter: ParticleEmitterConfig = {
      ...DEFAULT_EMITTER,
      id,
      name: name ?? `Emitter ${emitterCounter}`,
    };
    set((s) => ({ emitters: [...s.emitters, emitter] }));
  },

  removeEmitter: (id) => set((s) => ({ emitters: s.emitters.filter((e) => e.id !== id) })),

  updateEmitter: (id, updates) =>
    set((s) => ({
      emitters: s.emitters.map((e) => (e.id === id ? { ...e, ...updates } : e)),
    })),

  toggleParticlePreview: () =>
    set((s) => ({ isParticlePreviewActive: !s.isParticlePreviewActive })),

  clearEmitters: () => set({ emitters: [], isParticlePreviewActive: false }),
});
