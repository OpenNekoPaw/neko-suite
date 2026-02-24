// =============================================================================
// Apply Keyframe Operations — 关键帧操作的 apply 实现
// =============================================================================

import type { ProjectData } from '../types/project';
import type { KeyframeOperation, KeyframeTarget } from './types';
import type { Keyframe } from '../types/keyframe';
import type { EffectParameterKeyframe, AnimatableEffectParameter } from '../types/effects';
import type { MaskPropertyKeyframe, MaskShapeKeyframe, AnimatableMaskProperty } from '../types/mask';
import { updateElementInProject } from './helpers';
import { OperationError } from './errors';

/**
 * 解析 transform property 路径：
 * "transform.x" → rootKey="transform", propKey="x"
 * "audio.volume" → rootKey="audio", propKey="volume"
 * "x" → rootKey="transform", propKey="x"
 */
function parsePropertyPath(property: string): { rootKey: string; propKey: string } {
  const parts = property.split('.');
  if (parts.length === 2) {
    return { rootKey: parts[0]!, propKey: parts[1]! };
  }
  // 默认归属 transform
  return { rootKey: 'transform', propKey: parts[0]! };
}

export function applyKeyframeOperation(project: ProjectData, op: KeyframeOperation): ProjectData {
  const { trackId, elementId, target } = op.payload;

  switch (op.type) {
    case 'keyframe.add':
      return applyKeyframeAdd(project, trackId, elementId, target, op.payload.keyframe);

    case 'keyframe.remove':
      return applyKeyframeRemove(project, trackId, elementId, target, op.payload.keyframeId, op.payload.keyframeTime);

    case 'keyframe.update':
      return applyKeyframeUpdate(project, trackId, elementId, target, op.payload.keyframeId, op.payload.keyframeTime, op.payload.updates);
  }
}

function applyKeyframeAdd(
  project: ProjectData,
  trackId: string,
  elementId: string,
  target: KeyframeTarget,
  keyframe: any,
): ProjectData {
  return updateElementInProject(project, trackId, elementId, element => {
    const el = element as any;

    switch (target.kind) {
      case 'transform': {
        const { rootKey, propKey } = parsePropertyPath(target.property);
        const root = el[rootKey === 'transform' ? 'animTransform' : rootKey] ?? {};
        const prop = root[propKey] ?? { baseValue: 0, keyframes: [] };
        const kf = keyframe as Keyframe;
        const newKeyframes = [...prop.keyframes, kf].sort((a: any, b: any) => a.time - b.time);
        return {
          ...element,
          [rootKey === 'transform' ? 'animTransform' : rootKey]: {
            ...root,
            [propKey]: { ...prop, keyframes: newKeyframes },
          },
        } as any;
      }

      case 'effect': {
        const effects = [...(el.effects ?? [])];
        const effectIdx = effects.findIndex((e: any) => e.id === target.effectId);
        if (effectIdx === -1) throw OperationError.effectNotFound(target.effectId);
        const effect = { ...effects[effectIdx] };
        const animParams = { ...(effect.animatedParameters ?? {}) };
        const param: AnimatableEffectParameter = animParams[target.paramKey] ?? { baseValue: 0, keyframes: [] };
        const kf = keyframe as EffectParameterKeyframe;
        const newKeyframes = [...param.keyframes, kf].sort((a, b) => a.time - b.time);
        animParams[target.paramKey] = { ...param, keyframes: newKeyframes };
        effect.animatedParameters = animParams;
        effects[effectIdx] = effect;
        return { ...element, effects } as any;
      }

      case 'maskProperty': {
        const masks = [...(el.masks ?? [])];
        const maskIdx = masks.findIndex((m: any) => m.id === target.maskId);
        if (maskIdx === -1) throw OperationError.maskNotFound(target.maskId);
        const mask = { ...masks[maskIdx] };
        const animation = { ...(mask.animation ?? {}) };
        const prop: AnimatableMaskProperty = animation[target.property] ?? { baseValue: 0, keyframes: [] };
        const kf = keyframe as MaskPropertyKeyframe;
        const newKeyframes = [...prop.keyframes, kf].sort((a, b) => a.time - b.time);
        animation[target.property] = { ...prop, keyframes: newKeyframes };
        mask.animation = animation;
        masks[maskIdx] = mask;
        return { ...element, masks } as any;
      }

      case 'maskShape': {
        const masks = [...(el.masks ?? [])];
        const maskIdx = masks.findIndex((m: any) => m.id === target.maskId);
        if (maskIdx === -1) throw OperationError.maskNotFound(target.maskId);
        const mask = { ...masks[maskIdx] };
        const animation = { ...(mask.animation ?? {}) };
        const kf = keyframe as MaskShapeKeyframe;
        const shapeKeyframes = [...(animation.shapeKeyframes ?? []), kf].sort((a, b) => a.time - b.time);
        animation.shapeKeyframes = shapeKeyframes;
        mask.animation = animation;
        masks[maskIdx] = mask;
        return { ...element, masks } as any;
      }
    }
  });
}

function applyKeyframeRemove(
  project: ProjectData,
  trackId: string,
  elementId: string,
  target: KeyframeTarget,
  keyframeId?: string,
  keyframeTime?: number,
): ProjectData {
  const matchFn = (kf: any) =>
    keyframeId ? kf.id === keyframeId : kf.time === keyframeTime;

  return updateElementInProject(project, trackId, elementId, element => {
    const el = element as any;

    switch (target.kind) {
      case 'transform': {
        const { rootKey, propKey } = parsePropertyPath(target.property);
        const storeKey = rootKey === 'transform' ? 'animTransform' : rootKey;
        const root = el[storeKey] ?? {};
        const prop = root[propKey];
        if (!prop) return element;
        return {
          ...element,
          [storeKey]: {
            ...root,
            [propKey]: { ...prop, keyframes: prop.keyframes.filter((kf: any) => !matchFn(kf)) },
          },
        } as any;
      }

      case 'effect': {
        const effects = [...(el.effects ?? [])];
        const effectIdx = effects.findIndex((e: any) => e.id === target.effectId);
        if (effectIdx === -1) throw OperationError.effectNotFound(target.effectId);
        const effect = { ...effects[effectIdx] };
        const animParams = { ...(effect.animatedParameters ?? {}) };
        const param = animParams[target.paramKey];
        if (!param) return element;
        animParams[target.paramKey] = { ...param, keyframes: param.keyframes.filter((kf: any) => !matchFn(kf)) };
        effect.animatedParameters = animParams;
        effects[effectIdx] = effect;
        return { ...element, effects } as any;
      }

      case 'maskProperty': {
        const masks = [...(el.masks ?? [])];
        const maskIdx = masks.findIndex((m: any) => m.id === target.maskId);
        if (maskIdx === -1) throw OperationError.maskNotFound(target.maskId);
        const mask = { ...masks[maskIdx] };
        const animation = { ...(mask.animation ?? {}) };
        const prop = animation[target.property];
        if (!prop) return element;
        animation[target.property] = { ...prop, keyframes: prop.keyframes.filter((kf: any) => !matchFn(kf)) };
        mask.animation = animation;
        masks[maskIdx] = mask;
        return { ...element, masks } as any;
      }

      case 'maskShape': {
        const masks = [...(el.masks ?? [])];
        const maskIdx = masks.findIndex((m: any) => m.id === target.maskId);
        if (maskIdx === -1) throw OperationError.maskNotFound(target.maskId);
        const mask = { ...masks[maskIdx] };
        const animation = { ...(mask.animation ?? {}) };
        animation.shapeKeyframes = (animation.shapeKeyframes ?? []).filter((kf: any) => !matchFn(kf));
        mask.animation = animation;
        masks[maskIdx] = mask;
        return { ...element, masks } as any;
      }
    }
  });
}

function applyKeyframeUpdate(
  project: ProjectData,
  trackId: string,
  elementId: string,
  target: KeyframeTarget,
  keyframeId: string | undefined,
  keyframeTime: number | undefined,
  updates: any,
): ProjectData {
  const matchFn = (kf: any) =>
    keyframeId ? kf.id === keyframeId : kf.time === keyframeTime;

  return updateElementInProject(project, trackId, elementId, element => {
    const el = element as any;

    switch (target.kind) {
      case 'transform': {
        const { rootKey, propKey } = parsePropertyPath(target.property);
        const storeKey = rootKey === 'transform' ? 'animTransform' : rootKey;
        const root = el[storeKey] ?? {};
        const prop = root[propKey];
        if (!prop) return element;
        let newKeyframes = prop.keyframes.map((kf: any) =>
          matchFn(kf) ? { ...kf, ...updates } : kf,
        );
        // 如果 time 变化，重新排序
        if ('time' in updates) {
          newKeyframes = newKeyframes.sort((a: any, b: any) => a.time - b.time);
        }
        return {
          ...element,
          [storeKey]: {
            ...root,
            [propKey]: { ...prop, keyframes: newKeyframes },
          },
        } as any;
      }

      case 'effect': {
        const effects = [...(el.effects ?? [])];
        const effectIdx = effects.findIndex((e: any) => e.id === target.effectId);
        if (effectIdx === -1) throw OperationError.effectNotFound(target.effectId);
        const effect = { ...effects[effectIdx] };
        const animParams = { ...(effect.animatedParameters ?? {}) };
        const param = animParams[target.paramKey];
        if (!param) return element;
        let newKeyframes = param.keyframes.map((kf: any) =>
          matchFn(kf) ? { ...kf, ...updates } : kf,
        );
        if ('time' in updates) {
          newKeyframes = newKeyframes.sort((a: any, b: any) => a.time - b.time);
        }
        animParams[target.paramKey] = { ...param, keyframes: newKeyframes };
        effect.animatedParameters = animParams;
        effects[effectIdx] = effect;
        return { ...element, effects } as any;
      }

      case 'maskProperty': {
        const masks = [...(el.masks ?? [])];
        const maskIdx = masks.findIndex((m: any) => m.id === target.maskId);
        if (maskIdx === -1) throw OperationError.maskNotFound(target.maskId);
        const mask = { ...masks[maskIdx] };
        const animation = { ...(mask.animation ?? {}) };
        const prop = animation[target.property];
        if (!prop) return element;
        let newKeyframes = prop.keyframes.map((kf: any) =>
          matchFn(kf) ? { ...kf, ...updates } : kf,
        );
        if ('time' in updates) {
          newKeyframes = newKeyframes.sort((a: any, b: any) => a.time - b.time);
        }
        animation[target.property] = { ...prop, keyframes: newKeyframes };
        mask.animation = animation;
        masks[maskIdx] = mask;
        return { ...element, masks } as any;
      }

      case 'maskShape': {
        const masks = [...(el.masks ?? [])];
        const maskIdx = masks.findIndex((m: any) => m.id === target.maskId);
        if (maskIdx === -1) throw OperationError.maskNotFound(target.maskId);
        const mask = { ...masks[maskIdx] };
        const animation = { ...(mask.animation ?? {}) };
        let shapeKeyframes = (animation.shapeKeyframes ?? []).map((kf: any) =>
          matchFn(kf) ? { ...kf, ...updates } : kf,
        );
        if ('time' in updates) {
          shapeKeyframes = shapeKeyframes.sort((a: any, b: any) => a.time - b.time);
        }
        animation.shapeKeyframes = shapeKeyframes;
        mask.animation = animation;
        masks[maskIdx] = mask;
        return { ...element, masks } as any;
      }
    }
  });
}
