import { describe, expect, it } from 'vitest';
import type { CanvasNode } from '@neko/shared';
import {
  createCanvasComposite,
  deriveCanvasNode,
  extractStructuredCanvasContent,
  updateCanvasBlock,
} from './canvasAgentOperations';

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
      { sourceNodeId: 'shot-1', targetPreset: 'shot.legacy' },
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
        containerPreset: 'scene.legacy',
        position: { x: 100, y: 100 },
        children: [
          { preset: 'shot.legacy', data: { visualDescription: 'First beat' } },
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

  it('rejects invalid child presets before returning partial nodes', () => {
    expect(() =>
      createCanvasComposite(
        { nodes: [], connections: [], generateId: ids() },
        {
          containerPreset: 'scene.legacy',
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
        shotIds: ['shot-1'],
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
});
