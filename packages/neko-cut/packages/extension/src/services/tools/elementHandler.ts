/**
 * Handler for element CRUD: AddElement, UpdateElement, DeleteElement, TrimElement, SplitElement.
 */

import type { ProjectData, TimelineElement, TimelineTrack } from '@neko/shared';
import { CENTERED_TRANSFORM, DEFAULT_AUDIO_PROPERTIES, generateId } from '@neko/shared';
import type { IToolHandler, ToolApplyResult } from './types';
import { findElement, updateElementAt, removeElementAt } from './helpers';

export class ElementHandler implements IToolHandler {
  readonly toolNames = [
    'AddElement',
    'UpdateElement',
    'DeleteElement',
    'TrimElement',
    'SplitElement',
  ] as const;

  apply(project: ProjectData, toolName: string, params: Record<string, unknown>): ToolApplyResult {
    switch (toolName) {
      case 'AddElement':
        return this.addElement(project, params);
      case 'UpdateElement':
        return this.updateElement(project, params);
      case 'DeleteElement':
        return this.deleteElement(project, params);
      case 'TrimElement':
        return this.trimElement(project, params);
      case 'SplitElement':
        return this.splitElement(project, params);
      default:
        return { success: false, error: `Unknown tool: ${toolName}` };
    }
  }

  private addElement(project: ProjectData, params: Record<string, unknown>): ToolApplyResult {
    const { trackId, type, startTime, duration, src, content, transform } = params as {
      trackId?: string;
      type?: string;
      startTime?: number;
      duration?: number;
      src?: string;
      content?: string;
      transform?: Partial<{
        x: number;
        y: number;
        scaleX: number;
        scaleY: number;
        rotation: number;
      }>;
    };

    if (!trackId || !type || startTime === undefined || duration === undefined) {
      return { success: false, error: 'trackId, type, startTime, and duration are required' };
    }

    const trackIndex = project.tracks.findIndex((t) => t.id === trackId);
    if (trackIndex === -1) return { success: false, error: `Track not found: ${trackId}` };

    const elementId = generateId();
    const elementTransform = {
      ...CENTERED_TRANSFORM,
      ...(transform?.x !== undefined && { x: transform.x }),
      ...(transform?.y !== undefined && { y: transform.y }),
      ...(transform?.scaleX !== undefined && { scaleX: transform.scaleX }),
      ...(transform?.scaleY !== undefined && { scaleY: transform.scaleY }),
      ...(transform?.rotation !== undefined && { rotation: transform.rotation }),
    };

    let newElement: TimelineElement;

    switch (type) {
      case 'media': {
        if (!src) return { success: false, error: 'src is required for media elements' };
        newElement = {
          id: elementId,
          type: 'media',
          name: src.split('/').pop() || 'media',
          src,
          startTime,
          duration,
          trimStart: 0,
          trimEnd: 0,
          transform: elementTransform,
        } as unknown as TimelineElement;
        break;
      }
      case 'audio': {
        if (!src) return { success: false, error: 'src is required for audio elements' };
        newElement = {
          id: elementId,
          type: 'audio',
          name: src.split('/').pop() || 'audio',
          src,
          startTime,
          duration,
          trimStart: 0,
          trimEnd: 0,
          transform: elementTransform,
          audio: { ...DEFAULT_AUDIO_PROPERTIES },
        } as unknown as TimelineElement;
        break;
      }
      case 'text': {
        newElement = {
          id: elementId,
          type: 'text',
          name: 'Text',
          content: content || 'New Text',
          startTime,
          duration,
          trimStart: 0,
          trimEnd: 0,
          transform: elementTransform,
          fontSize: 48,
          fontFamily: 'Arial',
          fontWeight: 'normal',
          fontStyle: 'normal',
          textDecoration: 'none',
          color: '#ffffff',
          backgroundColor: 'transparent',
          textAlign: 'center',
          x: 0.5,
          y: 0.5,
          rotation: 0,
          opacity: 1,
        } as unknown as TimelineElement;
        break;
      }
      case 'shape': {
        newElement = {
          id: elementId,
          type: 'shape',
          name: 'Shape',
          startTime,
          duration,
          trimStart: 0,
          trimEnd: 0,
          transform: elementTransform,
          shapes: [],
        } as unknown as TimelineElement;
        break;
      }
      default:
        return { success: false, error: `Invalid element type: ${type}` };
    }

    const track = project.tracks[trackIndex]!;
    const updatedTrack: TimelineTrack = {
      ...track,
      elements: [...track.elements, newElement],
    };
    const updatedTracks = [...project.tracks];
    updatedTracks[trackIndex] = updatedTrack;

    return {
      success: true,
      data: { elementId, message: 'Element added successfully' },
      updatedProject: { ...project, tracks: updatedTracks },
    };
  }

  private updateElement(project: ProjectData, params: Record<string, unknown>): ToolApplyResult {
    const { elementId, startTime, duration, transform, content, opacity } = params as {
      elementId?: string;
      startTime?: number;
      duration?: number;
      transform?: Partial<{
        x: number;
        y: number;
        scaleX: number;
        scaleY: number;
        rotation: number;
      }>;
      content?: string;
      opacity?: number;
    };

    if (!elementId) return { success: false, error: 'elementId is required' };

    const found = findElement(project, elementId);
    if (!found) return { success: false, error: `Element not found: ${elementId}` };

    const element = found.element;

    const updates: Record<string, unknown> = {};
    if (startTime !== undefined) updates.startTime = startTime;
    if (duration !== undefined) updates.duration = duration;
    if (opacity !== undefined) updates.opacity = opacity;

    if (transform) {
      const currentTransform = element.transform || CENTERED_TRANSFORM;
      updates.transform = {
        ...currentTransform,
        ...(transform.x !== undefined && { x: transform.x }),
        ...(transform.y !== undefined && { y: transform.y }),
        ...(transform.scaleX !== undefined && { scaleX: transform.scaleX }),
        ...(transform.scaleY !== undefined && { scaleY: transform.scaleY }),
        ...(transform.rotation !== undefined && { rotation: transform.rotation }),
      };
    }

    if (content !== undefined && element.type === 'text') {
      updates.content = content;
    }

    const updatedElement = { ...element, ...updates } as TimelineElement;
    const updatedProject = updateElementAt(
      project,
      found.trackIndex,
      found.elementIndex,
      updatedElement,
    );

    return {
      success: true,
      data: { elementId, message: 'Element updated successfully' },
      updatedProject,
    };
  }

  private deleteElement(project: ProjectData, params: Record<string, unknown>): ToolApplyResult {
    const elementId = params.elementId as string | undefined;
    if (!elementId) return { success: false, error: 'elementId is required' };

    const found = findElement(project, elementId);
    if (!found) return { success: false, error: `Element not found: ${elementId}` };

    const updatedProject = removeElementAt(project, found.trackIndex, found.elementIndex);
    return { success: true, data: { message: 'Element deleted successfully' }, updatedProject };
  }

  private trimElement(project: ProjectData, params: Record<string, unknown>): ToolApplyResult {
    const { elementId, trimStart, trimEnd } = params as {
      elementId?: string;
      trimStart?: number;
      trimEnd?: number;
    };
    if (!elementId) return { success: false, error: 'elementId is required' };
    if (trimStart === undefined && trimEnd === undefined) {
      return { success: false, error: 'At least one of trimStart or trimEnd is required' };
    }

    const found = findElement(project, elementId);
    if (!found) return { success: false, error: `Element not found: ${elementId}` };

    const element = found.element;
    const newTrimStart = trimStart ?? element.trimStart;
    const newTrimEnd = trimEnd ?? element.trimEnd;

    const effectiveDuration = element.duration - newTrimStart - newTrimEnd;
    if (effectiveDuration <= 0)
      return { success: false, error: 'Trim values would result in zero or negative duration' };
    if (newTrimStart < 0 || newTrimEnd < 0)
      return { success: false, error: 'Trim values cannot be negative' };
    if (newTrimStart + newTrimEnd >= element.duration)
      return { success: false, error: 'Total trim cannot exceed element duration' };

    const updatedElement = {
      ...element,
      trimStart: newTrimStart,
      trimEnd: newTrimEnd,
    } as TimelineElement;
    const updatedProject = updateElementAt(
      project,
      found.trackIndex,
      found.elementIndex,
      updatedElement,
    );
    return {
      success: true,
      data: {
        elementId,
        trimStart: newTrimStart,
        trimEnd: newTrimEnd,
        effectiveDuration,
        message: 'Element trimmed successfully',
      },
      updatedProject,
    };
  }

  private splitElement(project: ProjectData, params: Record<string, unknown>): ToolApplyResult {
    const { elementId, splitTime } = params as { elementId?: string; splitTime?: number };
    if (!elementId) return { success: false, error: 'elementId is required' };
    if (splitTime === undefined || splitTime <= 0)
      return { success: false, error: 'splitTime must be a positive number' };

    const found = findElement(project, elementId);
    if (!found) return { success: false, error: `Element not found: ${elementId}` };

    const element = found.element;
    const effectiveDuration = element.duration - element.trimStart - element.trimEnd;
    if (splitTime >= effectiveDuration)
      return { success: false, error: 'splitTime must be less than element effective duration' };

    const actualSplitPoint = element.trimStart + splitTime;

    const leftElement: TimelineElement = {
      ...element,
      trimEnd: element.duration - actualSplitPoint,
    } as TimelineElement;

    const rightElement: TimelineElement = {
      ...element,
      id: generateId(),
      startTime: element.startTime + splitTime,
      trimStart: actualSplitPoint,
    } as TimelineElement;

    const track = project.tracks[found.trackIndex]!;
    const updatedElements = [...track.elements];
    updatedElements.splice(found.elementIndex, 1, leftElement, rightElement);
    const updatedTrack: TimelineTrack = { ...track, elements: updatedElements };
    const updatedTracks = [...project.tracks];
    updatedTracks[found.trackIndex] = updatedTrack;

    return {
      success: true,
      data: {
        leftElementId: leftElement.id,
        rightElementId: rightElement.id,
        splitPoint: splitTime,
        message: 'Element split successfully',
      },
      updatedProject: { ...project, tracks: updatedTracks },
    };
  }
}
