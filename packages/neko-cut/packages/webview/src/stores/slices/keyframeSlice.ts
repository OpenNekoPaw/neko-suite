/**
 * Keyframe Slice
 * 管理关键帧操作 - 支持 transform、audio、effects 和 mask 属性
 */

import { StateCreator } from 'zustand';
import type { ProjectData } from '../../types';
import type { EditorElement } from '../../types/editor-types';
import type { AnimatableProperty, AnimationKeyframe, ElementTransform } from '../../types/animation';
import type { AudioProperties } from '../../types/audio';
import type { EffectParameterValue, EffectParameterKeyframe, AnimatableEffectParameter } from '../../types/effects';
import type {
  MaskShape,
  MaskEasingType,
  MaskPropertyKeyframe,
  MaskShapeKeyframe,
  AnimatableMaskProperty,
} from '../../types/mask';
import { createDefaultElementTransform } from '../../types/animation';
import { createDefaultAudioProperties } from '../../types/audio';
import {
  insertMaskKeyframeSorted,
  removeMaskKeyframeById,
  createMaskPropertyKeyframe,
  createMaskShapeKeyframe,
} from '../../types/mask';
import { insertKeyframeSorted, removeKeyframeAtTime } from '../../utils/animation';
import { generateId } from '../../utils';

// 需要依赖的其他 Slices 接口
interface ProjectDependency {
  project: ProjectData | null;
}

interface HistoryDependency {
  pushHistory: (project: ProjectData) => void;
}

export interface KeyframeSlice {
  // Actions
  addKeyframe: (trackId: string, elementId: string, property: string, time: number, value: number) => void;
  removeKeyframe: (trackId: string, elementId: string, property: string, time: number) => void;
  updateKeyframe: (trackId: string, elementId: string, property: string, oldTime: number, newTime: number, newValue: number) => void;
  // Effect keyframe actions
  addEffectKeyframe: (trackId: string, elementId: string, effectId: string, paramKey: string, time: number, value: EffectParameterValue) => void;
  removeEffectKeyframe: (trackId: string, elementId: string, effectId: string, paramKey: string, keyframeId: string) => void;
  updateEffectKeyframe: (trackId: string, elementId: string, effectId: string, paramKey: string, keyframeId: string, updates: Partial<EffectParameterKeyframe>) => void;
  // Mask keyframe actions
  addMaskPropertyKeyframe: (trackId: string, elementId: string, maskId: string, property: 'feather' | 'expansion' | 'opacity', time: number, value: number, easing?: MaskEasingType) => void;
  removeMaskPropertyKeyframe: (trackId: string, elementId: string, maskId: string, property: 'feather' | 'expansion' | 'opacity', keyframeId: string) => void;
  updateMaskPropertyKeyframe: (trackId: string, elementId: string, maskId: string, property: 'feather' | 'expansion' | 'opacity', keyframeId: string, updates: Partial<MaskPropertyKeyframe>) => void;
  addMaskShapeKeyframe: (trackId: string, elementId: string, maskId: string, time: number, shape: MaskShape, easing?: MaskEasingType) => void;
  removeMaskShapeKeyframe: (trackId: string, elementId: string, maskId: string, keyframeId: string) => void;
  updateMaskShapeKeyframe: (trackId: string, elementId: string, maskId: string, keyframeId: string, updates: Partial<MaskShapeKeyframe>) => void;
}

export const createKeyframeSlice: StateCreator<
  KeyframeSlice & ProjectDependency & HistoryDependency,
  [],
  [],
  KeyframeSlice
> = (set, get) => ({
  // Actions
  addKeyframe: (trackId, elementId, property, time, value) => {
    const { project, pushHistory } = get();
    if (!project) return;

    const track = project.tracks.find(t => t.id === trackId);
    const element = track?.elements.find(e => e.id === elementId) as EditorElement | undefined;
    if (!element) return;

    // Parse property path (e.g., 'transform.x' or 'audio.volume')
    const parts = property.split('.');
    const rootKey = parts.length > 1 ? parts[0] : 'transform';
    const propKey = parts.length > 1 ? parts[1] : parts[0];

    // Validate supported root keys
    if (rootKey !== 'transform' && rootKey !== 'audio') {
      console.warn(`Keyframes for ${rootKey} properties are not yet supported`);
      return;
    }

    // Handle transform properties
    if (rootKey === 'transform') {
      // Ensure animTransform exists - create if needed (use animTransform for keyframe animation)
      let animTransform = element.animTransform;
      if (!animTransform) {
        animTransform = createDefaultElementTransform();
      }

      // Get the property to modify
      const animProp = animTransform[propKey as keyof ElementTransform] as AnimatableProperty;

      if (!animProp || typeof animProp !== 'object' || !('baseValue' in animProp)) {
        console.warn(`Property ${property} is not animatable`);
        return;
      }

      // Push history before making changes
      pushHistory(project);

      // Create new keyframe
      const newKeyframe: AnimationKeyframe = {
        id: generateId(),
        time,
        value,
        easing: 'linear',
      };

      // Insert keyframe in sorted order
      const updatedKeyframes = insertKeyframeSorted(animProp.keyframes, newKeyframe);

      // Update the element
      set((state) => {
        if (!state.project) return state;

        return {
          project: {
            ...state.project,
            tracks: state.project.tracks.map(t =>
              t.id === trackId
                ? {
                    ...t,
                    elements: (t.elements as EditorElement[]).map(e =>
                      e.id === elementId
                        ? {
                            ...e,
                            animTransform: {
                              ...(e.animTransform ?? animTransform),
                              [propKey]: {
                                ...animProp,
                                keyframes: updatedKeyframes,
                              },
                            },
                          }
                        : e
                    ),
                  }
                : t
            ),
          },
        };
      });
    }
    // Handle audio properties
    else if (rootKey === 'audio') {
      // Validate audio property key
      if (propKey !== 'volume' && propKey !== 'pan') {
        console.warn(`Audio property ${propKey} is not animatable`);
        return;
      }

      // Ensure audio exists - create if needed
      let audio = element.audio;
      if (!audio) {
        audio = createDefaultAudioProperties();
      }

      // Get the property to modify
      const animProp = audio[propKey as keyof AudioProperties] as AnimatableProperty;

      if (!animProp || typeof animProp !== 'object' || !('baseValue' in animProp)) {
        console.warn(`Property ${property} is not animatable`);
        return;
      }

      // Push history before making changes
      pushHistory(project);

      // Create new keyframe
      const newKeyframe: AnimationKeyframe = {
        id: generateId(),
        time,
        value,
        easing: 'linear',
      };

      // Insert keyframe in sorted order
      const updatedKeyframes = insertKeyframeSorted(animProp.keyframes, newKeyframe);

      // Update the element
      set((state) => {
        if (!state.project) return state;

        return {
          project: {
            ...state.project,
            tracks: state.project.tracks.map(t =>
              t.id === trackId
                ? {
                    ...t,
                    elements: (t.elements as EditorElement[]).map(e =>
                      e.id === elementId
                        ? {
                            ...e,
                            audio: {
                              ...(e.audio ?? audio),
                              [propKey]: {
                                ...animProp,
                                keyframes: updatedKeyframes,
                              },
                            },
                          }
                        : e
                    ),
                  }
                : t
            ),
          },
        };
      });
    }
  },

  removeKeyframe: (trackId, elementId, property, time) => {
    const { project, pushHistory } = get();
    if (!project) return;

    const track = project.tracks.find(t => t.id === trackId);
    const element = track?.elements.find(e => e.id === elementId) as EditorElement | undefined;
    if (!element) return;

    // Parse property path
    const parts = property.split('.');
    const rootKey = parts.length > 1 ? parts[0] : 'transform';
    const propKey = parts.length > 1 ? parts[1] : parts[0];

    // Validate supported root keys
    if (rootKey !== 'transform' && rootKey !== 'audio') {
      console.warn(`Keyframes for ${rootKey} properties are not yet supported`);
      return;
    }

    // Handle transform properties
    if (rootKey === 'transform') {
      if (!element.animTransform) return;

      const animProp = element.animTransform[propKey as keyof ElementTransform] as AnimatableProperty;

      if (!animProp || typeof animProp !== 'object' || !('baseValue' in animProp)) {
        return;
      }

      const updatedKeyframes = removeKeyframeAtTime(animProp.keyframes, time);

      // If no keyframe was removed, don't update
      if (updatedKeyframes.length === animProp.keyframes.length) {
        return;
      }

      // Push history before making changes
      pushHistory(project);

      // Update the element
      set((state) => {
        if (!state.project) return state;

        return {
          project: {
            ...state.project,
            tracks: state.project.tracks.map(t =>
              t.id === trackId
                ? {
                    ...t,
                    elements: (t.elements as EditorElement[]).map(e =>
                      e.id === elementId
                        ? {
                            ...e,
                            animTransform: {
                              ...e.animTransform!,
                              [propKey]: {
                                ...animProp,
                                keyframes: updatedKeyframes,
                              },
                            },
                          }
                        : e
                    ),
                  }
                : t
            ),
          },
        };
      });
    }
    // Handle audio properties
    else if (rootKey === 'audio') {
      if (!element.audio) return;

      // Validate audio property key
      if (propKey !== 'volume' && propKey !== 'pan') {
        return;
      }

      const animProp = element.audio[propKey as keyof AudioProperties] as AnimatableProperty;

      if (!animProp || typeof animProp !== 'object' || !('baseValue' in animProp)) {
        return;
      }

      const updatedKeyframes = removeKeyframeAtTime(animProp.keyframes, time);

      // If no keyframe was removed, don't update
      if (updatedKeyframes.length === animProp.keyframes.length) {
        return;
      }

      // Push history before making changes
      pushHistory(project);

      // Update the element
      set((state) => {
        if (!state.project) return state;

        return {
          project: {
            ...state.project,
            tracks: state.project.tracks.map(t =>
              t.id === trackId
                ? {
                    ...t,
                    elements: (t.elements as EditorElement[]).map(e =>
                      e.id === elementId
                        ? {
                            ...e,
                            audio: {
                              ...e.audio!,
                              [propKey]: {
                                ...animProp,
                                keyframes: updatedKeyframes,
                              },
                            },
                          }
                        : e
                    ),
                  }
                : t
            ),
          },
        };
      });
    }
  },

  updateKeyframe: (trackId, elementId, property, oldTime, newTime, newValue) => {
    const { project, pushHistory } = get();
    if (!project) return;

    const track = project.tracks.find(t => t.id === trackId);
    const element = track?.elements.find(e => e.id === elementId) as EditorElement | undefined;
    if (!element) return;

    const parts = property.split('.');
    const rootKey = parts.length > 1 ? parts[0] : 'transform';
    const propKey = parts.length > 1 ? parts[1] : parts[0];

    // Validate supported root keys
    if (rootKey !== 'transform' && rootKey !== 'audio') {
      console.warn(`Keyframes for ${rootKey} properties are not yet supported`);
      return;
    }

    // Handle transform properties
    if (rootKey === 'transform') {
      if (!element.animTransform) return;

      const animProp = element.animTransform[propKey as keyof ElementTransform] as AnimatableProperty;

      if (!animProp || typeof animProp !== 'object' || !('baseValue' in animProp)) {
        return;
      }

      // Remove old keyframe and add new one
      let updatedKeyframes = removeKeyframeAtTime(animProp.keyframes, oldTime);

      // Only continue if we found and removed the old keyframe
      if (updatedKeyframes.length === animProp.keyframes.length) {
        return; // Old keyframe not found
      }

      // Find the old keyframe to preserve its easing settings
      const oldKeyframe = animProp.keyframes.find(kf => Math.abs(kf.time - oldTime) <= 0.01);

      const newKeyframe: AnimationKeyframe = {
        id: oldKeyframe?.id || generateId(),
        time: newTime,
        value: newValue,
        easing: oldKeyframe?.easing || 'linear',
        bezierIn: oldKeyframe?.bezierIn,
        bezierOut: oldKeyframe?.bezierOut,
      };

      updatedKeyframes = insertKeyframeSorted(updatedKeyframes, newKeyframe);

      // Push history before making changes
      pushHistory(project);

      // Update the element
      set((state) => {
        if (!state.project) return state;

        return {
          project: {
            ...state.project,
            tracks: state.project.tracks.map(t =>
              t.id === trackId
                ? {
                    ...t,
                    elements: (t.elements as EditorElement[]).map(e =>
                      e.id === elementId
                        ? {
                            ...e,
                            animTransform: {
                              ...e.animTransform!,
                              [propKey]: {
                                ...animProp,
                                keyframes: updatedKeyframes,
                              },
                            },
                          }
                        : e
                    ),
                  }
                : t
            ),
          },
        };
      });
    }
    // Handle audio properties
    else if (rootKey === 'audio') {
      if (!element.audio) return;

      // Validate audio property key
      if (propKey !== 'volume' && propKey !== 'pan') {
        return;
      }

      const animProp = element.audio[propKey as keyof AudioProperties] as AnimatableProperty;

      if (!animProp || typeof animProp !== 'object' || !('baseValue' in animProp)) {
        return;
      }

      // Remove old keyframe and add new one
      let updatedKeyframes = removeKeyframeAtTime(animProp.keyframes, oldTime);

      // Only continue if we found and removed the old keyframe
      if (updatedKeyframes.length === animProp.keyframes.length) {
        return; // Old keyframe not found
      }

      // Find the old keyframe to preserve its easing settings
      const oldKeyframe = animProp.keyframes.find(kf => Math.abs(kf.time - oldTime) <= 0.01);

      const newKeyframe: AnimationKeyframe = {
        id: oldKeyframe?.id || generateId(),
        time: newTime,
        value: newValue,
        easing: oldKeyframe?.easing || 'linear',
        bezierIn: oldKeyframe?.bezierIn,
        bezierOut: oldKeyframe?.bezierOut,
      };

      updatedKeyframes = insertKeyframeSorted(updatedKeyframes, newKeyframe);

      // Push history before making changes
      pushHistory(project);

      // Update the element
      set((state) => {
        if (!state.project) return state;

        return {
          project: {
            ...state.project,
            tracks: state.project.tracks.map(t =>
              t.id === trackId
                ? {
                    ...t,
                    elements: (t.elements as EditorElement[]).map(e =>
                      e.id === elementId
                        ? {
                            ...e,
                            audio: {
                              ...e.audio!,
                              [propKey]: {
                                ...animProp,
                                keyframes: updatedKeyframes,
                              },
                            },
                          }
                        : e
                    ),
                  }
                : t
            ),
          },
        };
      });
    }
  },

  // =========================================================================
  // Effect Parameter Keyframe Actions
  // =========================================================================

  addEffectKeyframe: (trackId, elementId, effectId, paramKey, time, value) => {
    const { project, pushHistory } = get();
    if (!project) return;

    const track = project.tracks.find(t => t.id === trackId);
    const element = track?.elements.find(e => e.id === elementId) as EditorElement | undefined;
    if (!element || !element.effects) return;

    const effectIndex = element.effects.findIndex(e => e.id === effectId);
    if (effectIndex === -1) return;

    const effect = element.effects[effectIndex];

    // Push history before making changes
    pushHistory(project);

    // Create new keyframe
    const newKeyframe: EffectParameterKeyframe = {
      id: generateId(),
      time,
      value,
      easing: 'linear',
    };

    // Get or create animatedParameters
    const animatedParams = effect.animatedParameters || {};
    const existingParam = animatedParams[paramKey];

    let updatedParam: AnimatableEffectParameter;
    if (existingParam) {
      // Insert keyframe in sorted order
      const keyframes = [...existingParam.keyframes];
      const insertIndex = keyframes.findIndex(kf => kf.time > time);
      if (insertIndex === -1) {
        keyframes.push(newKeyframe);
      } else {
        keyframes.splice(insertIndex, 0, newKeyframe);
      }
      updatedParam = { ...existingParam, keyframes };
    } else {
      // Create new animatable parameter
      updatedParam = {
        baseValue: effect.parameters[paramKey] ?? value,
        keyframes: [newKeyframe],
      };
    }

    // Update the element
    set((state) => {
      if (!state.project) return state;

      return {
        project: {
          ...state.project,
          tracks: state.project.tracks.map(t =>
            t.id === trackId
              ? {
                  ...t,
                  elements: (t.elements as EditorElement[]).map(e =>
                    e.id === elementId
                      ? {
                          ...e,
                          effects: e.effects?.map((eff, idx) =>
                            idx === effectIndex
                              ? {
                                  ...eff,
                                  animatedParameters: {
                                    ...eff.animatedParameters,
                                    [paramKey]: updatedParam,
                                  },
                                }
                              : eff
                          ),
                        }
                      : e
                  ),
                }
              : t
          ),
        },
      };
    });
  },

  removeEffectKeyframe: (trackId, elementId, effectId, paramKey, keyframeId) => {
    const { project, pushHistory } = get();
    if (!project) return;

    const track = project.tracks.find(t => t.id === trackId);
    const element = track?.elements.find(e => e.id === elementId) as EditorElement | undefined;
    if (!element || !element.effects) return;

    const effectIndex = element.effects.findIndex(e => e.id === effectId);
    if (effectIndex === -1) return;

    const effect = element.effects[effectIndex];
    const animParam = effect.animatedParameters?.[paramKey];
    if (!animParam) return;

    const updatedKeyframes = animParam.keyframes.filter(kf => kf.id !== keyframeId);

    // If no change, return
    if (updatedKeyframes.length === animParam.keyframes.length) return;

    // Push history before making changes
    pushHistory(project);

    // Update the element
    set((state) => {
      if (!state.project) return state;

      return {
        project: {
          ...state.project,
          tracks: state.project.tracks.map(t =>
            t.id === trackId
              ? {
                  ...t,
                  elements: (t.elements as EditorElement[]).map(e =>
                    e.id === elementId
                      ? {
                          ...e,
                          effects: e.effects?.map((eff, idx) =>
                            idx === effectIndex
                              ? {
                                  ...eff,
                                  animatedParameters: {
                                    ...eff.animatedParameters,
                                    [paramKey]: {
                                      ...animParam,
                                      keyframes: updatedKeyframes,
                                    },
                                  },
                                }
                              : eff
                          ),
                        }
                      : e
                  ),
                }
              : t
          ),
        },
      };
    });
  },

  updateEffectKeyframe: (trackId, elementId, effectId, paramKey, keyframeId, updates) => {
    const { project, pushHistory } = get();
    if (!project) return;

    const track = project.tracks.find(t => t.id === trackId);
    const element = track?.elements.find(e => e.id === elementId) as EditorElement | undefined;
    if (!element || !element.effects) return;

    const effectIndex = element.effects.findIndex(e => e.id === effectId);
    if (effectIndex === -1) return;

    const effect = element.effects[effectIndex];
    const animParam = effect.animatedParameters?.[paramKey];
    if (!animParam) return;

    const keyframeIndex = animParam.keyframes.findIndex(kf => kf.id === keyframeId);
    if (keyframeIndex === -1) return;

    // Push history before making changes
    pushHistory(project);

    // Update keyframe and re-sort if time changed
    let updatedKeyframes = animParam.keyframes.map((kf, idx) =>
      idx === keyframeIndex ? { ...kf, ...updates } : kf
    );

    // Re-sort if time was updated
    if (updates.time !== undefined) {
      updatedKeyframes = [...updatedKeyframes].sort((a, b) => a.time - b.time);
    }

    // Update the element
    set((state) => {
      if (!state.project) return state;

      return {
        project: {
          ...state.project,
          tracks: state.project.tracks.map(t =>
            t.id === trackId
              ? {
                  ...t,
                  elements: (t.elements as EditorElement[]).map(e =>
                    e.id === elementId
                      ? {
                          ...e,
                          effects: e.effects?.map((eff, idx) =>
                            idx === effectIndex
                              ? {
                                  ...eff,
                                  animatedParameters: {
                                    ...eff.animatedParameters,
                                    [paramKey]: {
                                      ...animParam,
                                      keyframes: updatedKeyframes,
                                    },
                                  },
                                }
                              : eff
                          ),
                        }
                      : e
                  ),
                }
              : t
          ),
        },
      };
    });
  },

  // =========================================================================
  // Mask Keyframe Actions
  // =========================================================================

  addMaskPropertyKeyframe: (trackId, elementId, maskId, property, time, value, easing = 'linear') => {
    const { project, pushHistory } = get();
    if (!project) return;

    const track = project.tracks.find(t => t.id === trackId);
    const element = track?.elements.find(e => e.id === elementId) as EditorElement | undefined;
    if (!element || !element.masks) return;

    const maskIndex = element.masks.findIndex(m => m.id === maskId);
    if (maskIndex === -1) return;

    const mask = element.masks[maskIndex];

    // Push history before making changes
    pushHistory(project);

    // Create new keyframe
    const newKeyframe = createMaskPropertyKeyframe(time, value, easing);

    // Get or create animation data
    const animation = mask.animation ?? {};
    const existingProp = animation[property];

    let updatedProp: AnimatableMaskProperty;
    if (existingProp) {
      updatedProp = {
        ...existingProp,
        keyframes: insertMaskKeyframeSorted(existingProp.keyframes, newKeyframe),
      };
    } else {
      updatedProp = {
        baseValue: mask[property],
        keyframes: [newKeyframe],
      };
    }

    // Update the element
    set((state) => {
      if (!state.project) return state;

      return {
        project: {
          ...state.project,
          tracks: state.project.tracks.map(t =>
            t.id === trackId
              ? {
                  ...t,
                  elements: (t.elements as EditorElement[]).map(e =>
                    e.id === elementId
                      ? {
                          ...e,
                          masks: e.masks?.map((m, idx) =>
                            idx === maskIndex
                              ? {
                                  ...m,
                                  animation: {
                                    ...m.animation,
                                    [property]: updatedProp,
                                  },
                                }
                              : m
                          ),
                        }
                      : e
                  ),
                }
              : t
          ),
        },
      };
    });
  },

  removeMaskPropertyKeyframe: (trackId, elementId, maskId, property, keyframeId) => {
    const { project, pushHistory } = get();
    if (!project) return;

    const track = project.tracks.find(t => t.id === trackId);
    const element = track?.elements.find(e => e.id === elementId) as EditorElement | undefined;
    if (!element || !element.masks) return;

    const maskIndex = element.masks.findIndex(m => m.id === maskId);
    if (maskIndex === -1) return;

    const mask = element.masks[maskIndex];
    const animProp = mask.animation?.[property];
    if (!animProp) return;

    const updatedKeyframes = removeMaskKeyframeById(animProp.keyframes, keyframeId);

    // If no change, return
    if (updatedKeyframes.length === animProp.keyframes.length) return;

    // Push history before making changes
    pushHistory(project);

    // Update the element
    set((state) => {
      if (!state.project) return state;

      return {
        project: {
          ...state.project,
          tracks: state.project.tracks.map(t =>
            t.id === trackId
              ? {
                  ...t,
                  elements: (t.elements as EditorElement[]).map(e =>
                    e.id === elementId
                      ? {
                          ...e,
                          masks: e.masks?.map((m, idx) =>
                            idx === maskIndex
                              ? {
                                  ...m,
                                  animation: {
                                    ...m.animation,
                                    [property]: {
                                      ...animProp,
                                      keyframes: updatedKeyframes,
                                    },
                                  },
                                }
                              : m
                          ),
                        }
                      : e
                  ),
                }
              : t
          ),
        },
      };
    });
  },

  updateMaskPropertyKeyframe: (trackId, elementId, maskId, property, keyframeId, updates) => {
    const { project, pushHistory } = get();
    if (!project) return;

    const track = project.tracks.find(t => t.id === trackId);
    const element = track?.elements.find(e => e.id === elementId) as EditorElement | undefined;
    if (!element || !element.masks) return;

    const maskIndex = element.masks.findIndex(m => m.id === maskId);
    if (maskIndex === -1) return;

    const mask = element.masks[maskIndex];
    const animProp = mask.animation?.[property];
    if (!animProp) return;

    const keyframeIndex = animProp.keyframes.findIndex(kf => kf.id === keyframeId);
    if (keyframeIndex === -1) return;

    // Push history before making changes
    pushHistory(project);

    // Update keyframe and re-sort if time changed
    let updatedKeyframes = animProp.keyframes.map((kf, idx) =>
      idx === keyframeIndex ? { ...kf, ...updates } : kf
    );

    // Re-sort if time was updated
    if (updates.time !== undefined) {
      updatedKeyframes = [...updatedKeyframes].sort((a, b) => a.time - b.time);
    }

    // Update the element
    set((state) => {
      if (!state.project) return state;

      return {
        project: {
          ...state.project,
          tracks: state.project.tracks.map(t =>
            t.id === trackId
              ? {
                  ...t,
                  elements: (t.elements as EditorElement[]).map(e =>
                    e.id === elementId
                      ? {
                          ...e,
                          masks: e.masks?.map((m, idx) =>
                            idx === maskIndex
                              ? {
                                  ...m,
                                  animation: {
                                    ...m.animation,
                                    [property]: {
                                      ...animProp,
                                      keyframes: updatedKeyframes,
                                    },
                                  },
                                }
                              : m
                          ),
                        }
                      : e
                  ),
                }
              : t
          ),
        },
      };
    });
  },

  addMaskShapeKeyframe: (trackId, elementId, maskId, time, shape, easing = 'linear') => {
    const { project, pushHistory } = get();
    if (!project) return;

    const track = project.tracks.find(t => t.id === trackId);
    const element = track?.elements.find(e => e.id === elementId) as EditorElement | undefined;
    if (!element || !element.masks) return;

    const maskIndex = element.masks.findIndex(m => m.id === maskId);
    if (maskIndex === -1) return;

    const mask = element.masks[maskIndex];

    // Push history before making changes
    pushHistory(project);

    // Create new shape keyframe
    const newKeyframe = createMaskShapeKeyframe(time, shape, easing);

    // Get or create animation data
    const animation = mask.animation ?? {};
    const existingKeyframes = animation.shapeKeyframes ?? [];

    // Update the element
    set((state) => {
      if (!state.project) return state;

      return {
        project: {
          ...state.project,
          tracks: state.project.tracks.map(t =>
            t.id === trackId
              ? {
                  ...t,
                  elements: (t.elements as EditorElement[]).map(e =>
                    e.id === elementId
                      ? {
                          ...e,
                          masks: e.masks?.map((m, idx) =>
                            idx === maskIndex
                              ? {
                                  ...m,
                                  animation: {
                                    ...m.animation,
                                    shapeKeyframes: insertMaskKeyframeSorted(existingKeyframes, newKeyframe),
                                  },
                                }
                              : m
                          ),
                        }
                      : e
                  ),
                }
              : t
          ),
        },
      };
    });
  },

  removeMaskShapeKeyframe: (trackId, elementId, maskId, keyframeId) => {
    const { project, pushHistory } = get();
    if (!project) return;

    const track = project.tracks.find(t => t.id === trackId);
    const element = track?.elements.find(e => e.id === elementId) as EditorElement | undefined;
    if (!element || !element.masks) return;

    const maskIndex = element.masks.findIndex(m => m.id === maskId);
    if (maskIndex === -1) return;

    const mask = element.masks[maskIndex];
    const shapeKeyframes = mask.animation?.shapeKeyframes;
    if (!shapeKeyframes) return;

    const updatedKeyframes = removeMaskKeyframeById(shapeKeyframes, keyframeId);

    // If no change, return
    if (updatedKeyframes.length === shapeKeyframes.length) return;

    // Push history before making changes
    pushHistory(project);

    // Update the element
    set((state) => {
      if (!state.project) return state;

      return {
        project: {
          ...state.project,
          tracks: state.project.tracks.map(t =>
            t.id === trackId
              ? {
                  ...t,
                  elements: (t.elements as EditorElement[]).map(e =>
                    e.id === elementId
                      ? {
                          ...e,
                          masks: e.masks?.map((m, idx) =>
                            idx === maskIndex
                              ? {
                                  ...m,
                                  animation: {
                                    ...m.animation,
                                    shapeKeyframes: updatedKeyframes,
                                  },
                                }
                              : m
                          ),
                        }
                      : e
                  ),
                }
              : t
          ),
        },
      };
    });
  },

  updateMaskShapeKeyframe: (trackId, elementId, maskId, keyframeId, updates) => {
    const { project, pushHistory } = get();
    if (!project) return;

    const track = project.tracks.find(t => t.id === trackId);
    const element = track?.elements.find(e => e.id === elementId) as EditorElement | undefined;
    if (!element || !element.masks) return;

    const maskIndex = element.masks.findIndex(m => m.id === maskId);
    if (maskIndex === -1) return;

    const mask = element.masks[maskIndex];
    const shapeKeyframes = mask.animation?.shapeKeyframes;
    if (!shapeKeyframes) return;

    const keyframeIndex = shapeKeyframes.findIndex(kf => kf.id === keyframeId);
    if (keyframeIndex === -1) return;

    // Push history before making changes
    pushHistory(project);

    // Update keyframe and re-sort if time changed
    let updatedKeyframes = shapeKeyframes.map((kf, idx) =>
      idx === keyframeIndex ? { ...kf, ...updates } : kf
    );

    // Re-sort if time was updated
    if (updates.time !== undefined) {
      updatedKeyframes = [...updatedKeyframes].sort((a, b) => a.time - b.time);
    }

    // Update the element
    set((state) => {
      if (!state.project) return state;

      return {
        project: {
          ...state.project,
          tracks: state.project.tracks.map(t =>
            t.id === trackId
              ? {
                  ...t,
                  elements: (t.elements as EditorElement[]).map(e =>
                    e.id === elementId
                      ? {
                          ...e,
                          masks: e.masks?.map((m, idx) =>
                            idx === maskIndex
                              ? {
                                  ...m,
                                  animation: {
                                    ...m.animation,
                                    shapeKeyframes: updatedKeyframes,
                                  },
                                }
                              : m
                          ),
                        }
                      : e
                  ),
                }
              : t
          ),
        },
      };
    });
  },
});
