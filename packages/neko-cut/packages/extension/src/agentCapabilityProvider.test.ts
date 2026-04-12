import { describe, expect, it, vi } from 'vitest';
import type { AgentCapabilityContext, NekoCutAPI, ToolResult } from '@neko/shared';
import { TOOL_NAMES_MEDIA, TOOL_NAMES_TIMELINE } from '@neko/shared';
import { createNekoCutCapabilityProvider } from './agentCapabilityProvider';
import type { TimelineToolBridge } from './services/timelineToolBridge';

function createApi(): NekoCutAPI {
  return {
    timeline: {
      getInfo: vi.fn(async () => ({
        duration: 10,
        fps: 24,
        width: 1920,
        height: 1080,
        trackCount: 1,
      })),
      addElement: vi.fn(async () => 'elem-1'),
      updateElement: vi.fn(async () => undefined),
      deleteElement: vi.fn(async () => undefined),
      listElements: vi.fn(async () => []),
    },
    ai: {
      generateVideoForClip: vi.fn(async () => 'elem-1'),
    },
  };
}

function createContext(): AgentCapabilityContext {
  return {
    extensionContext: {},
    mediaService: undefined,
    configManager: undefined,
    embedFn: undefined,
  };
}

describe('createNekoCutCapabilityProvider', () => {
  it('registers advanced timeline tools through the capability provider', () => {
    const bridge = {
      executeAgentTool: vi.fn(async (): Promise<ToolResult> => ({ success: true })),
    } as unknown as TimelineToolBridge;

    const provider = createNekoCutCapabilityProvider(createApi(), bridge);
    const names = provider.getTools(createContext()).map((tool) => tool.name);

    expect(names).toContain(TOOL_NAMES_TIMELINE.GET_ELEMENT_INFO);
    expect(names).toContain(TOOL_NAMES_TIMELINE.ADD_EFFECT);
    expect(names).toContain(TOOL_NAMES_TIMELINE.ADD_TRACK);
    expect(names).toContain(TOOL_NAMES_TIMELINE.SET_COLOR_CORRECTION);
    expect(names).toContain(TOOL_NAMES_TIMELINE.SET_AUDIO_PROPERTIES);
  });

  it('routes timeline tool execution through TimelineToolBridge', async () => {
    const bridge = {
      executeAgentTool: vi.fn(
        async (): Promise<ToolResult> => ({
          success: true,
          data: { trackId: 'track-a' },
        }),
      ),
    } as unknown as TimelineToolBridge;

    const provider = createNekoCutCapabilityProvider(createApi(), bridge);
    const addTrackTool = provider
      .getTools(createContext())
      .find((tool) => tool.name === TOOL_NAMES_TIMELINE.ADD_TRACK);

    expect(addTrackTool).toBeDefined();

    const result = await addTrackTool!.execute({ type: 'audio' });
    expect(result.success).toBe(true);
    expect(bridge.executeAgentTool).toHaveBeenCalledWith(TOOL_NAMES_TIMELINE.ADD_TRACK, {
      type: 'audio',
    });
  });

  it('keeps GenerateVideoForClip available when media service is injected', () => {
    const bridge = {
      executeAgentTool: vi.fn(async (): Promise<ToolResult> => ({ success: true })),
    } as unknown as TimelineToolBridge;
    const mediaService = {
      generateVideo: vi.fn(),
      waitForTask: vi.fn(),
    };

    const provider = createNekoCutCapabilityProvider(createApi(), bridge);
    const names = provider
      .getTools({ ...createContext(), mediaService } as AgentCapabilityContext)
      .map((tool) => tool.name);

    expect(names).toContain(TOOL_NAMES_MEDIA.GENERATE_VIDEO_FOR_CLIP);
  });
});
