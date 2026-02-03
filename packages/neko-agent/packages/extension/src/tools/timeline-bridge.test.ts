/**
 * Timeline Bridge Tool Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  TimelineBridge,
  TIMELINE_TOOL_NAMES,
  TIMELINE_TOOL_CONFIGS,
  registerTimelineTools,
  type TimelineToolConfig,
} from './timeline-bridge';
import type { Tool, ToolResult } from '@neko/agent';

// Mock vscode module
vi.mock('vscode', () => ({}));

// Mock webview
function createMockWebview() {
  return {
    postMessage: vi.fn().mockResolvedValue(true),
    onDidReceiveMessage: vi.fn(),
    html: '',
    options: {},
    asWebviewUri: vi.fn(),
    cspSource: '',
  };
}

describe('TimelineBridge', () => {
  let bridge: TimelineBridge;

  beforeEach(() => {
    bridge = new TimelineBridge();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('webview management', () => {
    it('should set webview', () => {
      const mockWebview = createMockWebview();
      bridge.setWebview(mockWebview as any);
      // No error means success
    });

    it('should clear webview', () => {
      const mockWebview = createMockWebview();
      bridge.setWebview(mockWebview as any);
      bridge.clearWebview();
      // No error means success
    });

    it('should reject pending requests when webview is cleared', async () => {
      const mockWebview = createMockWebview();
      bridge.setWebview(mockWebview as any);

      // Start an execution
      const executePromise = bridge.execute('AddEffect', {
        elementId: 'elem-1',
        effectType: 'blur',
      });

      // Clear webview before response
      bridge.clearWebview();

      // The promise should reject
      await expect(executePromise).rejects.toThrow('disconnected');
    });
  });

  describe('tool execution', () => {
    it('should return error when webview not available', async () => {
      const result = await bridge.execute('ListEffects', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('not available');
    });

    it('should send message to webview', async () => {
      const mockWebview = createMockWebview();
      bridge.setWebview(mockWebview as any);

      // Start execution (don't await yet)
      const executePromise = bridge.execute('AddEffect', {
        elementId: 'elem-1',
        effectType: 'blur',
      });

      // Verify message was sent
      expect(mockWebview.postMessage).toHaveBeenCalledWith({
        type: 'tool.execute',
        requestId: expect.stringMatching(/^tool-\d+-\d+$/),
        toolName: 'AddEffect',
        params: {
          elementId: 'elem-1',
          effectType: 'blur',
        },
      });

      // Simulate response
      const call = mockWebview.postMessage.mock.calls[0][0];
      bridge.handleResponse(call.requestId, true, { effectId: 'effect-123' });

      const result = await executePromise;
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ effectId: 'effect-123' });
    });

    it('should handle error response', async () => {
      const mockWebview = createMockWebview();
      bridge.setWebview(mockWebview as any);

      const executePromise = bridge.execute('RemoveEffect', {
        elementId: 'elem-1',
        effectId: 'effect-1',
      });

      const call = mockWebview.postMessage.mock.calls[0][0];
      bridge.handleResponse(call.requestId, false, undefined, 'Effect not found');

      const result = await executePromise;
      expect(result.success).toBe(false);
      expect(result.error).toBe('Effect not found');
    });

    it('should timeout after 30 seconds', async () => {
      const mockWebview = createMockWebview();
      bridge.setWebview(mockWebview as any);

      const executePromise = bridge.execute('ExportVideo', { format: 'mp4' });

      // Advance time by 30 seconds
      await vi.advanceTimersByTimeAsync(30001);

      const result = await executePromise;
      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
    });

    it('should ignore response for unknown requestId', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      bridge.handleResponse('unknown-id', true, {});

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('No pending request found')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('createTool', () => {
    it('should create a valid tool from config', () => {
      const config: TimelineToolConfig = {
        name: 'ListEffects',
        description: 'List all available effects',
        requiresConfirmation: false,
        parameters: { type: 'object', properties: {}, required: [] },
      };

      const tool = bridge.createTool(config);

      expect(tool.name).toBe('ListEffects');
      expect(tool.description).toBe('List all available effects');
      expect(tool.category).toBe('timeline');
      expect(tool.requiresConfirmation).toBe(false);
      expect(typeof tool.execute).toBe('function');
    });

    it('should default requiresConfirmation to true', () => {
      const config: TimelineToolConfig = {
        name: 'AddEffect',
        description: 'Add an effect',
        parameters: { type: 'object', properties: {}, required: [] },
      };

      const tool = bridge.createTool(config);

      expect(tool.requiresConfirmation).toBe(true);
    });

    it('should execute via bridge when tool is called', async () => {
      const mockWebview = createMockWebview();
      bridge.setWebview(mockWebview as any);

      const config: TimelineToolConfig = {
        name: 'AddEffect',
        description: 'Add an effect',
        parameters: {
          type: 'object',
          properties: {
            elementId: { type: 'string' },
            effectType: { type: 'string' },
          },
          required: ['elementId', 'effectType'],
        },
      };

      const tool = bridge.createTool(config);

      const executePromise = tool.execute({
        elementId: 'elem-1',
        effectType: 'blur',
      });

      // Simulate response
      const call = mockWebview.postMessage.mock.calls[0][0];
      bridge.handleResponse(call.requestId, true, { effectId: 'effect-123' });

      const result = await executePromise;
      expect(result.success).toBe(true);
    });
  });
});

describe('TIMELINE_TOOL_NAMES', () => {
  it('should contain all expected tool names', () => {
    // Element tools
    expect(TIMELINE_TOOL_NAMES).toContain('GetTimelineInfo');
    expect(TIMELINE_TOOL_NAMES).toContain('GetElementInfo');
    expect(TIMELINE_TOOL_NAMES).toContain('ListElements');
    expect(TIMELINE_TOOL_NAMES).toContain('AddElement');
    expect(TIMELINE_TOOL_NAMES).toContain('UpdateElement');
    expect(TIMELINE_TOOL_NAMES).toContain('DeleteElement');
    // Effect tools
    expect(TIMELINE_TOOL_NAMES).toContain('ListEffects');
    expect(TIMELINE_TOOL_NAMES).toContain('AddEffect');
    expect(TIMELINE_TOOL_NAMES).toContain('UpdateEffect');
    expect(TIMELINE_TOOL_NAMES).toContain('RemoveEffect');
    expect(TIMELINE_TOOL_NAMES).toContain('ListTransitions');
    expect(TIMELINE_TOOL_NAMES).toContain('SetTransition');
    expect(TIMELINE_TOOL_NAMES).toContain('GetKeyframes');
    expect(TIMELINE_TOOL_NAMES).toContain('AddKeyframe');
    expect(TIMELINE_TOOL_NAMES).toContain('AddShape');
    expect(TIMELINE_TOOL_NAMES).toContain('SetColorCorrection');
    expect(TIMELINE_TOOL_NAMES).toContain('AddTrack');
    expect(TIMELINE_TOOL_NAMES).toContain('AddMask');
    expect(TIMELINE_TOOL_NAMES).toContain('SetAudioProperties');
    expect(TIMELINE_TOOL_NAMES).toContain('ExportVideo');
    // Media operation tools
    expect(TIMELINE_TOOL_NAMES).toContain('TrimElement');
    expect(TIMELINE_TOOL_NAMES).toContain('SplitElement');
    expect(TIMELINE_TOOL_NAMES).toContain('SetPlaybackSpeed');
    expect(TIMELINE_TOOL_NAMES).toContain('SeparateAudio');
    // Render tools
    expect(TIMELINE_TOOL_NAMES).toContain('RenderFrame');
    expect(TIMELINE_TOOL_NAMES).toContain('RenderClip');
    expect(TIMELINE_TOOL_NAMES).toContain('GetThumbnail');
  });

  it('should have correct count', () => {
    expect(TIMELINE_TOOL_NAMES.length).toBe(38);
  });
});

describe('TIMELINE_TOOL_CONFIGS', () => {
  it('should have config for each tool name', () => {
    for (const toolName of TIMELINE_TOOL_NAMES) {
      const config = TIMELINE_TOOL_CONFIGS.find(c => c.name === toolName);
      expect(config).toBeDefined();
    }
  });

  it('should have valid parameter schemas', () => {
    for (const config of TIMELINE_TOOL_CONFIGS) {
      expect(config.parameters).toBeDefined();
      expect(config.parameters.type).toBe('object');
    }
  });

  it('should mark read-only tools as not requiring confirmation', () => {
    const readOnlyTools = ['GetTimelineInfo', 'GetElementInfo', 'ListElements', 'ListEffects', 'ListTransitions', 'GetKeyframes', 'GetExportProgress', 'RenderFrame', 'GetThumbnail'];

    for (const toolName of readOnlyTools) {
      const config = TIMELINE_TOOL_CONFIGS.find(c => c.name === toolName);
      expect(config?.requiresConfirmation).toBe(false);
    }
  });

  it('should mark modification tools as requiring confirmation by default', () => {
    const modificationTools = ['AddEffect', 'RemoveEffect', 'AddTrack', 'DeleteTrack'];

    for (const toolName of modificationTools) {
      const config = TIMELINE_TOOL_CONFIGS.find(c => c.name === toolName);
      // Should be undefined (defaults to true) or explicitly true
      expect(config?.requiresConfirmation).not.toBe(false);
    }
  });
});

describe('registerTimelineTools', () => {
  it('should register all timeline tools', () => {
    const bridge = new TimelineBridge();
    const mockRegistry = {
      register: vi.fn(),
    };

    registerTimelineTools(mockRegistry, bridge);

    expect(mockRegistry.register).toHaveBeenCalledTimes(TIMELINE_TOOL_CONFIGS.length);

    // Verify each registered tool has correct structure
    for (const call of mockRegistry.register.mock.calls) {
      const tool = call[0] as Tool;
      expect(tool.name).toBeDefined();
      expect(tool.description).toBeDefined();
      expect(tool.category).toBe('timeline');
      expect(tool.parameters).toBeDefined();
      expect(typeof tool.execute).toBe('function');
    }
  });

  it('should log registration count', () => {
    const bridge = new TimelineBridge();
    const mockRegistry = { register: vi.fn() };
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    registerTimelineTools(mockRegistry, bridge);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining(`${TIMELINE_TOOL_CONFIGS.length} timeline tools`)
    );

    consoleSpy.mockRestore();
  });
});
