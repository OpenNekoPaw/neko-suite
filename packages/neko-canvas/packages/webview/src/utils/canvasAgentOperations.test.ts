import { describe, expect, it } from 'vitest';
import type { CanvasNode } from '@neko/shared';
import { getContainerChildIds, getDefaultCanvasNodePresetName } from '@neko/shared';
import {
  createCanvasComposite,
  deriveCanvasNode,
  extractStructuredCanvasContent,
  updateCanvasBlock,
} from './canvasAgentOperations';
import { buildCanvasNode } from './nodeFactory';
import { hydrateCanvasNodePreview } from './canvasPresetRegistry';

function node(id: string, type: CanvasNode['type'], x = 0, y = 0): CanvasNode {
  return {
    id,
    type,
    position: { x, y },
    size: { width: type === 'shot' ? 220 : 160, height: type === 'shot' ? 200 : 120 },
    zIndex: 1,
    data:
      type === 'shot'
        ? {
            shotNumber: 1,
            duration: 3,
            visualDescription: 'A quiet hallway',
            characters: [],
            shotScale: 'MS',
            characterAction: '',
            emotion: [],
            sceneTags: [],
            generationStatus: 'idle',
            generationHistory: [],
          }
        : { content: id },
  } as CanvasNode;
}

function ids(): () => string {
  let count = 0;
  return () => `generated-${++count}`;
}

describe('canvasAgentOperations', () => {
  it('derives a successor with shared free-placement and a connection', () => {
    const source = node('shot-1', 'shot', 0, 0);
    const occupied = node('occupied', 'shot', 280, 0);

    const result = deriveCanvasNode(
      { nodes: [source, occupied], connections: [], generateId: ids() },
      { sourceNodeId: 'shot-1', targetPreset: 'shot.basic' },
    );

    expect(result.result.nodeId).toBe('generated-1');
    expect(result.result.connectionId).toBe('generated-2');
    expect(result.nodes.find((item) => item.id === 'generated-1')?.position).not.toEqual({
      x: 280,
      y: 0,
    });
    expect(result.connections[0]).toMatchObject({
      sourceId: 'shot-1',
      targetId: 'generated-1',
    });
  });

  it('derives migrated defaults for core node types', () => {
    const source = {
      ...node('shot-1', 'shot', 0, 0),
      preset: 'shot.basic',
      content: { id: 'shot-root', blocks: [] },
    } as CanvasNode;

    const migrated = deriveCanvasNode(
      { nodes: [source], connections: [], generateId: ids() },
      { sourceNodeId: 'shot-1' },
    );
    expect(migrated.result.node?.preset).toBe('shot.basic');
    expect(migrated.result.node?.content).toBeDefined();
    expect(migrated.result.node?.preview).toMatchObject({
      nodeId: 'generated-1',
      role: 'generation-candidate',
    });
  });

  it('rejects unknown derive presets without mutating inputs', () => {
    const source = node('shot-1', 'shot', 0, 0);

    expect(() =>
      deriveCanvasNode(
        { nodes: [source], connections: [], generateId: ids() },
        { sourceNodeId: 'shot-1', targetPreset: 'missing.preset' },
      ),
    ).toThrow(/Unsupported target preset/);
  });

  it('creates composites atomically through container policy validation', () => {
    const result = createCanvasComposite(
      { nodes: [], connections: [], generateId: ids() },
      {
        containerPreset: 'scene.basic',
        position: { x: 100, y: 100 },
        children: [
          { preset: 'shot.basic', data: { visualDescription: 'First beat' } },
          { preset: 'annotation.basic', data: { content: 'note' } },
        ],
      },
    );

    expect(result.result.childIds).toEqual(['generated-2', 'generated-3']);
    expect(result.nodes.find((item) => item.id === 'generated-1')?.container?.childIds).toEqual([
      'generated-2',
      'generated-3',
    ]);
    expect(result.nodes.find((item) => item.id === 'generated-2')?.parentId).toBe('generated-1');
  });

  it('creates migrated Scene composites by default with layer metadata and legacy mirrors', () => {
    expect(getDefaultCanvasNodePresetName('scene')).toBe('scene.basic');
    expect(getDefaultCanvasNodePresetName('shot')).toBe('shot.basic');

    const result = createCanvasComposite(
      { nodes: [], connections: [], generateId: ids() },
      {
        containerType: 'scene',
        position: { x: 100, y: 100 },
        children: [
          { type: 'shot', data: { visualDescription: 'First beat' } },
          { type: 'media', data: { assetPath: 'assets/ref.png', mediaType: 'image' } },
        ],
      },
    );

    const scene = result.nodes.find((item) => item.id === result.result.containerId);
    const shot = result.nodes.find((item) => item.type === 'shot');
    const media = result.nodes.find((item) => item.type === 'media');

    expect(scene?.preset).toBe('scene.basic');
    expect(scene?.content?.childSlots?.[0]?.id).toBe('scene-children');
    expect(scene?.container?.policy).toBe('scene');
    expect(getContainerChildIds(scene as CanvasNode)).toEqual(result.result.childIds);
    expect(shot?.preset).toBe('shot.basic');
    expect(shot?.parentId).toBe(scene?.id);
    expect(media?.preset).toBe('media.basic');
    expect(media?.parentId).toBe(scene?.id);
  });

  it('rejects invalid child presets before returning partial nodes', () => {
    expect(() =>
      createCanvasComposite(
        { nodes: [], connections: [], generateId: ids() },
        {
          containerPreset: 'scene.basic',
          children: [{ preset: 'missing.preset' }],
        },
      ),
    ).toThrow(/Unsupported child preset/);
  });

  it('updates composable block bindings by block id', () => {
    const annotation = {
      ...node('note-1', 'annotation'),
      preset: 'annotation.basic',
      content: {
        id: 'root',
        blocks: [
          {
            id: 'body',
            kind: 'textarea',
            binding: { path: '/content', valueType: 'string' },
          },
        ],
      },
    } as CanvasNode;

    const result = updateCanvasBlock(annotation, {
      nodeId: 'note-1',
      blockId: 'body',
      value: 'updated',
    });

    expect(result.changed).toBe(true);
    expect(result.node.data).toMatchObject({ content: 'updated' });
  });

  it('extracts structured content recursively without preview runtime state', () => {
    const scene = {
      ...node('scene-1', 'scene', 100, 100),
      container: { policy: 'scene', childIds: ['shot-1'] },
      data: {
        sceneTitle: 'Arrival',
        sceneNumber: 1,
        engineToken: 'runtime-token',
      },
    } as unknown as CanvasNode;
    const shot = { ...node('shot-1', 'shot'), parentId: 'scene-1' } as CanvasNode;

    const result = extractStructuredCanvasContent([scene, shot], {
      nodeIds: ['scene-1'],
      includeChildren: true,
      format: 'prompt',
    });

    expect(result.nodeIds).toEqual(['scene-1', 'shot-1']);
    expect(String(result.content)).toContain('Arrival');
    expect(JSON.stringify(result.nodes)).not.toContain('runtime-token');
  });

  it('extracts migrated preview summaries without runtime URLs or player state', () => {
    const shot = hydrateCanvasNodePreview({
      ...buildCanvasNode({
        type: 'shot',
        position: { x: 0, y: 0 },
        zIndex: 1,
        preset: 'shot.basic',
        data: {
          shotNumber: 8,
          visualDescription: 'A selected candidate',
          engineToken: 'engine-runtime-token',
          currentTime: 12.5,
          generationHistory: [
            {
              id: 'candidate-8',
              dataUrl: 'blob:runtime-shot',
              prompt: 'shot prompt',
              timestamp: 1,
              selected: true,
              assetId: 'asset-8',
            },
          ],
        },
      }),
      id: 'shot-8',
    } as CanvasNode);

    const result = extractStructuredCanvasContent([shot], {
      nodeIds: ['shot-8'],
      includeChildren: false,
      format: 'json',
    });

    expect(result.nodes[0]?.preview).toMatchObject({
      title: 'Shot 8',
      role: 'generation-candidate',
      thumbnailVariantId: 'candidate-8',
    });
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('blob:runtime-shot');
    expect(serialized).not.toContain('engine-runtime-token');
    expect(serialized).not.toContain('currentTime');
  });

  it('extracts composable gallery container with binding summaries', () => {
    const galleryContainer = hydrateCanvasNodePreview({
      ...buildCanvasNode({
        type: 'gallery',
        position: { x: 0, y: 0 },
        zIndex: 1,
        preset: 'gallery.basic',
        data: {
          characterName: 'Mika',
          preset: 'character-3view',
          rows: 1,
          cols: 3,
        },
      }),
      id: 'gallery-1',
    } as CanvasNode);
    const result = extractStructuredCanvasContent([galleryContainer], {
      nodeIds: ['gallery-1'],
      includeChildren: false,
      format: 'json',
    });

    const gallerySummary = result.nodes.find((summary) => summary.id === 'gallery-1');
    expect(gallerySummary).toBeDefined();
    expect(gallerySummary?.bindings?.some((binding) => binding.path === '/characterName')).toBe(
      true,
    );
  });
});
