import { describe, expect, it } from 'vitest';
import { isOperationToolPlanTraceable } from '@neko/shared';
import { createTimelineElementUpdateAdapter } from './timelineElementUpdateAdapter';

function createProjectData() {
  return {
    version: '2.0',
    name: 'Timeline project',
    resolution: { width: 1920, height: 1080 },
    fps: 30,
    tracks: [
      {
        id: 'video-track-1',
        name: 'Video',
        type: 'media',
        muted: false,
        locked: false,
        hidden: false,
        isMain: true,
        elements: [
          {
            id: 'clip-3',
            type: 'media',
            name: 'Shot 3',
            src: '${PROJECT}/shots/shot-3.mp4',
            mediaType: 'video',
            startTime: 1,
            duration: 2,
            trimStart: 0,
            trimEnd: 0,
            transform: { x: 0.5, y: 0.5, scaleX: 1, scaleY: 1, rotation: 0 },
            opacity: 1,
            blendMode: 'normal',
            effects: [],
            muted: false,
            hidden: false,
            locked: false,
          },
        ],
      },
      {
        id: 'video-track-2',
        name: 'B-roll',
        type: 'media',
        muted: false,
        locked: false,
        hidden: false,
        isMain: false,
        elements: [],
      },
    ],
  };
}

const rationale = {
  id: 'rat-update-shot-3',
  decision: 'update-selected-timeline-clip',
  reason: 'Agent decided the selected clip should be renamed.',
  confidence: 'high' as const,
  observationIds: ['obs-shot-3'],
  evidenceIds: [],
  createdAt: 1,
};

describe('createTimelineElementUpdateAdapter', () => {
  it('plans a traceable element.update EditOperation from an Agent intent', async () => {
    const adapter = createTimelineElementUpdateAdapter({ now: () => 1_771_718_409_000 });
    const intent = {
      id: 'intent-rename-shot-3',
      domain: 'timeline' as const,
      summary: 'Rename shot 3 after Agent review.',
      rationaleId: rationale.id,
      targetIds: ['clip-3'],
      parameters: {
        trackId: 'video-track-1',
        updates: { name: 'Shot 3 — adjusted', hidden: true },
      },
      createdAt: 2,
    };
    const context = {
      rationale,
      contextPacketId: 'ctx-timeline-shot-3',
      metadata: { projectData: createProjectData() },
    };

    expect(adapter.canPlan(intent, context)).toBe(true);
    await expect(adapter.plan(intent, context)).resolves.toEqual({
      id: 'plan:intent-rename-shot-3',
      intentId: 'intent-rename-shot-3',
      rationaleId: 'rat-update-shot-3',
      requiresUserApproval: false,
      reversible: true,
      createdAt: 1_771_718_409_000,
      operations: [
        {
          type: 'element.update',
          meta: {
            id: 'timeline-element-update:intent-rename-shot-3',
            timestamp: 1_771_718_409_000,
            source: 'ai',
            description: 'Rename shot 3 after Agent review.',
          },
          payload: {
            trackId: 'video-track-1',
            elementId: 'clip-3',
            updates: { name: 'Shot 3 — adjusted', hidden: true },
          },
          before: { updates: { name: 'Shot 3', hidden: false } },
        },
      ],
    });

    const plan = await adapter.plan(intent, context);
    expect(isOperationToolPlanTraceable(plan)).toBe(true);
  });

  it('plans timeline trim changes as element.update with reversible before values', async () => {
    const adapter = createTimelineElementUpdateAdapter({ now: () => 1_771_718_412_000 });
    const intent = {
      id: 'intent-trim-shot-3',
      domain: 'timeline' as const,
      summary: 'Trim shot 3 after Agent review.',
      rationaleId: rationale.id,
      targetIds: ['clip-3'],
      parameters: {
        trackId: 'video-track-1',
        updates: { startTime: 1.5, duration: 1.2, trimStart: 0.4, trimEnd: 0.3 },
      },
      createdAt: 2,
    };
    const context = {
      rationale,
      metadata: { projectData: createProjectData() },
    };

    expect(adapter.canPlan(intent, context)).toBe(true);
    await expect(adapter.plan(intent, context)).resolves.toEqual({
      id: 'plan:intent-trim-shot-3',
      intentId: 'intent-trim-shot-3',
      rationaleId: 'rat-update-shot-3',
      requiresUserApproval: false,
      reversible: true,
      createdAt: 1_771_718_412_000,
      operations: [
        {
          type: 'element.update',
          meta: {
            id: 'timeline-element-update:intent-trim-shot-3',
            timestamp: 1_771_718_412_000,
            source: 'ai',
            description: 'Trim shot 3 after Agent review.',
          },
          payload: {
            trackId: 'video-track-1',
            elementId: 'clip-3',
            updates: { startTime: 1.5, duration: 1.2, trimStart: 0.4, trimEnd: 0.3 },
          },
          before: { updates: { startTime: 1, duration: 2, trimStart: 0, trimEnd: 0 } },
        },
      ],
    });
  });

  it('plans a traceable element.splitAt EditOperation from an Agent intent', async () => {
    const adapter = createTimelineElementUpdateAdapter({ now: () => 1_771_718_413_000 });
    const intent = {
      id: 'intent-split-shot-3',
      domain: 'timeline' as const,
      summary: 'Split shot 3 at the selected moment.',
      rationaleId: rationale.id,
      targetIds: ['clip-3'],
      parameters: {
        trackId: 'video-track-1',
        splitPoint: 0.8,
        rightElementId: 'clip-3-right',
        rightElementName: 'Shot 3 — right',
      },
      createdAt: 2,
    };
    const context = {
      rationale,
      contextPacketId: 'ctx-timeline-shot-3',
      metadata: { projectData: createProjectData() },
    };

    expect(adapter.canPlan(intent, context)).toBe(true);
    await expect(adapter.plan(intent, context)).resolves.toEqual({
      id: 'plan:intent-split-shot-3',
      intentId: 'intent-split-shot-3',
      rationaleId: 'rat-update-shot-3',
      requiresUserApproval: false,
      reversible: true,
      createdAt: 1_771_718_413_000,
      operations: [
        {
          type: 'element.splitAt',
          meta: {
            id: 'timeline-element-update:intent-split-shot-3',
            timestamp: 1_771_718_413_000,
            source: 'ai',
            description: 'Split shot 3 at the selected moment.',
          },
          payload: {
            trackId: 'video-track-1',
            elementId: 'clip-3',
            splitPoint: 0.8,
            rightElement: {
              id: 'clip-3-right',
              type: 'media',
              name: 'Shot 3 — right',
              src: '${PROJECT}/shots/shot-3.mp4',
              mediaType: 'video',
              startTime: 1.8,
              duration: 2,
              trimStart: 0.8,
              trimEnd: 0,
              transform: { x: 0.5, y: 0.5, scaleX: 1, scaleY: 1, rotation: 0 },
              opacity: 1,
              blendMode: 'normal',
              effects: [],
              muted: false,
              hidden: false,
              locked: false,
            },
          },
          before: { trimEnd: 0 },
        },
      ],
    });
  });

  it('plans element.splitKeepRight with reversible before values', async () => {
    const adapter = createTimelineElementUpdateAdapter({ now: () => 1_771_718_414_000 });
    const intent = {
      id: 'intent-keep-right-shot-3',
      domain: 'timeline' as const,
      summary: 'Keep the right side of shot 3.',
      rationaleId: rationale.id,
      targetIds: ['clip-3'],
      parameters: {
        trackId: 'video-track-1',
        splitMode: 'keep-right',
        splitPoint: 0.75,
        newName: 'Shot 3 — right only',
      },
      createdAt: 2,
    };
    const context = {
      rationale,
      metadata: { projectData: createProjectData() },
    };

    expect(adapter.canPlan(intent, context)).toBe(true);
    await expect(adapter.plan(intent, context)).resolves.toEqual({
      id: 'plan:intent-keep-right-shot-3',
      intentId: 'intent-keep-right-shot-3',
      rationaleId: 'rat-update-shot-3',
      requiresUserApproval: false,
      reversible: true,
      createdAt: 1_771_718_414_000,
      operations: [
        {
          type: 'element.splitKeepRight',
          meta: {
            id: 'timeline-element-update:intent-keep-right-shot-3',
            timestamp: 1_771_718_414_000,
            source: 'ai',
            description: 'Keep the right side of shot 3.',
          },
          payload: {
            trackId: 'video-track-1',
            elementId: 'clip-3',
            splitPoint: 0.75,
            newStartTime: 1.75,
            newName: 'Shot 3 — right only',
          },
          before: { startTime: 1, trimStart: 0, name: 'Shot 3' },
        },
      ],
    });
  });

  it('plans a traceable element.move EditOperation from an Agent intent', async () => {
    const adapter = createTimelineElementUpdateAdapter({ now: () => 1_771_718_411_000 });
    const intent = {
      id: 'intent-move-shot-3',
      domain: 'timeline' as const,
      summary: 'Move shot 3 to the B-roll track.',
      rationaleId: rationale.id,
      targetIds: ['clip-3'],
      parameters: {
        trackId: 'video-track-1',
        toTrackId: 'video-track-2',
      },
      createdAt: 2,
    };
    const context = {
      rationale,
      contextPacketId: 'ctx-timeline-shot-3',
      metadata: { projectData: createProjectData() },
    };

    expect(adapter.canPlan(intent, context)).toBe(true);
    await expect(adapter.plan(intent, context)).resolves.toEqual({
      id: 'plan:intent-move-shot-3',
      intentId: 'intent-move-shot-3',
      rationaleId: 'rat-update-shot-3',
      requiresUserApproval: false,
      reversible: true,
      createdAt: 1_771_718_411_000,
      operations: [
        {
          type: 'element.move',
          meta: {
            id: 'timeline-element-update:intent-move-shot-3',
            timestamp: 1_771_718_411_000,
            source: 'ai',
            description: 'Move shot 3 to the B-roll track.',
          },
          payload: {
            fromTrackId: 'video-track-1',
            toTrackId: 'video-track-2',
            elementId: 'clip-3',
          },
          before: { fromIndex: 0 },
        },
      ],
    });
  });

  it('refuses to plan without project data or supported updates', () => {
    const adapter = createTimelineElementUpdateAdapter();
    const intent = {
      id: 'intent-missing-project',
      domain: 'timeline' as const,
      summary: 'Rename shot 3.',
      rationaleId: rationale.id,
      targetIds: ['clip-3'],
      parameters: { updates: { unsupported: true } },
      createdAt: 2,
    };

    expect(adapter.canPlan(intent, { rationale })).toBe(false);
    expect(
      adapter.canPlan(intent, {
        rationale,
        metadata: { projectData: createProjectData() },
      }),
    ).toBe(false);

    expect(
      adapter.canPlan(
        { ...intent, parameters: { trackId: 'video-track-1', splitPoint: 0 } },
        { rationale, metadata: { projectData: createProjectData() } },
      ),
    ).toBe(false);
  });
});
