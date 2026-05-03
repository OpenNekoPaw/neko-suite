import { describe, expect, it } from 'vitest';
import { isPerceptionInputTraceable } from '@neko/shared';
import {
  createCanvasSelectionContextPacket,
  createTimelineContextPacketFromEditor,
  createTimelineSelectionContextPacket,
} from '../multimodal-context-packet';

describe('createCanvasSelectionContextPacket', () => {
  it('returns null for empty canvas selection', () => {
    expect(createCanvasSelectionContextPacket([])).toBeNull();
  });

  it('maps selected canvas nodes to traceable context packet refs', () => {
    const packet = createCanvasSelectionContextPacket(
      [
        {
          nodeId: 'node-1',
          type: 'shot',
          summary: '#3 MS - Alice enters',
        },
      ],
      { createdAt: 1_771_718_405_000, userAnnotation: 'adjust this shot' },
    );

    expect(packet).toEqual(
      expect.objectContaining({
        id: expect.stringMatching(/^ctx-canvas-[0-9a-f-]{36}$/),
        uiContext: expect.objectContaining({
          activePanel: 'canvas',
          selectionIds: ['sel-canvas-node-1'],
          userAnnotation: 'adjust this shot',
        }),
      }),
    );
    expect(packet?.selection[0]).toEqual(
      expect.objectContaining({
        id: 'sel-canvas-node-1',
        kind: 'canvas-node',
        panel: 'canvas',
        projectObjectId: 'canvas-node-node-1',
      }),
    );
    expect(packet?.perceptionInputs[0]).toEqual(
      expect.objectContaining({
        id: 'input-canvas-node-node-1',
        kind: 'structured-data',
        modality: 'data',
        sourceSelectionId: 'sel-canvas-node-1',
        projectObjectId: 'canvas-node-node-1',
      }),
    );

    const input = packet?.perceptionInputs[0];
    if (!packet || !input) {
      throw new Error('expected context packet with perception input');
    }
    expect(isPerceptionInputTraceable(packet, input)).toBe(true);
  });

  it('maps visual canvas nodes to canvas-crop perception inputs', () => {
    const packet = createCanvasSelectionContextPacket(
      [
        {
          nodeId: 'node-media-1',
          type: 'media',
          summary: 'image: reference.png',
          assetUri: '${PROJECT}/refs/reference.png',
          assetKind: 'image',
          bounds: { x: 10, y: 20, width: 320, height: 180 },
        },
      ],
      { createdAt: 1_771_718_405_100 },
    );

    expect(packet?.artifactRefs[0]).toEqual(
      expect.objectContaining({
        id: 'artifact-canvas-node-node-media-1',
        kind: 'image',
        uri: '${PROJECT}/refs/reference.png',
      }),
    );
    expect(packet?.projectRefs[0]).toEqual(
      expect.objectContaining({
        id: 'canvas-node-node-media-1',
        artifactIds: ['artifact-canvas-node-node-media-1'],
      }),
    );
    expect(packet?.perceptionInputs[0]).toEqual(
      expect.objectContaining({
        id: 'input-canvas-node-node-media-1',
        kind: 'canvas-crop',
        modality: 'image',
        artifactId: 'artifact-canvas-node-node-media-1',
        uri: '${PROJECT}/refs/reference.png',
        metadata: expect.objectContaining({
          bounds: { x: 10, y: 20, width: 320, height: 180 },
          assetKind: 'image',
        }),
      }),
    );
  });

  it('creates unique packet ids even within the same millisecond', () => {
    const first = createCanvasSelectionContextPacket(
      [{ nodeId: 'node-1', type: 'shot', summary: 'first' }],
      { createdAt: 1 },
    );
    const second = createCanvasSelectionContextPacket(
      [{ nodeId: 'node-2', type: 'shot', summary: 'second' }],
      { createdAt: 1 },
    );

    expect(first?.id).toMatch(/^ctx-canvas-/);
    expect(second?.id).toMatch(/^ctx-canvas-/);
    expect(first?.id).not.toBe(second?.id);
  });
});

describe('createTimelineSelectionContextPacket', () => {
  it('returns null when no clip or range is selected', () => {
    expect(createTimelineSelectionContextPacket([])).toBeNull();
  });

  it('maps selected timeline clips to traceable frame inputs', () => {
    const packet = createTimelineSelectionContextPacket(
      [
        {
          elementId: 'clip-3',
          trackId: 'video-track-1',
          sourceUri: '${PROJECT}/shots/shot-3.mp4',
          mediaType: 'video',
          startMs: 1_000,
          durationMs: 2_000,
          trimStartMs: 300,
          trimEndMs: 100,
          sourceInMs: 300,
          sourceOutMs: 2_300,
          resourceId: 'res-shot-3',
          lineage: { planId: 'plan-1', stageId: 'stage-arrange' },
          summary: 'Shot 3',
        },
      ],
      {
        createdAt: 1_771_718_406_000,
        playheadMs: 1_200,
        activeTrackId: 'video-track-1',
        userAnnotation: 'inspect selected shot',
      },
    );

    expect(packet).toEqual(
      expect.objectContaining({
        id: expect.stringMatching(/^ctx-timeline-[0-9a-f-]{36}$/),
        uiContext: expect.objectContaining({
          activePanel: 'timeline',
          selectionIds: ['sel-timeline-clip-3'],
          timeline: expect.objectContaining({
            playheadMs: 1_200,
            activeTrackId: 'video-track-1',
          }),
        }),
      }),
    );
    expect(packet?.artifactRefs[0]).toEqual(
      expect.objectContaining({
        id: 'artifact-clip-3',
        kind: 'video',
        uri: '${PROJECT}/shots/shot-3.mp4',
      }),
    );
    expect(packet?.perceptionInputs[0]).toEqual(
      expect.objectContaining({
        id: 'input-timeline-clip-3',
        kind: 'video-frame',
        modality: 'image',
        sourceSelectionId: 'sel-timeline-clip-3',
        artifactId: 'artifact-clip-3',
        projectObjectId: 'timeline-clip-clip-3',
        timeMs: 1_200,
        metadata: expect.objectContaining({
          trimStartMs: 300,
          trimEndMs: 100,
          sourceInMs: 300,
          sourceOutMs: 2_300,
          resourceId: 'res-shot-3',
          engineObjectId: 'timeline:video-track-1:clip-3',
          lineage: { planId: 'plan-1', stageId: 'stage-arrange' },
        }),
      }),
    );

    const input = packet?.perceptionInputs[0];
    if (!packet || !input) {
      throw new Error('expected timeline context packet with perception input');
    }
    expect(isPerceptionInputTraceable(packet, input)).toBe(true);
  });

  it('resolves selected timeline elements from project content', () => {
    const packet = createTimelineContextPacketFromEditor({
      content: {
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
                resourceId: 'res-shot-3',
                lineage: { planId: 'plan-1', stageId: 'stage-arrange' },
                startTime: 1,
                duration: 2,
                trimStart: 0.3,
                trimEnd: 0.1,
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
        ],
      },
      selectedElementIds: ['clip-3'],
      selectedTrackId: 'video-track-1',
      currentTime: 1.2,
      createdAt: 1_771_718_407_000,
      userAnnotation: 'inspect selected timeline clip',
    });

    expect(packet?.artifactRefs[0]).toEqual(
      expect.objectContaining({
        id: 'artifact-clip-3',
        kind: 'video',
        uri: '${PROJECT}/shots/shot-3.mp4',
      }),
    );
    expect(packet?.projectRefs[0]).toEqual(
      expect.objectContaining({
        id: 'timeline-clip-clip-3',
        kind: 'timeline-clip',
        artifactIds: ['artifact-clip-3'],
        engineObjectId: 'timeline:video-track-1:clip-3',
        metadata: expect.objectContaining({
          trackId: 'video-track-1',
          startMs: 1_000,
          durationMs: 2_000,
          trimStartMs: 300,
          trimEndMs: 100,
          sourceInMs: 300,
          sourceOutMs: 2_300,
          resourceId: 'res-shot-3',
          lineage: { planId: 'plan-1', stageId: 'stage-arrange' },
          summary: 'Shot 3',
        }),
      }),
    );
    expect(packet?.perceptionInputs[0]).toEqual(
      expect.objectContaining({
        kind: 'video-frame',
        modality: 'image',
        artifactId: 'artifact-clip-3',
        uri: '${PROJECT}/shots/shot-3.mp4',
        timeMs: 1_200,
        metadata: expect.objectContaining({
          trimStartMs: 300,
          trimEndMs: 100,
          sourceInMs: 300,
          sourceOutMs: 2_300,
          resourceId: 'res-shot-3',
          engineObjectId: 'timeline:video-track-1:clip-3',
          lineage: { planId: 'plan-1', stageId: 'stage-arrange' },
        }),
      }),
    );
  });
});
