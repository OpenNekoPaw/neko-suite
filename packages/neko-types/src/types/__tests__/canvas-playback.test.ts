import { describe, expect, it } from 'vitest';
import type { CanvasConnection, CanvasData, CanvasNode } from '../canvas';
import {
  createCanvasPlaybackPlan,
  getCanvasPlaybackEdgeOverride,
  getCanvasPlaybackNodeOverride,
  normalizeCanvasPlaybackMetadata,
  sortCanvasPlaybackConnections,
  sortCanvasPlaybackContainerChildren,
} from '../canvas-playback';

function baseNode(
  id: string,
  type: CanvasNode['type'],
  extra: Partial<CanvasNode> = {},
): CanvasNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    size: { width: 200, height: 120 },
    zIndex: 0,
    data: {},
    ...extra,
  } as CanvasNode;
}

function scene(id: string, childIds: readonly string[] = [], sceneNumber = 1): CanvasNode {
  return baseNode(id, 'scene', {
    container: { policy: 'scene', childIds: [...childIds], layout: { mode: 'sequence' } },
    data: { sceneTitle: id, sceneNumber },
  });
}

function shot(id: string, shotNumber: number, parentId?: string): CanvasNode {
  return baseNode(id, 'shot', {
    parentId,
    data: {
      shotNumber,
      duration: 3,
      visualDescription: id,
      characters: [],
      shotScale: 'MS',
      characterAction: '',
      emotion: [],
      sceneTags: [],
      generationStatus: 'idle',
      generationHistory: [],
    },
  });
}

function media(id: string, assetPath: string): CanvasNode {
  return baseNode(id, 'media', {
    data: { assetPath, mediaType: 'video' },
  });
}

function connection(
  id: string,
  sourceId: string,
  targetId: string,
  type: CanvasConnection['type'] = 'sequence',
  extra: Partial<CanvasConnection> = {},
): CanvasConnection {
  return {
    id,
    sourceId,
    sourceAnchor: 'right',
    targetId,
    targetAnchor: 'left',
    type,
    ...extra,
  };
}

function canvas(
  nodes: readonly CanvasNode[],
  connections: readonly CanvasConnection[] = [],
): CanvasData {
  return {
    version: '2.1',
    name: 'Playback Fixture',
    nodes: [...nodes],
    connections: [...connections],
  };
}

describe('canvas playback contracts', () => {
  it('normalizes optional canvas, node, and connection playback metadata', () => {
    const data = canvas([baseNode('a', 'annotation')]);
    data.playback = {
      version: 1,
      adapterId: 'storyboard',
      mode: 'interactive',
      entryIds: ['scene-a'],
      nodeOverrides: { 'scene-a': { role: 'start', order: 2 } },
      edgeOverrides: { edge: { branchLabel: 'Go', order: 1 } },
    };
    data.nodes[0] = {
      ...data.nodes[0]!,
      extension: { playback: { order: 0, expand: 'children' } },
    };
    const edge = connection('edge', 'a', 'b', 'choice', {
      extension: { playback: { enabled: false } },
    });

    const metadata = normalizeCanvasPlaybackMetadata(data);

    expect(metadata).toMatchObject({
      adapterId: 'storyboard',
      mode: 'interactive',
      entryIds: ['scene-a'],
    });
    expect(getCanvasPlaybackNodeOverride(metadata, data.nodes[0]!)).toEqual({
      order: 0,
      expand: 'children',
    });
    expect(getCanvasPlaybackEdgeOverride(metadata, edge)).toMatchObject({
      branchLabel: 'Go',
      order: 1,
      enabled: false,
    });
  });

  it('sorts container children and playable connections deterministically', () => {
    const s = scene('scene', ['b', 'a', 'c']);
    const a = shot('a', 3, 'scene');
    const b = shot('b', 2, 'scene');
    const c = shot('c', 1, 'scene');
    const data = canvas([s, a, b, c]);
    data.playback = {
      version: 1,
      nodeOverrides: { c: { order: 0 } },
      edgeOverrides: { second: { order: 0 } },
    };
    const metadata = normalizeCanvasPlaybackMetadata(data);
    const edges = [
      connection('first', 'a', 'b', 'choice', { priority: 1 }),
      connection('reference', 'a', 'c', 'reference', { priority: -1 }),
      connection('second', 'a', 'c', 'choice', { priority: 5 }),
    ];

    expect(
      sortCanvasPlaybackContainerChildren(s, data.nodes, metadata).map((node) => node.id),
    ).toEqual(['c', 'b', 'a']);
    expect(sortCanvasPlaybackConnections(edges, metadata).map((edge) => edge.id)).toEqual([
      'second',
      'first',
    ]);
  });

  it('projects storyboard scene and shot playback with scene-to-scene continuation', () => {
    const firstScene = scene('scene-a', ['shot-a1', 'shot-a2'], 1);
    const secondScene = scene('scene-b', ['shot-b1'], 2);
    const data = canvas(
      [
        firstScene,
        shot('shot-a1', 1, 'scene-a'),
        shot('shot-a2', 2, 'scene-a'),
        secondScene,
        shot('shot-b1', 1, 'scene-b'),
      ],
      [connection('next-scene', 'scene-a', 'scene-b', 'sequence')],
    );

    const plan = createCanvasPlaybackPlan({ canvas: data, selectedNodeId: 'scene-a' });

    expect(plan.adapterId).toBe('storyboard');
    expect(plan.entryUnitIds).toEqual(['shot-a1']);
    expect(plan.units.map((unit) => unit.id)).toEqual(['shot-a1', 'shot-a2', 'shot-b1']);
    expect(plan.units[0]).toMatchObject({
      durationMs: 3000,
      metadata: expect.objectContaining({
        shotNumber: 1,
        duration: 3,
        visualDescription: 'shot-a1',
        shotScale: 'MS',
      }),
    });
    expect(
      plan.transitions.map((transition) => [transition.sourceUnitId, transition.targetUnitId]),
    ).toEqual([
      ['shot-a1', 'shot-a2'],
      ['shot-a2', 'shot-b1'],
    ]);
  });

  it('supports explicit adapter overrides in mixed graphs', () => {
    const data = canvas([
      scene('scene-a', ['shot-a']),
      shot('shot-a', 1, 'scene-a'),
      baseNode('start', 'narrative-start'),
      baseNode('narrative-scene', 'narrative-scene'),
    ]);

    const autoPlan = createCanvasPlaybackPlan({ canvas: data, selectedNodeId: 'scene-a' });
    const narrativePlan = createCanvasPlaybackPlan({ canvas: data, adapterId: 'narrative' });

    expect(autoPlan.adapterId).toBe('storyboard');
    expect(autoPlan.units.map((unit) => unit.id)).toEqual(['shot-a']);
    expect(narrativePlan.adapterId).toBe('narrative');
    expect(narrativePlan.units.map((unit) => unit.id)).toEqual(['start', 'narrative-scene']);
  });

  it('projects generic containers and node connections without mutating canvas data', () => {
    const group = baseNode('group', 'group', {
      container: {
        policy: 'group',
        childIds: ['note-a', 'note-b'],
        layout: { mode: 'manual' },
      },
      extension: { playback: { expand: 'children' } },
      data: { childIds: ['note-a', 'note-b'] },
    });
    const noteA = baseNode('note-a', 'annotation', {
      parentId: 'group',
      data: { content: 'A' },
    });
    const noteB = baseNode('note-b', 'annotation', {
      parentId: 'group',
      data: { content: 'B' },
    });
    const data = canvas(
      [group, noteA, noteB],
      [connection('branch', 'note-a', 'note-b', 'choice', { choiceText: 'Continue' })],
    );
    const before = JSON.stringify(data);

    const plan = createCanvasPlaybackPlan({
      canvas: data,
      selectedNodeId: 'group',
      adapterId: 'generic',
    });

    expect(plan.units.map((unit) => unit.id)).toEqual(['note-a', 'note-b']);
    expect(plan.transitions).toEqual([
      expect.objectContaining({
        id: 'branch',
        sourceUnitId: 'note-a',
        targetUnitId: 'note-b',
        type: 'choice',
        label: 'Continue',
      }),
    ]);
    expect(JSON.stringify(data)).toBe(before);
  });

  it('keeps narrative runtime boundaries separate from scene and shot nodes', () => {
    const data = canvas([scene('scene-a', ['shot-a']), shot('shot-a', 1, 'scene-a')]);

    const narrativePlan = createCanvasPlaybackPlan({ canvas: data, adapterId: 'narrative' });
    const storyboardPlan = createCanvasPlaybackPlan({ canvas: data });

    expect(narrativePlan.units).toEqual([]);
    expect(narrativePlan.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'playback-narrative-runtime-only',
    );
    expect(storyboardPlan.adapterId).toBe('storyboard');
    expect(storyboardPlan.units.map((unit) => unit.kind)).toEqual(['shot']);
  });

  it('copies durable playback metadata while excluding runtime-only preview resources', () => {
    const data = canvas([
      scene('scene-a', ['shot-a']),
      {
        ...shot('shot-a', 1, 'scene-a'),
        data: {
          ...shot('shot-a', 1, 'scene-a').data,
          visualDescription: 'Durable storyboard summary',
          referenceImagePath: 'assets/ref.png',
          sourceMediaRefs: [
            {
              refId: 'source-panel-1',
              role: 'source',
              locator: { type: 'workspace-path', path: 'assets/source-panel.png' },
              mimeType: 'image/png',
            },
          ],
          runtimeReferenceImagePath: 'blob:runtime-reference',
          generatedImage: 'blob:runtime-image',
          generatedVideoAsset: {
            id: 'video-1',
            path: 'assets/shot-a.mp4',
            runtimeUrl: 'blob:runtime-video',
          },
          generationHistory: [
            {
              id: 'candidate-1',
              dataUrl: 'data:image/png;base64,runtime',
              prompt: 'keep prompt',
              timestamp: 1,
              selected: true,
            },
          ],
        },
      } as CanvasNode,
    ]);

    const plan = createCanvasPlaybackPlan({ canvas: data, selectedNodeId: 'scene-a' });
    const unit = plan.units[0];
    const metadata = unit?.metadata as Record<string, unknown> | undefined;

    expect(unit).toMatchObject({
      id: 'shot-a',
      durationMs: 3000,
    });
    expect(metadata).toMatchObject({
      visualDescription: 'Durable storyboard summary',
      referenceImagePath: 'assets/ref.png',
      sourceMediaRefs: [
        expect.objectContaining({
          refId: 'source-panel-1',
          locator: { type: 'workspace-path', path: 'assets/source-panel.png' },
        }),
      ],
      generatedVideoAsset: expect.objectContaining({ path: 'assets/shot-a.mp4' }),
      generationHistory: [expect.objectContaining({ prompt: 'keep prompt' })],
    });
    expect(JSON.stringify(unit)).not.toContain('blob:runtime');
    expect(JSON.stringify(unit)).not.toContain('data:image/png');
    expect(JSON.stringify(unit)).not.toContain('runtimeReferenceImagePath');
  });

  it('does not persist runtime URLs in media playback units', () => {
    const data = canvas([
      media('media-a', 'assets/a.mp4'),
      {
        ...media('media-b', ''),
        data: {
          assetPath: '',
          mediaType: 'video',
          runtimeAssetPath: 'blob:vscode-runtime-url',
        },
      } as CanvasNode,
    ]);

    const plan = createCanvasPlaybackPlan({ canvas: data, adapterId: 'media-sequence' });

    expect(plan.advancePolicy).toBe('media-ended');
    expect(plan.units.find((unit) => unit.id === 'media-a')).toMatchObject({
      assetPath: 'assets/a.mp4',
    });
    expect(JSON.stringify(plan)).not.toContain('blob:vscode-runtime-url');
    expect(plan.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'playback-missing-media-source',
    );
  });
});
