import { describe, expect, it } from 'vitest';
import type { ToolResult, TimelineElementUpdate } from '@neko/shared';
import { TOOL_NAMES_TIMELINE } from '@neko/shared';
import { TimelineToolBridge, type TimelineToolRunner } from './timelineToolBridge';

class MockTimelineToolRunner implements TimelineToolRunner {
  readonly calls: Array<{ toolName: string; params: Record<string, unknown> }> = [];
  private readonly results = new Map<string, ToolResult>();

  setResult(toolName: string, result: ToolResult): void {
    this.results.set(toolName, result);
  }

  async execute(toolName: string, params: Record<string, unknown>): Promise<ToolResult> {
    this.calls.push({ toolName, params });
    return this.results.get(toolName) ?? { success: true, data: undefined };
  }
}

describe('TimelineToolBridge', () => {
  it('unwraps timeline info from executor results', async () => {
    const runner = new MockTimelineToolRunner();
    runner.setResult('GetTimelineInfo', {
      success: true,
      data: { duration: 12, fps: 24, width: 1920, height: 1080, trackCount: 3 },
    });

    const bridge = new TimelineToolBridge(runner);
    const info = await bridge.getInfo();

    expect(info.duration).toBe(12);
    expect(runner.calls).toEqual([{ toolName: 'GetTimelineInfo', params: {} }]);
  });

  it('maps AddTimelineElement media types to internal AddElement payload', async () => {
    const runner = new MockTimelineToolRunner();
    runner.setResult('AddElement', {
      success: true,
      data: { elementId: 'elem-1' },
    });

    const bridge = new TimelineToolBridge(runner);
    const result = await bridge.executeAgentTool(TOOL_NAMES_TIMELINE.ADD_TIMELINE_ELEMENT, {
      type: 'video',
      trackId: 'track-1',
      startTime: 5,
      duration: 3,
      source: '/tmp/clip.mp4',
    });

    expect(result.success).toBe(true);
    expect(runner.calls).toEqual([
      {
        toolName: 'AddElement',
        params: {
          trackId: 'track-1',
          type: 'media',
          startTime: 5,
          duration: 3,
          src: '/tmp/clip.mp4',
        },
      },
    ]);
  });

  it('expands public update payloads into executor calls', async () => {
    const runner = new MockTimelineToolRunner();
    const bridge = new TimelineToolBridge(runner);

    await bridge.updateElement('elem-1', {
      startTime: 2,
      transitionIn: { type: 'fade', duration: 0.5 },
      speed: 1.25,
    } as TimelineElementUpdate);

    expect(runner.calls).toEqual([
      {
        toolName: 'UpdateElement',
        params: { elementId: 'elem-1', startTime: 2 },
      },
      {
        toolName: 'SetTransition',
        params: {
          elementId: 'elem-1',
          placement: 'in',
          type: 'fade',
          duration: 0.5,
          easing: undefined,
          params: undefined,
        },
      },
      {
        toolName: 'SetPlaybackSpeed',
        params: { elementId: 'elem-1', speed: 1.25 },
      },
    ]);
  });

  it('defaults AddTrack name based on track type', async () => {
    const runner = new MockTimelineToolRunner();
    const bridge = new TimelineToolBridge(runner);

    await bridge.executeAgentTool(TOOL_NAMES_TIMELINE.ADD_TRACK, {
      type: 'audio',
    });

    expect(runner.calls).toEqual([
      {
        toolName: 'AddTrack',
        params: { type: 'audio', name: 'Audio' },
      },
    ]);
  });

  it('unwraps ListElements result payloads into API arrays', async () => {
    const runner = new MockTimelineToolRunner();
    runner.setResult('ListElements', {
      success: true,
      data: {
        elements: [{ id: 'elem-1', type: 'media', trackId: 'track-1', startTime: 0, duration: 4 }],
      },
    });

    const bridge = new TimelineToolBridge(runner);
    const elements = await bridge.listElements();

    expect(elements).toHaveLength(1);
    expect(elements[0]?.id).toBe('elem-1');
  });
});
