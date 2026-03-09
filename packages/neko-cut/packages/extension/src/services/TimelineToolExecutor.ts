/**
 * TimelineToolExecutor
 *
 * 将 timeline 工具（对 ProjectData 的确定性变换）下沉到 Extension 执行：
 * - 优先使用活动 VideoEditorModel（写回触发 VSCode undo/redo）
 * - 无活动编辑器时，回退到 ProjectSession（可选落盘/内存态）
 */

import * as path from 'path';
import * as vscode from 'vscode';
import type {
  ProjectData,
  TimelineElement,
  TimelineTrack,
  ShapeType,
  Shape,
  ShapeStyle,
  ShapeInstance,
} from '@neko/shared';

/**
 * Tool execution result (local type, replaces @neko/agent ToolResult)
 */
interface ToolResult {
  success: boolean;
  error?: string;
  data?: unknown;
  duration?: number;
}
import {
  DEFAULT_AUDIO_PROPERTIES,
  DEFAULT_COLOR_CORRECTION,
  DEFAULT_SHAPE_STYLE,
  CENTERED_TRANSFORM,
  createDefaultProject,
  generateId,
  getTotalDuration,
} from '@neko/shared';
import { getService } from '../base';
import { IEditorRegistry } from '../editor/common/editorRegistry';
import type { VideoEditorModel } from '../editor/video/videoEditorModel';
import { IProjectSessionService } from './ProjectSessionService';

type ToolApplyResult =
  | { success: true; data?: unknown; updatedProject?: ProjectData }
  | { success: false; error: string };

function toRelativeIfAbsolute(filePath: string, baseDir: string): string {
  if (!path.isAbsolute(filePath)) {
    return filePath;
  }

  let relativePath = path.relative(baseDir, filePath);
  relativePath = relativePath.split(path.sep).join('/');
  return relativePath;
}

function normalizePathsForSave(project: ProjectData, projectFilePath?: string): ProjectData {
  if (!projectFilePath) {
    return project;
  }

  const baseDir = path.dirname(projectFilePath);

  return {
    ...project,
    tracks: project.tracks.map((track) => ({
      ...track,
      elements: track.elements.map((element) => {
        const elementAny = element as unknown as { src?: unknown };
        if (typeof elementAny.src !== 'string') {
          return element;
        }
        return {
          ...element,
          src: toRelativeIfAbsolute(elementAny.src, baseDir),
        } as TimelineElement;
      }),
    })),
  };
}

function findElement(
  project: ProjectData,
  elementId: string,
): {
  trackIndex: number;
  elementIndex: number;
  track: TimelineTrack;
  element: TimelineElement;
} | null {
  for (let trackIndex = 0; trackIndex < project.tracks.length; trackIndex++) {
    const track = project.tracks[trackIndex];
    const elementIndex = track.elements.findIndex((e) => e.id === elementId);
    if (elementIndex !== -1) {
      return {
        trackIndex,
        elementIndex,
        track,
        element: track.elements[elementIndex],
      };
    }
  }
  return null;
}

function updateElementAt(
  project: ProjectData,
  trackIndex: number,
  elementIndex: number,
  updatedElement: TimelineElement,
): ProjectData {
  const track = project.tracks[trackIndex];
  const updatedElements = [...track.elements];
  updatedElements[elementIndex] = updatedElement;
  const updatedTrack: TimelineTrack = { ...track, elements: updatedElements };
  const updatedTracks = [...project.tracks];
  updatedTracks[trackIndex] = updatedTrack;
  return { ...project, tracks: updatedTracks };
}

function removeElementAt(
  project: ProjectData,
  trackIndex: number,
  elementIndex: number,
): ProjectData {
  const track = project.tracks[trackIndex];
  const updatedElements = [...track.elements];
  updatedElements.splice(elementIndex, 1);
  const updatedTrack: TimelineTrack = { ...track, elements: updatedElements };
  const updatedTracks = [...project.tracks];
  updatedTracks[trackIndex] = updatedTrack;
  return { ...project, tracks: updatedTracks };
}

// ---------------------------------------------------------------------------
// Shapes（复刻 webview 的默认工厂，避免依赖 webview 代码）
// ---------------------------------------------------------------------------

function createShapeId(): string {
  return `shape-${generateId()}`;
}

function createDefaultShapeStyle(): ShapeStyle {
  return structuredClone(DEFAULT_SHAPE_STYLE);
}

function createRectangleShape(centerX = 50, centerY = 50, width = 40, height = 30): Shape {
  return {
    shapeType: 'rectangle',
    centerX,
    centerY,
    width,
    height,
    rotation: 0,
    cornerRadius: 0,
  };
}

function createEllipseShape(centerX = 50, centerY = 50, radiusX = 20, radiusY = 15): Shape {
  return {
    shapeType: 'ellipse',
    centerX,
    centerY,
    radiusX,
    radiusY,
    rotation: 0,
  };
}

function createPolygonShape(sides = 6): Shape {
  const points: Array<{ x: number; y: number }> = [];
  const centerX = 50;
  const centerY = 50;
  const radius = 25;

  for (let i = 0; i < sides; i++) {
    const angle = (Math.PI * 2 * i) / sides - Math.PI / 2;
    points.push({
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
    });
  }

  return {
    shapeType: 'polygon',
    points,
  };
}

function createStarShape(centerX = 50, centerY = 50, points = 5, outerRadius = 25): Shape {
  return {
    shapeType: 'star',
    centerX,
    centerY,
    points,
    outerRadius,
    innerRadiusRatio: 0.4,
    rotation: 0,
  };
}

function createLineShape(startX = 25, startY = 50, endX = 75, endY = 50): Shape {
  return {
    shapeType: 'line',
    startX,
    startY,
    endX,
    endY,
  };
}

function createBezierShape(): Shape {
  return {
    shapeType: 'bezier',
    points: [
      {
        anchor: { x: 25, y: 50 },
        handleIn: { x: 0, y: 0 },
        handleOut: { x: 10, y: -20 },
        linkedHandles: true,
      },
      {
        anchor: { x: 75, y: 50 },
        handleIn: { x: -10, y: -20 },
        handleOut: { x: 0, y: 0 },
        linkedHandles: true,
      },
    ],
    closed: false,
  };
}

function createShapeInstance(
  shape: Shape,
  name?: string,
  style?: Partial<ShapeStyle>,
): ShapeInstance {
  return {
    id: createShapeId(),
    name: name || `Shape ${shape.shapeType}`,
    shape,
    style: {
      ...createDefaultShapeStyle(),
      ...(style || {}),
    },
    zIndex: 0,
    visible: true,
    locked: false,
  };
}

function applyStyleOverrides(baseStyle: ShapeStyle, style?: Record<string, unknown>): ShapeStyle {
  if (!style || typeof style !== 'object') {
    return baseStyle;
  }

  const next = structuredClone(baseStyle);
  const styleAny = style as Partial<ShapeStyle> & {
    fillColor?: string;
    strokeColor?: string;
    strokeWidth?: number;
    opacity?: number;
  };

  if (styleAny.fill && typeof styleAny.fill === 'object') {
    next.fill = { ...next.fill, ...(styleAny.fill as ShapeStyle['fill']) };
  }
  if (styleAny.stroke && typeof styleAny.stroke === 'object') {
    next.stroke = { ...next.stroke, ...(styleAny.stroke as ShapeStyle['stroke']) };
  }
  if (styleAny.shadow && typeof styleAny.shadow === 'object') {
    next.shadow = { ...next.shadow, ...(styleAny.shadow as ShapeStyle['shadow']) };
  }

  if (styleAny.fillColor) {
    next.fill = { ...next.fill, type: 'solid', color: styleAny.fillColor };
  }
  if (styleAny.strokeColor || styleAny.strokeWidth !== undefined) {
    next.stroke = {
      ...next.stroke,
      enabled: true,
      color: styleAny.strokeColor || next.stroke.color,
      width: styleAny.strokeWidth ?? next.stroke.width,
    };
  }
  if (styleAny.opacity !== undefined) {
    next.fill = { ...next.fill, opacity: styleAny.opacity };
  }

  return next;
}

// ---------------------------------------------------------------------------
// Legacy Keyframes（兼容 webview 目前使用的 Record 结构）
// ---------------------------------------------------------------------------

type LegacyKeyframe = { id: string; time: number; value: unknown; easing: string };

function getLegacyKeyframes(element: TimelineElement): Record<string, LegacyKeyframe[]> {
  const elementAny = element as unknown as { keyframes?: unknown };
  const keyframes = elementAny.keyframes;
  if (!keyframes || typeof keyframes !== 'object' || Array.isArray(keyframes)) {
    return {};
  }
  return keyframes as Record<string, LegacyKeyframe[]>;
}

// ---------------------------------------------------------------------------
// Masks（复刻 webview 的默认工厂，避免依赖 webview 代码）
// ---------------------------------------------------------------------------

function createMaskInstance(shapeType: string, name?: string): Record<string, unknown> {
  const id = `mask-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  const createRectangleMask = () => ({
    type: 'rectangle',
    centerX: 50,
    centerY: 50,
    width: 50,
    height: 50,
    rotation: 0,
    cornerRadius: 0,
  });

  const createEllipseMask = () => ({
    type: 'ellipse',
    centerX: 50,
    centerY: 50,
    width: 50,
    height: 50,
    rotation: 0,
  });

  const createPolygonMask = () => ({
    type: 'polygon',
    points: [
      { x: 50, y: 20 },
      { x: 80, y: 80 },
      { x: 20, y: 80 },
    ],
  });

  const createBezierPoint = (x: number, y: number) => ({
    anchor: { x, y },
    handleIn: { x: 0, y: 0 },
    handleOut: { x: 0, y: 0 },
    linkedHandles: true,
  });

  const createBezierMask = () => ({
    type: 'bezier',
    points: [
      createBezierPoint(25, 25),
      createBezierPoint(75, 25),
      createBezierPoint(75, 75),
      createBezierPoint(25, 75),
    ],
    closed: true,
  });

  let shape: Record<string, unknown>;
  switch (shapeType) {
    case 'rectangle':
      shape = createRectangleMask();
      break;
    case 'ellipse':
      shape = createEllipseMask();
      break;
    case 'polygon':
      shape = createPolygonMask();
      break;
    case 'bezier':
      shape = createBezierMask();
      break;
    default:
      shape = createRectangleMask();
      break;
  }

  return {
    id,
    name: name || `Mask ${shapeType}`,
    enabled: true,
    shape,
    feather: 0,
    expansion: 0,
    opacity: 100,
    inverted: false,
    blendMode: 'add',
    order: 0,
  };
}

// ---------------------------------------------------------------------------
// 内置效果/转场列表（与 webview handlers 保持一致）
// ---------------------------------------------------------------------------

const BUILT_IN_EFFECTS = {
  'gaussian-blur': {
    name: 'Gaussian Blur',
    category: 'blur',
    parameters: { radius: { type: 'number', min: 0, max: 100, default: 10 } },
  },
  'motion-blur': {
    name: 'Motion Blur',
    category: 'blur',
    parameters: {
      angle: { type: 'number', min: 0, max: 360, default: 0 },
      amount: { type: 'number', min: 0, max: 100, default: 20 },
    },
  },
  sharpen: {
    name: 'Sharpen',
    category: 'sharpen',
    parameters: { amount: { type: 'number', min: 0, max: 100, default: 50 } },
  },
  glow: {
    name: 'Glow',
    category: 'stylize',
    parameters: {
      radius: { type: 'number', min: 0, max: 50, default: 10 },
      intensity: { type: 'number', min: 0, max: 100, default: 50 },
    },
  },
  vignette: {
    name: 'Vignette',
    category: 'stylize',
    parameters: {
      amount: { type: 'number', min: 0, max: 100, default: 50 },
      softness: { type: 'number', min: 0, max: 100, default: 50 },
    },
  },
  'chroma-key': {
    name: 'Chroma Key',
    category: 'keying',
    parameters: {
      color: { type: 'color', default: '#00ff00' },
      tolerance: { type: 'number', min: 0, max: 100, default: 30 },
      softness: { type: 'number', min: 0, max: 100, default: 10 },
    },
  },
  'chromatic-aberration': {
    name: 'Chromatic Aberration',
    category: 'stylize',
    parameters: { amount: { type: 'number', min: 0, max: 50, default: 5 } },
  },
  'film-grain': {
    name: 'Film Grain',
    category: 'stylize',
    parameters: {
      amount: { type: 'number', min: 0, max: 100, default: 30 },
      size: { type: 'number', min: 1, max: 10, default: 2 },
    },
  },
} as const;

const TRANSITION_PRESETS = {
  fade: { name: 'Fade', category: 'basic', defaultDuration: 0.5 },
  dissolve: { name: 'Dissolve', category: 'basic', defaultDuration: 0.5 },
  'slide-left': { name: 'Slide Left', category: 'slide', defaultDuration: 0.5 },
  'slide-right': { name: 'Slide Right', category: 'slide', defaultDuration: 0.5 },
  'slide-up': { name: 'Slide Up', category: 'slide', defaultDuration: 0.5 },
  'slide-down': { name: 'Slide Down', category: 'slide', defaultDuration: 0.5 },
  'zoom-in': { name: 'Zoom In', category: 'zoom', defaultDuration: 0.5 },
  'zoom-out': { name: 'Zoom Out', category: 'zoom', defaultDuration: 0.5 },
  'wipe-left': { name: 'Wipe Left', category: 'wipe', defaultDuration: 0.5 },
  'wipe-right': { name: 'Wipe Right', category: 'wipe', defaultDuration: 0.5 },
  'wipe-up': { name: 'Wipe Up', category: 'wipe', defaultDuration: 0.5 },
  'wipe-down': { name: 'Wipe Down', category: 'wipe', defaultDuration: 0.5 },
  'iris-in': { name: 'Iris In', category: 'iris', defaultDuration: 0.5 },
  'iris-out': { name: 'Iris Out', category: 'iris', defaultDuration: 0.5 },
  blur: { name: 'Blur', category: 'special', defaultDuration: 0.5 },
  pixelate: { name: 'Pixelate', category: 'special', defaultDuration: 0.5 },
  glitch: { name: 'Glitch', category: 'special', defaultDuration: 0.3 },
  'dip-to-black': { name: 'Dip to Black', category: 'dip', defaultDuration: 1.0 },
  'dip-to-white': { name: 'Dip to White', category: 'dip', defaultDuration: 1.0 },
} as const;

function normalizePercent(value: number | undefined, fallback: number): number {
  if (value === undefined || Number.isNaN(value)) {
    return fallback;
  }
  if (value >= 0 && value <= 1) {
    return value * 100;
  }
  return value;
}

function applyTool(
  project: ProjectData,
  toolName: string,
  params: Record<string, unknown>,
): ToolApplyResult {
  switch (toolName) {
    case 'GetTimelineInfo': {
      const tracks = project.tracks.map((track) => ({
        id: track.id,
        name: track.name,
        type: track.type,
        elementCount: track.elements.length,
        locked: track.locked,
        muted: track.muted,
      }));

      return {
        success: true,
        data: {
          duration: getTotalDuration(project.tracks),
          fps: project.fps,
          width: project.resolution.width,
          height: project.resolution.height,
          trackCount: project.tracks.length,
          tracks,
        },
      };
    }

    case 'GetElementInfo': {
      const elementId = params.elementId as string | undefined;
      if (!elementId) return { success: false, error: 'elementId is required' };

      for (const track of project.tracks) {
        const element = track.elements.find((e) => e.id === elementId);
        if (!element) continue;

        const info: Record<string, unknown> = {
          id: element.id,
          type: element.type,
          name: element.name,
          trackId: track.id,
          trackName: track.name,
          startTime: element.startTime,
          duration: element.duration,
          trimStart: element.trimStart,
          trimEnd: element.trimEnd,
          effectiveDuration: element.duration - element.trimStart - element.trimEnd,
          transform: element.transform,
        };

        if (element.type === 'media' || element.type === 'audio') {
          const elementAny = element as unknown as {
            src?: unknown;
            audio?: unknown;
            speed?: unknown;
            muted?: unknown;
          };
          if (typeof elementAny.src === 'string') info.src = elementAny.src;
          if (elementAny.audio) info.audio = elementAny.audio;
          if (elementAny.speed) info.speed = elementAny.speed;
          if (typeof elementAny.muted === 'boolean') info.muted = elementAny.muted;
        }

        if (element.type === 'text') {
          const textAny = element as unknown as {
            content?: unknown;
            fontSize?: unknown;
            fontFamily?: unknown;
            color?: unknown;
            textAlign?: unknown;
          };
          info.content = textAny.content;
          info.fontSize = textAny.fontSize;
          info.fontFamily = textAny.fontFamily;
          info.color = textAny.color;
          info.textAlign = textAny.textAlign;
        }

        if (element.type === 'shape') {
          const shapeAny = element as unknown as { shapes?: unknown };
          if (shapeAny.shapes) info.shapes = shapeAny.shapes;
        }

        const elementAny = element as unknown as {
          effects?: unknown;
          transitionIn?: unknown;
          transitionOut?: unknown;
          keyframes?: unknown;
        };
        if (elementAny.effects) info.effects = elementAny.effects;
        if (elementAny.transitionIn) info.transitionIn = elementAny.transitionIn;
        if (elementAny.transitionOut) info.transitionOut = elementAny.transitionOut;
        if (elementAny.keyframes) info.keyframes = elementAny.keyframes;

        return { success: true, data: info };
      }

      return { success: false, error: `Element not found: ${elementId}` };
    }

    case 'ListElements': {
      const trackId = params.trackId as string | undefined;
      const typeFilter = params.type as string | undefined;

      let tracksToSearch = project.tracks;
      if (trackId) {
        const track = project.tracks.find((t) => t.id === trackId);
        if (!track) return { success: false, error: `Track not found: ${trackId}` };
        tracksToSearch = [track];
      }

      const elements: Array<Record<string, unknown>> = [];
      for (const track of tracksToSearch) {
        for (const element of track.elements) {
          if (typeFilter && element.type !== typeFilter) continue;

          const info: Record<string, unknown> = {
            id: element.id,
            type: element.type,
            name: element.name,
            trackId: track.id,
            trackName: track.name,
            startTime: element.startTime,
            duration: element.duration,
            effectiveDuration: element.duration - element.trimStart - element.trimEnd,
          };

          if (element.type === 'media' || element.type === 'audio') {
            const elementAny = element as unknown as { src?: unknown };
            if (typeof elementAny.src === 'string') info.src = elementAny.src;
          }
          if (element.type === 'text') {
            const textAny = element as unknown as { content?: unknown };
            if (typeof textAny.content === 'string') info.content = textAny.content;
          }

          elements.push(info);
        }
      }

      return { success: true, data: { count: elements.length, elements } };
    }

    case 'AddElement': {
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
          } as TimelineElement;
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
          } as TimelineElement;
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
          } as TimelineElement;
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
          } as TimelineElement;
          break;
        }
        default:
          return { success: false, error: `Invalid element type: ${type}` };
      }

      const track = project.tracks[trackIndex];
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

    case 'UpdateElement': {
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

    case 'DeleteElement': {
      const elementId = params.elementId as string | undefined;
      if (!elementId) return { success: false, error: 'elementId is required' };

      const found = findElement(project, elementId);
      if (!found) return { success: false, error: `Element not found: ${elementId}` };

      const updatedProject = removeElementAt(project, found.trackIndex, found.elementIndex);
      return { success: true, data: { message: 'Element deleted successfully' }, updatedProject };
    }

    case 'ListEffects': {
      return {
        success: true,
        data: {
          effects: Object.entries(BUILT_IN_EFFECTS).map(([type, config]) => ({ type, ...config })),
        },
      };
    }

    case 'AddEffect': {
      const {
        elementId,
        effectType,
        params: effectParams,
      } = params as {
        elementId?: string;
        effectType?: string;
        params?: Record<string, unknown>;
      };
      if (!elementId || !effectType)
        return { success: false, error: 'elementId and effectType are required' };
      if (!(effectType in BUILT_IN_EFFECTS))
        return { success: false, error: `Unknown effect type: ${effectType}` };

      const found = findElement(project, elementId);
      if (!found) return { success: false, error: `Element not found: ${elementId}` };

      const elementAny = found.element as unknown as { effects?: unknown[] };
      const existingEffects = (elementAny.effects || []) as unknown[];

      const effectId = `effect-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
      const newEffect = {
        id: effectId,
        type: effectType,
        enabled: true,
        parameters: (effectParams || {}) as Record<string, unknown>,
        order: existingEffects.length,
      };

      const updatedElement = {
        ...found.element,
        effects: [...existingEffects, newEffect],
      } as unknown as TimelineElement;

      const updatedProject = updateElementAt(
        project,
        found.trackIndex,
        found.elementIndex,
        updatedElement,
      );
      return {
        success: true,
        data: { effectId, message: 'Effect added successfully' },
        updatedProject,
      };
    }

    case 'UpdateEffect': {
      const {
        elementId,
        effectId,
        params: effectParams,
      } = params as {
        elementId?: string;
        effectId?: string;
        params?: Record<string, unknown>;
      };
      if (!elementId || !effectId || !effectParams) {
        return { success: false, error: 'elementId, effectId, and params are required' };
      }

      const found = findElement(project, elementId);
      if (!found) return { success: false, error: `Element not found: ${elementId}` };

      const elementAny = found.element as unknown as {
        effects?: Array<{ id: string; parameters?: Record<string, unknown> }>;
      };
      const effects = [...(elementAny.effects || [])];
      const idx = effects.findIndex((e) => e.id === effectId);
      if (idx === -1) return { success: false, error: `Effect not found: ${effectId}` };

      effects[idx] = {
        ...effects[idx],
        parameters: { ...(effects[idx].parameters || {}), ...effectParams },
      };

      const updatedElement = { ...found.element, effects } as unknown as TimelineElement;
      const updatedProject = updateElementAt(
        project,
        found.trackIndex,
        found.elementIndex,
        updatedElement,
      );
      return {
        success: true,
        data: { effectId, message: 'Effect updated successfully' },
        updatedProject,
      };
    }

    case 'RemoveEffect': {
      const { elementId, effectId } = params as { elementId?: string; effectId?: string };
      if (!elementId || !effectId)
        return { success: false, error: 'elementId and effectId are required' };

      const found = findElement(project, elementId);
      if (!found) return { success: false, error: `Element not found: ${elementId}` };

      const elementAny = found.element as unknown as { effects?: Array<{ id: string }> };
      const effects = elementAny.effects || [];
      const updatedEffects = effects.filter((e) => e.id !== effectId);
      if (updatedEffects.length === effects.length)
        return { success: false, error: `Effect not found: ${effectId}` };

      const updatedElement = {
        ...found.element,
        effects: updatedEffects,
      } as unknown as TimelineElement;
      const updatedProject = updateElementAt(
        project,
        found.trackIndex,
        found.elementIndex,
        updatedElement,
      );
      return { success: true, data: { message: 'Effect removed successfully' }, updatedProject };
    }

    case 'ListTransitions': {
      return {
        success: true,
        data: {
          transitions: Object.entries(TRANSITION_PRESETS).map(([type, config]) => ({
            type,
            ...config,
          })),
        },
      };
    }

    case 'SetTransition': {
      const {
        elementId,
        placement,
        type,
        duration,
        easing,
        params: transitionParams,
      } = params as {
        elementId?: string;
        placement?: 'in' | 'out';
        type?: string;
        duration?: number;
        easing?: string;
        params?: Record<string, unknown>;
      };

      if (!elementId || !placement || !type || duration === undefined) {
        return { success: false, error: 'elementId, placement, type, and duration are required' };
      }

      if (!(type in TRANSITION_PRESETS) && type !== 'none' && type !== 'custom') {
        return { success: false, error: `Unknown transition type: ${type}` };
      }

      const found = findElement(project, elementId);
      if (!found) return { success: false, error: `Element not found: ${elementId}` };

      const transitionId = `transition-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
      const transition = {
        id: transitionId,
        type,
        duration,
        easing: easing || 'ease-in-out',
        params: transitionParams || {},
      };

      const transitionKey = placement === 'in' ? 'transitionIn' : 'transitionOut';
      const updatedElement = {
        ...found.element,
        [transitionKey]: transition,
      } as unknown as TimelineElement;

      const updatedProject = updateElementAt(
        project,
        found.trackIndex,
        found.elementIndex,
        updatedElement,
      );
      return {
        success: true,
        data: { transitionId, placement, message: `Transition ${placement} set successfully` },
        updatedProject,
      };
    }

    case 'RemoveTransition': {
      const { elementId, placement } = params as { elementId?: string; placement?: 'in' | 'out' };
      if (!elementId || !placement)
        return { success: false, error: 'elementId and placement are required' };

      const found = findElement(project, elementId);
      if (!found) return { success: false, error: `Element not found: ${elementId}` };

      const transitionKey = placement === 'in' ? 'transitionIn' : 'transitionOut';
      const updatedElementAny = { ...(found.element as unknown as Record<string, unknown>) };
      delete updatedElementAny[transitionKey];

      const updatedProject = updateElementAt(
        project,
        found.trackIndex,
        found.elementIndex,
        updatedElementAny as unknown as TimelineElement,
      );
      return {
        success: true,
        data: { message: `Transition ${placement} removed successfully` },
        updatedProject,
      };
    }

    // ---------------------------------------------------------------------
    // Shapes
    // ---------------------------------------------------------------------

    case 'AddShape': {
      const { trackId, shapeType, name, position, size, style, transform } = params as {
        trackId?: string;
        shapeType?: string;
        name?: string;
        position?: { x?: number; y?: number };
        size?: { width?: number; height?: number };
        style?: Record<string, unknown>;
        transform?: { x?: number; y?: number; scaleX?: number; scaleY?: number };
      };

      if (!trackId || !shapeType) {
        return { success: false, error: 'trackId and shapeType are required' };
      }

      const validTypes: ShapeType[] = ['rectangle', 'ellipse', 'polygon', 'star', 'line', 'bezier'];
      if (!validTypes.includes(shapeType as ShapeType)) {
        return {
          success: false,
          error: `Invalid shape type: ${shapeType}. Valid types: ${validTypes.join(', ')}`,
        };
      }

      const trackIndex = project.tracks.findIndex((t) => t.id === trackId);
      if (trackIndex === -1) return { success: false, error: `Track not found: ${trackId}` };

      const centerX = position?.x ?? normalizePercent(transform?.x, 50);
      const centerY = position?.y ?? normalizePercent(transform?.y, 50);

      const baseWidth = 20;
      const baseHeight = 20;
      const width = size?.width ?? (transform?.scaleX ? baseWidth * transform.scaleX : baseWidth);
      const height =
        size?.height ?? (transform?.scaleY ? baseHeight * transform.scaleY : baseHeight);

      let shape: Shape;
      switch (shapeType) {
        case 'rectangle':
          shape = createRectangleShape(centerX, centerY, width, height);
          break;
        case 'ellipse':
          shape = createEllipseShape(centerX, centerY, width / 2, height / 2);
          break;
        case 'polygon':
          shape = createPolygonShape(6);
          break;
        case 'star':
          shape = createStarShape(centerX, centerY, 5, Math.min(width, height) / 2);
          break;
        case 'line':
          shape = createLineShape(centerX - width / 2, centerY, centerX + width / 2, centerY);
          break;
        case 'bezier':
          shape = createBezierShape();
          break;
        default:
          shape = createRectangleShape(centerX, centerY, width, height);
          break;
      }

      const baseStyle = createDefaultShapeStyle();
      const resolvedStyle = applyStyleOverrides(baseStyle, style);
      const shapeInstance = createShapeInstance(shape, name, resolvedStyle);

      const trackAny = project.tracks[trackIndex] as unknown as { shapes?: ShapeInstance[] };
      const existingShapes = trackAny.shapes || [];

      const updatedTrack = {
        ...project.tracks[trackIndex],
        shapes: [...existingShapes, shapeInstance],
      } as TimelineTrack;

      const updatedTracks = [...project.tracks];
      updatedTracks[trackIndex] = updatedTrack;

      return {
        success: true,
        data: { shapeId: shapeInstance.id, message: 'Shape added successfully' },
        updatedProject: { ...project, tracks: updatedTracks },
      };
    }

    case 'UpdateShape': {
      const { shapeId, elementId, position, size, style, visible, locked } = params as {
        shapeId?: string;
        elementId?: string;
        position?: { x?: number; y?: number };
        size?: { width?: number; height?: number };
        style?: Record<string, unknown>;
        visible?: boolean;
        locked?: boolean;
      };

      const targetId = shapeId || elementId;
      if (!targetId) return { success: false, error: 'shapeId or elementId is required' };

      let targetTrackIndex = -1;
      let targetShapeIndex = -1;

      for (let i = 0; i < project.tracks.length; i++) {
        const trackAny = project.tracks[i] as unknown as { shapes?: ShapeInstance[] };
        if (!trackAny.shapes) continue;
        const index = trackAny.shapes.findIndex((s) => s.id === targetId);
        if (index !== -1) {
          targetTrackIndex = i;
          targetShapeIndex = index;
          break;
        }
      }

      if (targetTrackIndex === -1 || targetShapeIndex === -1) {
        return { success: false, error: `Shape not found: ${targetId}` };
      }

      const trackAny = project.tracks[targetTrackIndex] as unknown as { shapes: ShapeInstance[] };
      const shapeInstance = {
        ...trackAny.shapes[targetShapeIndex],
        shape: structuredClone(trackAny.shapes[targetShapeIndex].shape),
        style: structuredClone(trackAny.shapes[targetShapeIndex].style),
      };

      const shape = shapeInstance.shape as Record<string, unknown>;

      if (position && 'centerX' in shape && 'centerY' in shape) {
        if (typeof position.x === 'number') (shape as { centerX: number }).centerX = position.x;
        if (typeof position.y === 'number') (shape as { centerY: number }).centerY = position.y;
      }

      if (size) {
        if ('width' in shape && 'height' in shape) {
          if (typeof size.width === 'number') (shape as { width: number }).width = size.width;
          if (typeof size.height === 'number') (shape as { height: number }).height = size.height;
        } else if ('radiusX' in shape && 'radiusY' in shape) {
          if (typeof size.width === 'number')
            (shape as { radiusX: number }).radiusX = size.width / 2;
          if (typeof size.height === 'number')
            (shape as { radiusY: number }).radiusY = size.height / 2;
        }
      }

      shapeInstance.shape = shape as Shape;

      if (style) {
        const updatedStyle = applyStyleOverrides(structuredClone(shapeInstance.style), style);
        shapeInstance.style = updatedStyle;
      }

      if (visible !== undefined) shapeInstance.visible = visible;
      if (locked !== undefined) shapeInstance.locked = locked;

      const updatedShapes = [...trackAny.shapes];
      updatedShapes[targetShapeIndex] = shapeInstance;

      const updatedTrack = {
        ...project.tracks[targetTrackIndex],
        shapes: updatedShapes,
      } as TimelineTrack;

      const updatedTracks = [...project.tracks];
      updatedTracks[targetTrackIndex] = updatedTrack;

      return {
        success: true,
        data: { shapeId: targetId, message: 'Shape updated successfully' },
        updatedProject: { ...project, tracks: updatedTracks },
      };
    }

    // ---------------------------------------------------------------------
    // Keyframes（legacy record 结构）
    // ---------------------------------------------------------------------

    case 'GetKeyframes': {
      const { elementId, property } = params as { elementId?: string; property?: string };
      if (!elementId) return { success: false, error: 'elementId is required' };

      const found = findElement(project, elementId);
      if (!found) return { success: false, error: `Element not found: ${elementId}` };

      const keyframes = getLegacyKeyframes(found.element);
      const result = property ? { [property]: keyframes[property] || [] } : keyframes;

      return { success: true, data: { elementId, keyframes: result } };
    }

    case 'AddKeyframe': {
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

      const updatedElement = { ...(found.element as any), keyframes } as TimelineElement;
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

    case 'UpdateKeyframe': {
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
        const propKeyframes = [...keyframes[prop]];
        const idx = propKeyframes.findIndex((kf) => kf.id === keyframeId);
        if (idx === -1) continue;

        const next = { ...propKeyframes[idx] };
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

      const updatedElement = { ...(found.element as any), keyframes } as TimelineElement;
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

    case 'RemoveKeyframe': {
      const { elementId, keyframeId } = params as { elementId?: string; keyframeId?: string };
      if (!elementId || !keyframeId)
        return { success: false, error: 'elementId and keyframeId are required' };

      const found = findElement(project, elementId);
      if (!found) return { success: false, error: `Element not found: ${elementId}` };

      const keyframes = { ...getLegacyKeyframes(found.element) };
      let removed = false;

      for (const prop of Object.keys(keyframes)) {
        const before = keyframes[prop];
        const after = before.filter((kf) => kf.id !== keyframeId);
        if (after.length !== before.length) {
          keyframes[prop] = after;
          removed = true;
          break;
        }
      }

      if (!removed) return { success: false, error: `Keyframe not found: ${keyframeId}` };

      const updatedElement = { ...(found.element as any), keyframes } as TimelineElement;
      const updatedProject = updateElementAt(
        project,
        found.trackIndex,
        found.elementIndex,
        updatedElement,
      );
      return { success: true, data: { message: 'Keyframe removed successfully' }, updatedProject };
    }

    // ---------------------------------------------------------------------
    // Masks
    // ---------------------------------------------------------------------

    case 'AddMask': {
      const {
        elementId,
        maskType,
        name,
        inverted,
        feather,
        params: nestedParams,
      } = params as {
        elementId?: string;
        maskType?: string;
        name?: string;
        inverted?: boolean;
        feather?: number;
        params?: Record<string, unknown>;
      };

      if (!elementId || !maskType)
        return { success: false, error: 'elementId and maskType are required' };
      const validTypes = ['rectangle', 'ellipse', 'polygon', 'bezier'];
      if (!validTypes.includes(maskType)) {
        return {
          success: false,
          error: `Invalid mask type: ${maskType}. Valid types: ${validTypes.join(', ')}`,
        };
      }

      const found = findElement(project, elementId);
      if (!found) return { success: false, error: `Element not found: ${elementId}` };

      const elementAny = found.element as unknown as { masks?: unknown[] };
      const existingMasks = (elementAny.masks || []) as Array<Record<string, unknown>>;

      const mask = createMaskInstance(maskType, name || `Mask ${existingMasks.length + 1}`);

      const mergedParams = { ...(nestedParams || {}), inverted, feather } as Record<
        string,
        unknown
      >;
      if (mergedParams.inverted !== undefined) mask.inverted = mergedParams.inverted;
      if (mergedParams.feather !== undefined) mask.feather = mergedParams.feather;
      mask.order = existingMasks.length;

      const updatedElement = {
        ...(found.element as any),
        masks: [...existingMasks, mask],
      } as TimelineElement;
      const updatedProject = updateElementAt(
        project,
        found.trackIndex,
        found.elementIndex,
        updatedElement,
      );
      return {
        success: true,
        data: { maskId: mask.id, message: 'Mask added successfully' },
        updatedProject,
      };
    }

    case 'UpdateMask': {
      const {
        elementId,
        maskId,
        enabled,
        inverted,
        feather,
        expansion,
        opacity,
        params: nestedParams,
      } = params as {
        elementId?: string;
        maskId?: string;
        enabled?: boolean;
        inverted?: boolean;
        feather?: number;
        expansion?: number;
        opacity?: number;
        params?: Record<string, unknown>;
      };

      if (!elementId || !maskId)
        return { success: false, error: 'elementId and maskId are required' };

      const found = findElement(project, elementId);
      if (!found) return { success: false, error: `Element not found: ${elementId}` };

      const elementAny = found.element as unknown as { masks?: Array<Record<string, unknown>> };
      const masks = [...(elementAny.masks || [])];
      const idx = masks.findIndex((m) => m.id === maskId);
      if (idx === -1) return { success: false, error: `Mask not found: ${maskId}` };

      const merged = {
        ...(nestedParams || {}),
        enabled,
        inverted,
        feather,
        expansion,
        opacity,
      } as Record<string, unknown>;
      masks[idx] = {
        ...masks[idx],
        ...(merged.enabled !== undefined && { enabled: merged.enabled }),
        ...(merged.inverted !== undefined && { inverted: merged.inverted }),
        ...(merged.feather !== undefined && { feather: merged.feather }),
        ...(merged.expansion !== undefined && { expansion: merged.expansion }),
        ...(merged.opacity !== undefined && { opacity: merged.opacity }),
      };

      const updatedElement = { ...(found.element as any), masks } as TimelineElement;
      const updatedProject = updateElementAt(
        project,
        found.trackIndex,
        found.elementIndex,
        updatedElement,
      );
      return {
        success: true,
        data: { maskId, message: 'Mask updated successfully' },
        updatedProject,
      };
    }

    case 'RemoveMask': {
      const { elementId, maskId } = params as { elementId?: string; maskId?: string };
      if (!elementId || !maskId)
        return { success: false, error: 'elementId and maskId are required' };

      const found = findElement(project, elementId);
      if (!found) return { success: false, error: `Element not found: ${elementId}` };

      const elementAny = found.element as unknown as { masks?: Array<Record<string, unknown>> };
      const masks = elementAny.masks || [];
      const updatedMasks = masks.filter((m) => m.id !== maskId);
      if (updatedMasks.length === masks.length)
        return { success: false, error: `Mask not found: ${maskId}` };

      const updatedElement = { ...(found.element as any), masks: updatedMasks } as TimelineElement;
      const updatedProject = updateElementAt(
        project,
        found.trackIndex,
        found.elementIndex,
        updatedElement,
      );
      return { success: true, data: { message: 'Mask removed successfully' }, updatedProject };
    }

    case 'SetColorCorrection': {
      const elementId = params.elementId as string | undefined;
      if (!elementId) return { success: false, error: 'elementId is required' };

      const found = findElement(project, elementId);
      if (!found) return { success: false, error: `Element not found: ${elementId}` };

      // 兼容两种入参：
      // 1) { elementId, colorCorrection: Partial<...> }（旧 webview handler）
      // 2) { elementId, brightness/contrast/saturation/temperature/tint/gamma/... }（timeline-bridge schema）
      const nested = (params as { colorCorrection?: unknown }).colorCorrection as
        | Record<string, unknown>
        | undefined;
      const ccParams = nested ?? (params as Record<string, unknown>);

      const elementAny = found.element as unknown as { colorCorrection?: unknown };
      const existingCC =
        (elementAny.colorCorrection as Record<string, unknown> | undefined) ??
        DEFAULT_COLOR_CORRECTION;

      const existingBasic =
        ((existingCC as Record<string, unknown>).basic as Record<string, unknown> | undefined) ??
        {};

      const updatedCC = {
        ...existingCC,
        enabled: true,
        basic: {
          ...existingBasic,
          ...(ccParams.brightness !== undefined && { brightness: ccParams.brightness }),
          ...(ccParams.contrast !== undefined && { contrast: ccParams.contrast }),
          ...(ccParams.saturation !== undefined && { saturation: ccParams.saturation }),
          ...(ccParams.temperature !== undefined && { temperature: ccParams.temperature }),
          ...(ccParams.tint !== undefined && { tint: ccParams.tint }),
          ...(ccParams.exposure !== undefined && { exposure: ccParams.exposure }),
          ...(ccParams.gamma !== undefined && { gamma: ccParams.gamma }),
          ...(ccParams.shadows !== undefined && { shadows: ccParams.shadows }),
          ...(ccParams.highlights !== undefined && { highlights: ccParams.highlights }),
        },
      };

      const updatedElement = {
        ...found.element,
        colorCorrection: updatedCC,
      } as unknown as TimelineElement;
      const updatedProject = updateElementAt(
        project,
        found.trackIndex,
        found.elementIndex,
        updatedElement,
      );
      return {
        success: true,
        data: { elementId, message: 'Color correction applied successfully' },
        updatedProject,
      };
    }

    case 'ResetColorCorrection': {
      const elementId = params.elementId as string | undefined;
      if (!elementId) return { success: false, error: 'elementId is required' };

      const found = findElement(project, elementId);
      if (!found) return { success: false, error: `Element not found: ${elementId}` };

      const updatedElement = {
        ...found.element,
        colorCorrection: DEFAULT_COLOR_CORRECTION,
      } as unknown as TimelineElement;
      const updatedProject = updateElementAt(
        project,
        found.trackIndex,
        found.elementIndex,
        updatedElement,
      );
      return {
        success: true,
        data: { elementId, message: 'Color correction reset to defaults' },
        updatedProject,
      };
    }

    case 'AddTrack': {
      const { name, type } = params as { name?: string; type?: string };
      if (!name || !type) return { success: false, error: 'name and type are required' };

      const normalizedType = type === 'video' ? 'media' : type;
      const validTypes = ['media', 'audio', 'subtitle', 'shape', 'text'];
      if (!validTypes.includes(normalizedType)) {
        return {
          success: false,
          error: `Invalid track type: ${type}. Valid types: ${validTypes.join(', ')}`,
        };
      }

      const trackId = `track-${generateId()}`;
      const newTrack: TimelineTrack = {
        id: trackId,
        name,
        type: normalizedType as TimelineTrack['type'],
        elements: [],
        locked: false,
      };

      return {
        success: true,
        data: { trackId, message: 'Track created successfully' },
        updatedProject: { ...project, tracks: [...project.tracks, newTrack] },
      };
    }

    case 'DeleteTrack': {
      const trackId = params.trackId as string | undefined;
      if (!trackId) return { success: false, error: 'trackId is required' };

      const idx = project.tracks.findIndex((t) => t.id === trackId);
      if (idx === -1) return { success: false, error: `Track not found: ${trackId}` };

      const updatedTracks = [...project.tracks];
      updatedTracks.splice(idx, 1);
      return {
        success: true,
        data: { message: 'Track deleted successfully' },
        updatedProject: { ...project, tracks: updatedTracks },
      };
    }

    case 'ReorderTracks': {
      const trackIds = params.trackIds as string[] | undefined;
      if (!trackIds || !Array.isArray(trackIds))
        return { success: false, error: 'trackIds array is required' };

      const existingIds = new Set(project.tracks.map((t) => t.id));
      for (const id of trackIds) {
        if (!existingIds.has(id)) return { success: false, error: `Track not found: ${id}` };
      }
      if (trackIds.length !== project.tracks.length) {
        return { success: false, error: 'trackIds must include all existing tracks' };
      }

      const trackMap = new Map(project.tracks.map((t) => [t.id, t]));
      const reorderedTracks = trackIds.map((id) => trackMap.get(id)!);
      return {
        success: true,
        data: { message: 'Tracks reordered successfully' },
        updatedProject: { ...project, tracks: reorderedTracks },
      };
    }

    case 'SetTrackProperties': {
      const { trackId, name, locked, muted, solo } = params as {
        trackId?: string;
        name?: string;
        locked?: boolean;
        muted?: boolean;
        solo?: boolean;
      };
      if (!trackId) return { success: false, error: 'trackId is required' };

      const idx = project.tracks.findIndex((t) => t.id === trackId);
      if (idx === -1) return { success: false, error: `Track not found: ${trackId}` };

      const updatedTrack: TimelineTrack = {
        ...project.tracks[idx],
        ...(name !== undefined && { name }),
        ...(locked !== undefined && { locked }),
        ...(muted !== undefined && { muted }),
        ...(solo !== undefined && { solo }),
      };

      const updatedTracks = [...project.tracks];
      updatedTracks[idx] = updatedTrack;

      return {
        success: true,
        data: { trackId, message: 'Track properties updated successfully' },
        updatedProject: { ...project, tracks: updatedTracks },
      };
    }

    case 'TrimElement': {
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

    case 'SplitElement': {
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

      const track = project.tracks[found.trackIndex];
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

    case 'SetPlaybackSpeed': {
      const { elementId, speed, maintainPitch } = params as {
        elementId?: string;
        speed?: number;
        maintainPitch?: boolean;
      };
      if (!elementId) return { success: false, error: 'elementId is required' };
      if (speed === undefined || speed <= 0)
        return { success: false, error: 'speed must be a positive number' };
      if (speed < 0.25 || speed > 4.0)
        return { success: false, error: 'speed must be between 0.25 and 4.0' };

      const found = findElement(project, elementId);
      if (!found) return { success: false, error: `Element not found: ${elementId}` };
      if (found.element.type !== 'media' && found.element.type !== 'audio') {
        return { success: false, error: 'Speed can only be set on media or audio elements' };
      }

      const updatedElement = {
        ...found.element,
        speed: {
          speed,
          preservePitch: maintainPitch ?? true,
          reverse: false,
        },
      } as unknown as TimelineElement;

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
          speed,
          maintainPitch: maintainPitch ?? true,
          message: 'Playback speed set successfully',
        },
        updatedProject,
      };
    }

    case 'SeparateAudio': {
      const { elementId, targetTrackId } = params as { elementId?: string; targetTrackId?: string };
      if (!elementId) return { success: false, error: 'elementId is required' };

      const found = findElement(project, elementId);
      if (!found) return { success: false, error: `Element not found: ${elementId}` };
      if (found.element.type !== 'media')
        return { success: false, error: 'Audio can only be separated from media elements' };

      const elementAny = found.element as unknown as {
        linkedAudioId?: unknown;
        src?: string;
        audio?: unknown;
        muted?: boolean;
      };
      if (elementAny.linkedAudioId)
        return { success: false, error: 'Audio has already been separated from this element' };
      if (typeof elementAny.src !== 'string')
        return { success: false, error: 'Media element src is required' };

      // Find or create target audio track
      let audioTrackId = targetTrackId;
      let createdNewTrack = false;

      if (!audioTrackId) {
        const existingAudioTrack = project.tracks.find((t) => t.type === 'audio');
        if (existingAudioTrack) {
          audioTrackId = existingAudioTrack.id;
        } else {
          audioTrackId = `track-${generateId()}`;
          createdNewTrack = true;
        }
      }

      const targetTrackIndex = project.tracks.findIndex((t) => t.id === audioTrackId);
      if (targetTrackIndex === -1 && !createdNewTrack) {
        return { success: false, error: `Target track not found: ${audioTrackId}` };
      }

      const audioElementId = generateId();
      const audioElement: TimelineElement = {
        id: audioElementId,
        type: 'audio',
        name: `${found.element.name} (Audio)`,
        src: elementAny.src,
        startTime: found.element.startTime,
        duration: found.element.duration,
        trimStart: found.element.trimStart,
        trimEnd: found.element.trimEnd,
        audio: (elementAny.audio as Record<string, unknown> | undefined) ?? {
          ...DEFAULT_AUDIO_PROPERTIES,
        },
      } as unknown as TimelineElement;

      const updatedVideoElement = {
        ...found.element,
        muted: true,
        linkedAudioId: audioElementId,
      } as unknown as TimelineElement;

      let updatedTracks = project.tracks.map((t) => t);

      // If creating a new audio track
      if (createdNewTrack) {
        const newTrack: TimelineTrack = {
          id: audioTrackId!,
          name: 'Audio',
          type: 'audio',
          elements: [audioElement],
          locked: false,
        };
        updatedTracks = [...updatedTracks, newTrack];
      } else {
        // Append audio element to existing track
        const targetTrack = updatedTracks[targetTrackIndex];
        if (targetTrack.type !== 'audio')
          return { success: false, error: 'Target track must be an audio track' };
        updatedTracks[targetTrackIndex] = {
          ...targetTrack,
          elements: [...targetTrack.elements, audioElement],
        };
      }

      // Update video element in its original track
      const originalTrack = updatedTracks[found.trackIndex];
      const updatedElements = [...originalTrack.elements];
      updatedElements[found.elementIndex] = updatedVideoElement;
      updatedTracks[found.trackIndex] = { ...originalTrack, elements: updatedElements };

      return {
        success: true,
        data: {
          videoElementId: elementId,
          audioElementId,
          audioTrackId,
          createdNewTrack,
          message: 'Audio separated successfully',
        },
        updatedProject: { ...project, tracks: updatedTracks },
      };
    }

    case 'SetAudioProperties': {
      const { elementId, volume, pan, muted, fadeIn, fadeOut } = params as {
        elementId?: string;
        volume?: number;
        pan?: number;
        muted?: boolean;
        fadeIn?: number;
        fadeOut?: number;
      };
      if (!elementId) return { success: false, error: 'elementId is required' };

      const found = findElement(project, elementId);
      if (!found) return { success: false, error: `Element not found: ${elementId}` };

      const elementAny = found.element as unknown as { audio?: Record<string, unknown> };
      const existingAudio =
        elementAny.audio ?? ({ ...DEFAULT_AUDIO_PROPERTIES } as unknown as Record<string, unknown>);

      const clamp = (val: number, min: number, max: number) => Math.min(max, Math.max(min, val));

      const updatedAudio = {
        ...existingAudio,
        ...(volume !== undefined && { volume: clamp(volume, 0, 200) }),
        ...(pan !== undefined && { pan: clamp(pan, -100, 100) }),
        ...(muted !== undefined && { muted }),
        ...(fadeIn !== undefined && { fadeIn: Math.max(0, fadeIn) }),
        ...(fadeOut !== undefined && { fadeOut: Math.max(0, fadeOut) }),
      };

      const updatedElement = {
        ...found.element,
        audio: updatedAudio,
      } as unknown as TimelineElement;
      const updatedProject = updateElementAt(
        project,
        found.trackIndex,
        found.elementIndex,
        updatedElement,
      );
      return {
        success: true,
        data: { elementId, message: 'Audio properties updated successfully' },
        updatedProject,
      };
    }

    case 'AddAudioKeyframe': {
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

      const elementAny = found.element as unknown as { audioKeyframes?: Record<string, unknown[]> };
      const audioKeyframes = { ...(elementAny.audioKeyframes || {}) } as Record<string, unknown[]>;
      const propertyKeyframes = [...(audioKeyframes[property] || [])];

      const keyframeId = `akf-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
      const keyframe = { id: keyframeId, time, value, easing: easing || 'linear' };

      const insertIndex = propertyKeyframes.findIndex(
        (kf) => (kf as { time?: number }).time! > time,
      );
      if (insertIndex === -1) propertyKeyframes.push(keyframe);
      else propertyKeyframes.splice(insertIndex, 0, keyframe);

      audioKeyframes[property] = propertyKeyframes;

      const updatedElement = { ...found.element, audioKeyframes } as unknown as TimelineElement;
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

    default:
      return { success: false, error: `Unknown tool: ${toolName}` };
  }
}

export class TimelineToolExecutor {
  private pending: Promise<void> = Promise.resolve();

  async execute(toolName: string, params: Record<string, unknown>): Promise<ToolResult> {
    const start = Date.now();

    // 串行化执行，避免并发读写导致丢更新
    const run = async (): Promise<ToolResult> => {
      const editorRegistry = getService(IEditorRegistry);
      const projectSession = getService(IProjectSessionService);

      if (!editorRegistry) {
        return {
          success: false,
          error: 'EditorRegistry service not available',
          duration: Date.now() - start,
        };
      }

      const active = editorRegistry.getActiveEditor();
      let model: VideoEditorModel | null =
        active && active.type === 'video' ? (active as unknown as VideoEditorModel) : null;

      const sessionInfo = projectSession?.getInfo() ?? null;
      if (!model && sessionInfo?.path) {
        const maybe = editorRegistry.getEditorByUri(vscode.Uri.file(sessionInfo.path));
        if (maybe && maybe.type === 'video') {
          model = maybe as unknown as VideoEditorModel;
        }
      }

      let project: ProjectData | null = null;
      let writeBack: ((next: ProjectData) => Promise<void>) | null = null;
      let projectFilePath: string | undefined;

      if (model) {
        project = model.getProjectData();
        projectFilePath = model.uri.fsPath;
        writeBack = async (next) => {
          await model!.updateProjectData(normalizePathsForSave(next, projectFilePath));
        };
      } else if (projectSession?.isLoaded()) {
        project = projectSession.getProjectData();
        projectFilePath = sessionInfo?.path;
        writeBack = async (next) => {
          await projectSession.updateProjectData(normalizePathsForSave(next, projectFilePath));
        };
      }

      if (!project || !writeBack) {
        return {
          success: false,
          error:
            'No project loaded. Open a .jvi file or call POST /api/v1/project/load|create first.',
          duration: Date.now() - start,
        };
      }

      const result = applyTool(project, toolName, params);
      if (!result.success) {
        return { success: false, error: result.error, duration: Date.now() - start };
      }

      if (result.updatedProject) {
        await writeBack(result.updatedProject);
      }

      return { success: true, data: result.data, duration: Date.now() - start };
    };

    const task = this.pending.then(run, run) as Promise<ToolResult>;
    this.pending = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  }
}

/**
 * 便捷：从空项目开始（用于 ProjectSession.create 的回退）
 */
export function createEmptyProject(): ProjectData {
  return createDefaultProject();
}
