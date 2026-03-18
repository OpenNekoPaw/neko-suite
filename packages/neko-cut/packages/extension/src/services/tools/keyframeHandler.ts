/**
 * Handler for keyframe operations:
 * GetKeyframes, AddKeyframe, UpdateKeyframe, RemoveKeyframe, AddAudioKeyframe.
 */

import type { ProjectData } from '@neko/shared';
import type { IToolHandler, ToolApplyResult } from './types';
import {
  findElement,
  updateElementAt,
  mergeElement,
  getLegacyKeyframes,
  type LegacyKeyframe,
} from './helpers';

export class KeyframeHandler implements IToolHandler {
  readonly toolNames = [
    'GetKeyframes',
    'AddKeyframe',
    'UpdateKeyframe',
    'RemoveKeyframe',
    'AddAudioKeyframe',
  ] as const;

  apply(project: ProjectData, toolName: string, params: Record<string, unknown>): ToolApplyResult {
    switch (toolName) {
      case 'GetKeyframes':
        return this.getKeyframes(project, params);
      case 'AddKeyframe':
        return this.addKeyframe(project, params);
      case 'UpdateKeyframe':
        return this.updateKeyframe(project, params);
      case 'RemoveKeyframe':
        return this.removeKeyframe(project, params);
      case 'AddAudioKeyframe':
        return this.addAudioKeyframe(project, params);
      default:
        return { success: false, error: `Unknown tool: ${toolName}` };
    }
  }

  private getKeyframes(project: ProjectData, params: Record<string, unknown>): ToolApplyResult {
    const { elementId, property } = params as { elementId?: string; property?: string };
    if (!elementId) return { success: false, error: 'elementId is required' };

    const found = findElement(project, elementId);
    if (!found) return { success: false, error: `Element not found: ${elementId}` };

    const keyframes = getLegacyKeyframes(found.element);
    const result = property ? { [property]: keyframes[property] || [] } : keyframes;

    return { success: true, data: { elementId, keyframes: result } };
  }

  private addKeyframe(project: ProjectData, params: Record<string, unknown>): ToolApplyResult {
    const { elementId, property, time, value, easing } = params as {
      elementId?: string;
      property?: string;
      time?: number;
      value?: unknown;
      easing?: string;
    };

    if (!elementId || !property || time === undefined || value === undefined) {
      return { success: false, error: 'elementId, property, time, and value are required' };
    }

    const found = findElement(project, elementId);
    if (!found) return { success: false, error: `Element not found: ${elementId}` };

    const keyframes = { ...getLegacyKeyframes(found.element) };
    const propertyKeyframes = [...(keyframes[property] || [])];

    const keyframeId = `kf-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    const keyframe: LegacyKeyframe = {
      id: keyframeId,
      time,
      value,
      easing: easing || 'linear',
    };

    const insertIndex = propertyKeyframes.findIndex((kf) => kf.time > time);
    if (insertIndex === -1) propertyKeyframes.push(keyframe);
    else propertyKeyframes.splice(insertIndex, 0, keyframe);

    keyframes[property] = propertyKeyframes;

    const updatedElement = mergeElement(found.element, { keyframes });
    const updatedProject = updateElementAt(
      project,
      found.trackIndex,
      found.elementIndex,
      updatedElement,
    );

    return {
      success: true,
      data: { keyframeId, message: 'Keyframe added successfully' },
      updatedProject,
    };
  }

  private updateKeyframe(project: ProjectData, params: Record<string, unknown>): ToolApplyResult {
    const { elementId, keyframeId, time, value, easing } = params as {
      elementId?: string;
      keyframeId?: string;
      time?: number;
      value?: unknown;
      easing?: string;
    };

    if (!elementId || !keyframeId)
      return { success: false, error: 'elementId and keyframeId are required' };

    const found = findElement(project, elementId);
    if (!found) return { success: false, error: `Element not found: ${elementId}` };

    const keyframes = { ...getLegacyKeyframes(found.element) };
    let updated = false;

    for (const prop of Object.keys(keyframes)) {
      const propKeyframes = [...(keyframes[prop] ?? [])];
      const idx = propKeyframes.findIndex((kf) => kf.id === keyframeId);
      if (idx === -1) continue;

      const next = { ...propKeyframes[idx]! };
      if (time !== undefined) next.time = time;
      if (value !== undefined) next.value = value;
      if (easing !== undefined) next.easing = easing;

      propKeyframes[idx] = next;
      if (time !== undefined) {
        propKeyframes.sort((a, b) => a.time - b.time);
      }

      keyframes[prop] = propKeyframes;
      updated = true;
      break;
    }

    if (!updated) return { success: false, error: `Keyframe not found: ${keyframeId}` };

    const updatedElement = mergeElement(found.element, { keyframes });
    const updatedProject = updateElementAt(
      project,
      found.trackIndex,
      found.elementIndex,
      updatedElement,
    );
    return {
      success: true,
      data: { keyframeId, message: 'Keyframe updated successfully' },
      updatedProject,
    };
  }

  private removeKeyframe(project: ProjectData, params: Record<string, unknown>): ToolApplyResult {
    const { elementId, keyframeId } = params as { elementId?: string; keyframeId?: string };
    if (!elementId || !keyframeId)
      return { success: false, error: 'elementId and keyframeId are required' };

    const found = findElement(project, elementId);
    if (!found) return { success: false, error: `Element not found: ${elementId}` };

    const keyframes = { ...getLegacyKeyframes(found.element) };
    let removed = false;

    for (const prop of Object.keys(keyframes)) {
      const before = keyframes[prop] ?? [];
      const after = before.filter((kf) => kf.id !== keyframeId);
      if (after.length !== before.length) {
        keyframes[prop] = after;
        removed = true;
        break;
      }
    }

    if (!removed) return { success: false, error: `Keyframe not found: ${keyframeId}` };

    const updatedElement = mergeElement(found.element, { keyframes });
    const updatedProject = updateElementAt(
      project,
      found.trackIndex,
      found.elementIndex,
      updatedElement,
    );
    return { success: true, data: { message: 'Keyframe removed successfully' }, updatedProject };
  }

  private addAudioKeyframe(project: ProjectData, params: Record<string, unknown>): ToolApplyResult {
    const { elementId, property, time, value, easing } = params as {
      elementId?: string;
      property?: string;
      time?: number;
      value?: number;
      easing?: string;
    };

    if (!elementId || !property || time === undefined || value === undefined) {
      return { success: false, error: 'elementId, property, time, and value are required' };
    }

    const validProperties = ['volume', 'pan'];
    if (!validProperties.includes(property)) {
      return {
        success: false,
        error: `Invalid property: ${property}. Valid: ${validProperties.join(', ')}`,
      };
    }

    const found = findElement(project, elementId);
    if (!found) return { success: false, error: `Element not found: ${elementId}` };

    const audioKeyframes = { ...(found.element.audioKeyframes || {}) } as Record<string, unknown[]>;
    const propertyKeyframes = [...(audioKeyframes[property] || [])];

    const keyframeId = `akf-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
    const keyframe = { id: keyframeId, time, value, easing: easing || 'linear' };

    const insertIndex = propertyKeyframes.findIndex((kf) => (kf as { time?: number }).time! > time);
    if (insertIndex === -1) propertyKeyframes.push(keyframe);
    else propertyKeyframes.splice(insertIndex, 0, keyframe);

    audioKeyframes[property] = propertyKeyframes;

    const updatedElement = mergeElement(found.element, { audioKeyframes });
    const updatedProject = updateElementAt(
      project,
      found.trackIndex,
      found.elementIndex,
      updatedElement,
    );
    return {
      success: true,
      data: { keyframeId, message: 'Audio keyframe added successfully' },
      updatedProject,
    };
  }
}
