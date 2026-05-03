import { describe, expect, it, vi } from 'vitest';
import type { TimelineContextEditorLike } from '../timeline-context-runtime';
import { createTimelineContextRuntime } from '../timeline-context-runtime';

function createTimelineEditor(
  overrides: Partial<{
    hasTimeline: boolean;
    elementIds: readonly string[];
    trackId: string;
    currentTime: number;
  }> = {},
): TimelineContextEditorLike {
  return {
    capabilities: { hasTimeline: overrides.hasTimeline ?? true },
    getSelection: () => ({
      elementIds: overrides.elementIds ?? ['clip-1'],
      ...(overrides.trackId ? { trackId: overrides.trackId } : {}),
    }),
    getState: () => ({
      ...(overrides.currentTime !== undefined ? { currentTime: overrides.currentTime } : {}),
    }),
    getContent: () => ({}),
  };
}

describe('timeline-context-runtime', () => {
  it('returns null when active editor does not support timeline', async () => {
    const getPerceptionClient = vi.fn();
    const runtime = createTimelineContextRuntime({ getPerceptionClient });

    await expect(
      runtime.build({
        activeEditor: createTimelineEditor({ hasTimeline: false }),
        message: 'inspect clip',
        workspaceRoot: '/workspace',
      }),
    ).resolves.toBeNull();
    expect(getPerceptionClient).not.toHaveBeenCalled();
  });

  it('builds a timeline context packet from editor selection and state', async () => {
    const runtime = createTimelineContextRuntime();

    const packet = await runtime.build({
      activeEditor: createTimelineEditor({
        elementIds: ['clip-1'],
        trackId: 'track-a',
        currentTime: 12.5,
      }),
      message: 'describe selected clip',
      workspaceRoot: '/workspace',
    });

    expect(packet).toEqual(
      expect.objectContaining({
        uiContext: expect.objectContaining({
          activePanel: 'timeline',
          selectionIds: ['sel-timeline-clip-1'],
          userAnnotation: 'describe selected clip',
          timeline: expect.objectContaining({
            activeTrackId: 'track-a',
            playheadMs: 12500,
          }),
        }),
      }),
    );
  });

  it('does not request perception client when workspace root is missing', async () => {
    const getPerceptionClient = vi.fn();
    const runtime = createTimelineContextRuntime({ getPerceptionClient });

    const packet = await runtime.build({
      activeEditor: createTimelineEditor(),
      message: 'inspect clip',
    });

    expect(packet).not.toBeNull();
    expect(getPerceptionClient).not.toHaveBeenCalled();
  });

  it('resolves perception inputs when workspace root and client are available', async () => {
    const getPerceptionClient = vi.fn(async () => ({
      extractFrame: vi.fn(async () => null),
    }));
    const runtime = createTimelineContextRuntime({ getPerceptionClient });

    const packet = await runtime.build({
      activeEditor: createTimelineEditor(),
      message: 'inspect clip',
      workspaceRoot: '/workspace',
    });

    expect(packet).not.toBeNull();
    expect(getPerceptionClient).toHaveBeenCalledOnce();
  });
});
