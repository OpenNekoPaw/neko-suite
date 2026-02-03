/**
 * Timeline Bridge Tool
 * Bridges AI tool calls to Webview for execution via WebCodecs/WebGPU
 */

import * as vscode from 'vscode';
import type { Tool, ToolCategory, ToolResult } from '@uniedit/agent';
import { TimelineToolExecutor } from '../services/TimelineToolExecutor';

/**
 * Pending request tracker
 */
interface PendingRequest {
  resolve: (result: ToolResult) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
}

/**
 * Timeline tool names that need to be bridged to Webview
 * NOTE: All tool names use PascalCase for consistency
 */
export const TIMELINE_TOOL_NAMES = [
  // Timeline info tools
  'GetTimelineInfo',
  // Element tools
  'GetElementInfo',
  'ListElements',
  'AddElement',
  'UpdateElement',
  'DeleteElement',
  // Effect tools
  'ListEffects',
  'AddEffect',
  'UpdateEffect',
  'RemoveEffect',
  // Transition tools
  'ListTransitions',
  'SetTransition',
  'RemoveTransition',
  // Animation tools
  'GetKeyframes',
  'AddKeyframe',
  'UpdateKeyframe',
  'RemoveKeyframe',
  // Shape tools
  'AddShape',
  'UpdateShape',
  // Color correction tools
  'SetColorCorrection',
  'ResetColorCorrection',
  // Track tools
  'AddTrack',
  'DeleteTrack',
  'ReorderTracks',
  'SetTrackProperties',
  // Mask tools
  'AddMask',
  'UpdateMask',
  'RemoveMask',
  // Audio tools
  'SetAudioProperties',
  'AddAudioKeyframe',
  // Media operation tools
  'TrimElement',
  'SplitElement',
  'SetPlaybackSpeed',
  'SeparateAudio',
  // Export tools
  'ExportVideo',
  'GetExportProgress',
  // Render tools
  'RenderFrame',
  'RenderClip',
  'GetThumbnail',
] as const;

export type TimelineToolName = (typeof TIMELINE_TOOL_NAMES)[number];

/**
 * Timeline 工具中可在 Extension 侧纯数据化执行的子集
 * - 这些工具将直接在 Extension 内修改 ProjectData 并写回 .jvi（Undo/Redo）
 * - 其余工具仍走 Webview bridge（渲染/导出/或尚未迁移的工具）
 * NOTE: All tool names use PascalCase for consistency
 */
export const LOCAL_TIMELINE_TOOL_NAMES = new Set<TimelineToolName>([
  // Timeline info tools
  'GetTimelineInfo',
  // Element tools
  'GetElementInfo',
  'ListElements',
  'AddElement',
  'UpdateElement',
  'DeleteElement',
  // Effect tools
  'ListEffects',
  'AddEffect',
  'UpdateEffect',
  'RemoveEffect',
  // Transition tools
  'ListTransitions',
  'SetTransition',
  'RemoveTransition',
  // Animation / keyframe tools
  'GetKeyframes',
  'AddKeyframe',
  'UpdateKeyframe',
  'RemoveKeyframe',
  // Shape tools
  'AddShape',
  'UpdateShape',
  // Color correction tools
  'SetColorCorrection',
  'ResetColorCorrection',
  // Track tools
  'AddTrack',
  'DeleteTrack',
  'ReorderTracks',
  'SetTrackProperties',
  // Mask tools
  'AddMask',
  'UpdateMask',
  'RemoveMask',
  // Audio tools
  'SetAudioProperties',
  'AddAudioKeyframe',
  // Media operation tools
  'TrimElement',
  'SplitElement',
  'SetPlaybackSpeed',
  'SeparateAudio',
]);

let timelineToolExecutor: TimelineToolExecutor | null = null;

function getTimelineToolExecutor(): TimelineToolExecutor {
  if (!timelineToolExecutor) {
    timelineToolExecutor = new TimelineToolExecutor();
  }
  return timelineToolExecutor;
}

/**
 * Timeline Bridge manages tool execution via Webview
 */
export class TimelineBridge {
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private webview: vscode.Webview | null = null;
  private requestIdCounter = 0;
  private readonly defaultTimeout = 30000; // 30 seconds

  /**
   * Set the webview instance for communication
   */
  setWebview(webview: vscode.Webview): void {
    this.webview = webview;
  }

  /**
   * Clear the webview reference
   */
  clearWebview(): void {
    this.webview = null;
    // Reject all pending requests
    for (const [requestId, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Webview disconnected'));
      this.pendingRequests.delete(requestId);
    }
  }

  /**
   * Handle response from Webview
   */
  handleResponse(requestId: string, success: boolean, result?: unknown, error?: string): void {
    const pending = this.pendingRequests.get(requestId);
    if (!pending) {
      console.warn(`[TimelineBridge] No pending request found for ${requestId}`);
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(requestId);

    if (success) {
      pending.resolve({ success: true, data: result });
    } else {
      pending.resolve({ success: false, error: error || 'Unknown error' });
    }
  }

  /**
   * Execute a timeline tool via Webview
   */
  async execute(toolName: string, params: Record<string, unknown>): Promise<ToolResult> {
    if (!this.webview) {
      return { success: false, error: 'Webview not available' };
    }

    const requestId = `tool-${++this.requestIdCounter}-${Date.now()}`;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        resolve({ success: false, error: 'Tool execution timeout' });
      }, this.defaultTimeout);

      this.pendingRequests.set(requestId, { resolve, reject, timeout });

      this.webview!.postMessage({
        type: 'tool.execute',
        requestId,
        toolName,
        params,
      });
    });
  }

  /**
   * Create a bridge tool for registration
   */
  createTool(config: TimelineToolConfig): Tool {
    return {
      name: config.name,
      description: config.description,
      category: 'timeline' as ToolCategory,
      requiresConfirmation: config.requiresConfirmation ?? true,
      parameters: config.parameters,
      execute: async (args: Record<string, unknown>) => {
        return this.execute(config.name, args);
      },
    };
  }
}

/**
 * Timeline tool configuration
 */
export interface TimelineToolConfig {
  name: TimelineToolName;
  description: string;
  parameters: Record<string, unknown>;
  requiresConfirmation?: boolean;
}

/**
 * Tool definitions for timeline tools
 */
export const TIMELINE_TOOL_CONFIGS: TimelineToolConfig[] = [
  // Timeline info tools
  {
    name: 'GetTimelineInfo',
    description: 'Get current timeline information including duration, fps, resolution, and tracks',
    requiresConfirmation: false,
    parameters: { type: 'object', properties: {}, required: [] },
  },
  // Element tools
  {
    name: 'GetElementInfo',
    description: 'Get detailed information about a specific element including media source, duration, transform, effects, etc.',
    requiresConfirmation: false,
    parameters: {
      type: 'object',
      properties: {
        elementId: { type: 'string', description: 'Element ID to get info for' },
      },
      required: ['elementId'],
    },
  },
  {
    name: 'ListElements',
    description: 'List all elements in a track or all tracks with their basic info',
    requiresConfirmation: false,
    parameters: {
      type: 'object',
      properties: {
        trackId: { type: 'string', description: 'Track ID to list elements from (optional, lists all if not provided)' },
        type: { type: 'string', enum: ['media', 'audio', 'text', 'shape'], description: 'Filter by element type (optional)' },
      },
      required: [],
    },
  },
  {
    name: 'AddElement',
    description: 'Add a new element (video, audio, image, text) to a track',
    parameters: {
      type: 'object',
      properties: {
        trackId: { type: 'string', description: 'Target track ID' },
        type: { type: 'string', enum: ['media', 'audio', 'text', 'shape'], description: 'Element type' },
        startTime: { type: 'number', description: 'Start time in seconds' },
        duration: { type: 'number', description: 'Duration in seconds' },
        src: { type: 'string', description: 'Source file path (for media/audio elements)' },
        content: { type: 'string', description: 'Text content (for text elements)' },
        transform: { type: 'object', description: 'Transform properties (x, y, width, height, rotation)' },
      },
      required: ['trackId', 'type', 'startTime', 'duration'],
    },
  },
  {
    name: 'UpdateElement',
    description: 'Update an existing element in the timeline',
    parameters: {
      type: 'object',
      properties: {
        elementId: { type: 'string', description: 'Element ID to update' },
        startTime: { type: 'number', description: 'New start time in seconds' },
        duration: { type: 'number', description: 'New duration in seconds' },
        transform: { type: 'object', description: 'Transform properties (x, y, width, height, rotation)' },
        content: { type: 'string', description: 'New text content (for text elements)' },
        opacity: { type: 'number', description: 'Opacity (0-1)' },
      },
      required: ['elementId'],
    },
  },
  {
    name: 'DeleteElement',
    description: 'Delete an element from the timeline',
    parameters: {
      type: 'object',
      properties: {
        elementId: { type: 'string', description: 'Element ID to delete' },
      },
      required: ['elementId'],
    },
  },
  // Effect tools
  {
    name: 'ListEffects',
    description: 'List all available effect types with their parameter schemas',
    requiresConfirmation: false,
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'AddEffect',
    description: 'Add a visual effect to a timeline element',
    parameters: {
      type: 'object',
      properties: {
        elementId: { type: 'string', description: 'Target element ID' },
        effectType: { type: 'string', description: 'Effect type identifier' },
        params: { type: 'object', description: 'Effect parameters' },
      },
      required: ['elementId', 'effectType'],
    },
  },
  {
    name: 'UpdateEffect',
    description: 'Update parameters of an existing effect',
    parameters: {
      type: 'object',
      properties: {
        elementId: { type: 'string', description: 'Target element ID' },
        effectId: { type: 'string', description: 'Effect instance ID' },
        params: { type: 'object', description: 'New effect parameters' },
      },
      required: ['elementId', 'effectId', 'params'],
    },
  },
  {
    name: 'RemoveEffect',
    description: 'Remove an effect from an element',
    parameters: {
      type: 'object',
      properties: {
        elementId: { type: 'string', description: 'Target element ID' },
        effectId: { type: 'string', description: 'Effect instance ID to remove' },
      },
      required: ['elementId', 'effectId'],
    },
  },
  // Transition tools
  {
    name: 'ListTransitions',
    description: 'List all available transition types with their default parameters',
    requiresConfirmation: false,
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'SetTransition',
    description: 'Set a transition on an element',
    parameters: {
      type: 'object',
      properties: {
        elementId: { type: 'string', description: 'Target element ID' },
        placement: { type: 'string', enum: ['in', 'out'], description: 'Transition placement' },
        type: { type: 'string', description: 'Transition type' },
        duration: { type: 'number', description: 'Transition duration in seconds' },
        easing: { type: 'string', description: 'Easing function' },
        params: { type: 'object', description: 'Additional transition parameters' },
      },
      required: ['elementId', 'placement', 'type', 'duration'],
    },
  },
  {
    name: 'RemoveTransition',
    description: 'Remove a transition from an element',
    parameters: {
      type: 'object',
      properties: {
        elementId: { type: 'string', description: 'Target element ID' },
        placement: { type: 'string', enum: ['in', 'out'], description: 'Transition placement to remove' },
      },
      required: ['elementId', 'placement'],
    },
  },
  // Animation tools
  {
    name: 'GetKeyframes',
    description: 'Get keyframes for an element, optionally filtered by property',
    requiresConfirmation: false,
    parameters: {
      type: 'object',
      properties: {
        elementId: { type: 'string', description: 'Target element ID' },
        property: { type: 'string', description: 'Optional property name to filter' },
      },
      required: ['elementId'],
    },
  },
  {
    name: 'AddKeyframe',
    description: 'Add a keyframe to an element property',
    parameters: {
      type: 'object',
      properties: {
        elementId: { type: 'string', description: 'Target element ID' },
        property: { type: 'string', description: 'Property name to animate' },
        time: { type: 'number', description: 'Time offset in seconds' },
        value: { description: 'Keyframe value' },
        easing: { type: 'string', description: 'Easing function' },
      },
      required: ['elementId', 'property', 'time', 'value'],
    },
  },
  {
    name: 'UpdateKeyframe',
    description: 'Update an existing keyframe',
    parameters: {
      type: 'object',
      properties: {
        elementId: { type: 'string', description: 'Target element ID' },
        keyframeId: { type: 'string', description: 'Keyframe ID' },
        time: { type: 'number', description: 'New time offset' },
        value: { description: 'New value' },
        easing: { type: 'string', description: 'New easing function' },
      },
      required: ['elementId', 'keyframeId'],
    },
  },
  {
    name: 'RemoveKeyframe',
    description: 'Remove a keyframe from an element',
    parameters: {
      type: 'object',
      properties: {
        elementId: { type: 'string', description: 'Target element ID' },
        keyframeId: { type: 'string', description: 'Keyframe ID to remove' },
      },
      required: ['elementId', 'keyframeId'],
    },
  },
  // Shape tools
  {
    name: 'AddShape',
    description: 'Add a shape instance to a track (stored in track.shapes)',
    parameters: {
      type: 'object',
      properties: {
        trackId: { type: 'string', description: 'Target track ID' },
        shapeType: {
          type: 'string',
          enum: ['rectangle', 'ellipse', 'polygon', 'star', 'line', 'bezier'],
          description: 'Shape type',
        },
        name: { type: 'string', description: 'Optional shape name' },
        position: {
          type: 'object',
          description: 'Center position (0-100)',
          properties: {
            x: { type: 'number', description: 'Center X (0-100)' },
            y: { type: 'number', description: 'Center Y (0-100)' },
          },
        },
        size: {
          type: 'object',
          description: 'Shape size (0-100)',
          properties: {
            width: { type: 'number', description: 'Width (0-100)' },
            height: { type: 'number', description: 'Height (0-100)' },
          },
        },
        style: { type: 'object', description: 'Shape style (fill/stroke/shadow)' },
        transform: { type: 'object', description: 'Deprecated: fallback for position/size' },
      },
      required: ['trackId', 'shapeType'],
    },
  },
  {
    name: 'UpdateShape',
    description: 'Update shape properties',
    parameters: {
      type: 'object',
      properties: {
        shapeId: { type: 'string', description: 'Shape ID' },
        elementId: { type: 'string', description: 'Deprecated: use shapeId' },
        position: {
          type: 'object',
          description: 'Center position (0-100)',
          properties: {
            x: { type: 'number', description: 'Center X (0-100)' },
            y: { type: 'number', description: 'Center Y (0-100)' },
          },
        },
        size: {
          type: 'object',
          description: 'Shape size (0-100)',
          properties: {
            width: { type: 'number', description: 'Width (0-100)' },
            height: { type: 'number', description: 'Height (0-100)' },
          },
        },
        style: { type: 'object', description: 'New style properties' },
        visible: { type: 'boolean', description: 'Visibility' },
        locked: { type: 'boolean', description: 'Lock shape' },
      },
      anyOf: [{ required: ['shapeId'] }, { required: ['elementId'] }],
    },
  },
  // Color correction tools
  {
    name: 'SetColorCorrection',
    description: 'Set color correction parameters on an element',
    parameters: {
      type: 'object',
      properties: {
        elementId: { type: 'string', description: 'Target element ID' },
        brightness: { type: 'number', description: 'Brightness adjustment (-100 to 100)' },
        contrast: { type: 'number', description: 'Contrast adjustment (-100 to 100)' },
        saturation: { type: 'number', description: 'Saturation adjustment (-100 to 100)' },
        temperature: { type: 'number', description: 'Color temperature adjustment' },
        tint: { type: 'number', description: 'Tint adjustment' },
        gamma: { type: 'number', description: 'Gamma adjustment' },
      },
      required: ['elementId'],
    },
  },
  {
    name: 'ResetColorCorrection',
    description: 'Reset color correction to default values',
    parameters: {
      type: 'object',
      properties: {
        elementId: { type: 'string', description: 'Target element ID' },
      },
      required: ['elementId'],
    },
  },
  // Track tools
  {
    name: 'AddTrack',
    description: 'Create a new track in the timeline',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Track name' },
        type: { type: 'string', enum: ['video', 'audio', 'subtitle', 'shape'], description: 'Track type' },
      },
      required: ['name', 'type'],
    },
  },
  {
    name: 'DeleteTrack',
    description: 'Delete a track and all its elements',
    parameters: {
      type: 'object',
      properties: {
        trackId: { type: 'string', description: 'Track ID to delete' },
      },
      required: ['trackId'],
    },
  },
  {
    name: 'ReorderTracks',
    description: 'Reorder tracks in the timeline',
    parameters: {
      type: 'object',
      properties: {
        trackIds: { type: 'array', items: { type: 'string' }, description: 'Ordered array of track IDs' },
      },
      required: ['trackIds'],
    },
  },
  {
    name: 'SetTrackProperties',
    description: 'Update track properties',
    parameters: {
      type: 'object',
      properties: {
        trackId: { type: 'string', description: 'Track ID' },
        name: { type: 'string', description: 'New track name' },
        muted: { type: 'boolean', description: 'Mute track' },
        locked: { type: 'boolean', description: 'Lock track' },
        solo: { type: 'boolean', description: 'Solo track' },
      },
      required: ['trackId'],
    },
  },
  // Mask tools
  {
    name: 'AddMask',
    description: 'Add a mask to an element',
    parameters: {
      type: 'object',
      properties: {
        elementId: { type: 'string', description: 'Target element ID' },
        maskType: { type: 'string', enum: ['rectangle', 'ellipse', 'polygon', 'bezier'], description: 'Mask type' },
        params: { type: 'object', description: 'Mask parameters (position, size, feather, etc.)' },
      },
      required: ['elementId', 'maskType', 'params'],
    },
  },
  {
    name: 'UpdateMask',
    description: 'Update mask parameters',
    parameters: {
      type: 'object',
      properties: {
        elementId: { type: 'string', description: 'Target element ID' },
        maskId: { type: 'string', description: 'Mask ID' },
        params: { type: 'object', description: 'New mask parameters' },
      },
      required: ['elementId', 'maskId', 'params'],
    },
  },
  {
    name: 'RemoveMask',
    description: 'Remove a mask from an element',
    parameters: {
      type: 'object',
      properties: {
        elementId: { type: 'string', description: 'Target element ID' },
        maskId: { type: 'string', description: 'Mask ID to remove' },
      },
      required: ['elementId', 'maskId'],
    },
  },
  // Audio tools
  {
    name: 'SetAudioProperties',
    description: 'Set audio properties on an element',
    parameters: {
      type: 'object',
      properties: {
        elementId: { type: 'string', description: 'Target element ID' },
        volume: { type: 'number', description: 'Volume level (0-1)' },
        pan: { type: 'number', description: 'Pan position (-1 to 1)' },
        muted: { type: 'boolean', description: 'Mute audio' },
        fadeIn: { type: 'number', description: 'Fade in duration in seconds' },
        fadeOut: { type: 'number', description: 'Fade out duration in seconds' },
      },
      required: ['elementId'],
    },
  },
  {
    name: 'AddAudioKeyframe',
    description: 'Add an audio property keyframe',
    parameters: {
      type: 'object',
      properties: {
        elementId: { type: 'string', description: 'Target element ID' },
        property: { type: 'string', enum: ['volume', 'pan'], description: 'Audio property' },
        time: { type: 'number', description: 'Time offset in seconds' },
        value: { type: 'number', description: 'Property value' },
      },
      required: ['elementId', 'property', 'time', 'value'],
    },
  },
  // Media operation tools
  {
    name: 'TrimElement',
    description: 'Trim an element by adjusting its start/end points',
    parameters: {
      type: 'object',
      properties: {
        elementId: { type: 'string', description: 'Target element ID' },
        trimStart: { type: 'number', description: 'Trim from start in seconds' },
        trimEnd: { type: 'number', description: 'Trim from end in seconds' },
      },
      required: ['elementId'],
    },
  },
  {
    name: 'SplitElement',
    description: 'Split an element at a specific time point',
    parameters: {
      type: 'object',
      properties: {
        elementId: { type: 'string', description: 'Target element ID' },
        splitTime: { type: 'number', description: 'Time point to split at (relative to element start)' },
      },
      required: ['elementId', 'splitTime'],
    },
  },
  {
    name: 'SetPlaybackSpeed',
    description: 'Set playback speed for a media element',
    parameters: {
      type: 'object',
      properties: {
        elementId: { type: 'string', description: 'Target element ID' },
        speed: { type: 'number', description: 'Playback speed (0.25 to 4.0, 1.0 = normal)' },
        maintainPitch: { type: 'boolean', description: 'Maintain audio pitch when changing speed' },
      },
      required: ['elementId', 'speed'],
    },
  },
  {
    name: 'SeparateAudio',
    description: 'Separate audio track from a video element',
    parameters: {
      type: 'object',
      properties: {
        elementId: { type: 'string', description: 'Target video element ID' },
        targetTrackId: { type: 'string', description: 'Target audio track ID (optional, creates new track if not provided)' },
      },
      required: ['elementId'],
    },
  },
  // Export tools
  {
    name: 'ExportVideo',
    description: 'Start video export with specified settings',
    parameters: {
      type: 'object',
      properties: {
        format: { type: 'string', enum: ['mp4', 'webm'], description: 'Output format' },
        quality: { type: 'string', enum: ['low', 'medium', 'high', 'ultra'], description: 'Quality preset' },
        resolution: { type: 'string', description: 'Output resolution (e.g., 1920x1080)' },
        fps: { type: 'number', description: 'Frame rate' },
      },
      required: ['format', 'quality'],
    },
  },
  {
    name: 'GetExportProgress',
    description: 'Get current export progress',
    requiresConfirmation: false,
    parameters: {
      type: 'object',
      properties: {
        exportId: { type: 'string', description: 'Export task ID' },
      },
      required: ['exportId'],
    },
  },
  // Render tools
  {
    name: 'RenderFrame',
    description: 'Render a single frame at a specific time point and return as base64 image',
    requiresConfirmation: false,
    parameters: {
      type: 'object',
      properties: {
        time: { type: 'number', description: 'Time point in seconds to render' },
        width: { type: 'number', description: 'Output width in pixels (optional, uses project resolution if not provided)' },
        height: { type: 'number', description: 'Output height in pixels (optional, uses project resolution if not provided)' },
        format: { type: 'string', enum: ['png', 'jpeg', 'webp'], description: 'Output format (default: png)' },
        quality: { type: 'number', description: 'Quality for jpeg/webp (0-100, default: 90)' },
      },
      required: ['time'],
    },
  },
  {
    name: 'RenderClip',
    description: 'Render a video clip for a specific time range',
    parameters: {
      type: 'object',
      properties: {
        startTime: { type: 'number', description: 'Start time in seconds' },
        endTime: { type: 'number', description: 'End time in seconds' },
        format: { type: 'string', enum: ['mp4', 'webm'], description: 'Output format (default: mp4)' },
        quality: { type: 'string', enum: ['low', 'medium', 'high'], description: 'Quality preset (default: medium)' },
        width: { type: 'number', description: 'Output width in pixels (optional)' },
        height: { type: 'number', description: 'Output height in pixels (optional)' },
        fps: { type: 'number', description: 'Frame rate (optional, uses project fps if not provided)' },
      },
      required: ['startTime', 'endTime'],
    },
  },
  {
    name: 'GetThumbnail',
    description: 'Get a thumbnail image for an element or time point',
    requiresConfirmation: false,
    parameters: {
      type: 'object',
      properties: {
        elementId: { type: 'string', description: 'Element ID to get thumbnail for (optional)' },
        time: { type: 'number', description: 'Time point in seconds (optional, used if elementId not provided)' },
        width: { type: 'number', description: 'Thumbnail width in pixels (default: 160)' },
        height: { type: 'number', description: 'Thumbnail height in pixels (default: 90)' },
        format: { type: 'string', enum: ['png', 'jpeg', 'webp'], description: 'Output format (default: jpeg)' },
      },
      required: [],
    },
  },
];

/**
 * Register all timeline bridge tools
 */
export function registerTimelineTools(
  registry: { register(tool: Tool): void },
  bridge: TimelineBridge
): void {
  for (const config of TIMELINE_TOOL_CONFIGS) {
    if (LOCAL_TIMELINE_TOOL_NAMES.has(config.name)) {
      registry.register({
        name: config.name,
        description: config.description,
        category: 'timeline' as ToolCategory,
        requiresConfirmation: config.requiresConfirmation ?? true,
        parameters: config.parameters,
        execute: async (args: Record<string, unknown>): Promise<ToolResult> => {
          return getTimelineToolExecutor().execute(config.name, args);
        },
      });
    } else {
      registry.register(bridge.createTool(config));
    }
  }
}
