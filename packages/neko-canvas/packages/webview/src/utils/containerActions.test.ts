import { describe, expect, it } from 'vitest';
import type { CanvasNode } from '@neko/shared';
import {
  addContainerChild,
  createContainerComposite,
  deleteContainerSubtree,
  releaseContainerChildren,
  reorderContainerChildren,
} from './containerActions';
import { autoArrangeContainer, findFreePosition } from './containerLayout';

function createNode(id: string, type: CanvasNode['type'] = 'annotation', x = 0, y = 0): CanvasNode {
  return {
    id,
    type,
    position: { x, y },
    size: { width: 100, height: 80 },
    zIndex: 1,
    data: type === 'group' ? { childIds: [], label: id } : { content: id },
    ...(type === 'group' ? { container: { policy: 'group', childIds: [] } } : {}),
  } as CanvasNode;
}

describe('containerActions', () => {
  it('adds heterogeneous and nested children through generic membership', () => {
    const group = createNode('group-1', 'group');
    const childGroup = createNode('group-2', 'group', 200, 0);
    const note = createNode('note-1', 'annotation', 400, 0);

    let result = addContainerChild([group, childGroup, note], 'group-1', 'group-2');
    result = addContainerChild(result.nodes, 'group-1', 'note-1');

    const nextGroup = result.nodes.find((node) => node.id === 'group-1');
    const nextChildGroup = result.nodes.find((node) => node.id === 'group-2');
    const nextNote = result.nodes.find((node) => node.id === 'note-1');

    expect(nextGroup?.container?.childIds).toEqual(['group-2', 'note-1']);
    expect(nextChildGroup?.parentId).toBe('group-1');
    expect(nextNote?.parentId).toBe('group-1');
  });

  it('rejects container cycles', () => {
    const group = createNode('group-1', 'group');
    const childGroup = createNode('group-2', 'group');
    const linked = addContainerChild([group, childGroup], 'group-1', 'group-2');

    const result = addContainerChild(linked.nodes, 'group-2', 'group-1');

    expect(result.changed).toBe(false);
    expect(result.error).toContain('cycle');
  });

  it('releases children without deleting them', () => {
    const group = createNode('group-1', 'group');
    const note = createNode('note-1', 'annotation');
    const linked = addContainerChild([group, note], 'group-1', 'note-1');

    const result = releaseContainerChildren(linked.nodes, 'group-1');
    const nextGroup = result.nodes.find((node) => node.id === 'group-1');
    const nextNote = result.nodes.find((node) => node.id === 'note-1');

    expect(nextGroup?.container?.childIds).toEqual([]);
    expect(nextNote?.parentId).toBeUndefined();
  });

  it('deletes container subtrees when requested', () => {
    const group = createNode('group-1', 'group');
    const childGroup = createNode('group-2', 'group');
    const note = createNode('note-1', 'annotation');
    let result = addContainerChild([group, childGroup, note], 'group-1', 'group-2');
    result = addContainerChild(result.nodes, 'group-2', 'note-1');

    const deleted = deleteContainerSubtree(result.nodes, 'group-1');

    expect(deleted.nodes).toHaveLength(0);
  });

  it('creates composites atomically', () => {
    const container = createNode('group-1', 'group');
    const note = createNode('note-1', 'annotation');

    const result = createContainerComposite([], { container, children: [note] });

    expect(result.changed).toBe(true);
    expect(result.nodes.find((node) => node.id === 'group-1')?.container?.childIds).toEqual([
      'note-1',
    ]);
    expect(result.nodes.find((node) => node.id === 'note-1')?.parentId).toBe('group-1');
  });

  it('keeps Scene canonical child IDs and legacy mirrors synchronized', () => {
    const scene = {
      id: 'scene-1',
      type: 'scene',
      position: { x: 0, y: 0 },
      size: { width: 400, height: 240 },
      zIndex: 1,
      container: { policy: 'scene' as const, childIds: [] },
      data: { sceneTitle: 'Scene', sceneNumber: 1, shotIds: [] },
    } as CanvasNode;
    const shot = {
      id: 'shot-1',
      type: 'shot',
      position: { x: 20, y: 60 },
      size: { width: 220, height: 200 },
      zIndex: 2,
      data: {
        shotNumber: 1,
        duration: 3,
        visualDescription: '',
        characters: [],
        shotScale: 'MS',
        characterAction: '',
        emotion: [],
        sceneTags: [],
        generationStatus: 'idle',
        generationHistory: [],
      },
    } as CanvasNode;

    const linked = addContainerChild([scene, shot], 'scene-1', 'shot-1');
    const nextScene = linked.nodes.find((node) => node.id === 'scene-1');
    const nextShot = linked.nodes.find((node) => node.id === 'shot-1');

    expect(nextScene?.container?.childIds).toEqual(['shot-1']);
    expect(nextScene?.type === 'scene' ? nextScene.data.shotIds : []).toEqual(['shot-1']);
    expect(nextShot?.parentId).toBe('scene-1');
    expect(nextShot?.type === 'shot' ? nextShot.data.sceneGroupId : undefined).toBe('scene-1');
  });

  it('excludes missing Scene children from the legacy shotIds mirror when nodes are available', () => {
    const scene = {
      id: 'scene-1',
      type: 'scene',
      position: { x: 0, y: 0 },
      size: { width: 400, height: 240 },
      zIndex: 1,
      container: { policy: 'scene' as const, childIds: ['shot-1', 'missing-shot', 'note-1'] },
      data: { sceneTitle: 'Scene', sceneNumber: 1, shotIds: ['shot-1', 'missing-shot'] },
    } as CanvasNode;
    const shot = {
      ...createNode('shot-1', 'shot'),
      data: {
        shotNumber: 1,
        duration: 3,
        visualDescription: '',
        characters: [],
        shotScale: 'MS',
        characterAction: '',
        emotion: [],
        sceneTags: [],
        generationStatus: 'idle',
        generationHistory: [],
      },
    } as CanvasNode;
    const note = createNode('note-1', 'annotation');

    const result = reorderContainerChildren([scene, shot, note], 'scene-1', [
      'shot-1',
      'missing-shot',
      'note-1',
    ]);
    const nextScene = result.nodes.find((node) => node.id === 'scene-1');

    expect(nextScene?.type === 'scene' ? nextScene.data.shotIds : []).toEqual(['shot-1']);
  });

  it('rejects duplicate IDs within composite input', () => {
    const container = createNode('group-1', 'group');
    const note = createNode('group-1', 'annotation');

    const result = createContainerComposite([], { container, children: [note] });

    expect(result.changed).toBe(false);
    expect(result.error).toContain('duplicate node id');
    expect(result.nodes).toEqual([]);
  });
});

describe('containerLayout', () => {
  it('finds a free position when the preferred slot overlaps', () => {
    const occupied = createNode('occupied', 'annotation', 0, 0);

    const position = findFreePosition({
      preferred: { x: 0, y: 0 },
      size: { width: 100, height: 80 },
      nodes: [occupied],
      gap: 10,
    });

    expect(position).not.toEqual({ x: 0, y: 0 });
  });

  it('auto-arranges children with absolute positions', () => {
    const group: CanvasNode = {
      ...createNode('group-1', 'group', 100, 100),
      size: { width: 400, height: 320 },
      container: { policy: 'group', childIds: ['a', 'b'] },
      data: { childIds: ['a', 'b'], label: 'Group' },
    } as CanvasNode;
    const a = createNode('a', 'annotation', 0, 0);
    const b = createNode('b', 'annotation', 0, 0);

    const arranged = autoArrangeContainer([group, a, b], {
      containerId: 'group-1',
      mode: 'grid',
      paddingX: 20,
      paddingTop: 40,
    });

    expect(arranged.find((node) => node.id === 'a')?.position).toEqual({ x: 120, y: 140 });
    expect(arranged.find((node) => node.id === 'b')?.position.x).toBeGreaterThan(120);
  });
});
