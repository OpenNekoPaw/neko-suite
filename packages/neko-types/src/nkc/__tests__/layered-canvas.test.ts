import { describe, expect, it } from 'vitest';
import { loadNkc, migrateNkc, validateNkcLayered } from '../index';
import { getContainerChildIds, getNodeParentId } from '../../utils/canvasLayered';
import type {
  CanvasData,
  GroupCanvasNode,
  SceneGroupCanvasNode,
  ShotCanvasNode,
} from '../../types/canvas';

const sceneNode: SceneGroupCanvasNode = {
  id: 'scene-1',
  type: 'scene',
  position: { x: 0, y: 0 },
  size: { width: 640, height: 360 },
  zIndex: 1,
  data: {
    sceneTitle: 'Opening',
    sceneNumber: 1,
    shotIds: ['shot-1', 'shot-2'],
  },
};

const shotOne: ShotCanvasNode = {
  id: 'shot-1',
  type: 'shot',
  position: { x: 40, y: 80 },
  size: { width: 240, height: 160 },
  zIndex: 2,
  data: {
    shotNumber: 1,
    sceneGroupId: 'scene-1',
    duration: 3,
    visualDescription: 'Wide establishing frame',
    characters: [],
    shotScale: 'LS',
    characterAction: '',
    emotion: [],
    sceneTags: [],
    generationStatus: 'idle',
    generationHistory: [],
  },
};

const shotTwo: ShotCanvasNode = {
  ...shotOne,
  id: 'shot-2',
  position: { x: 320, y: 80 },
  data: {
    ...shotOne.data,
    shotNumber: 2,
    sceneGroupId: 'scene-1',
    visualDescription: 'Cut to reaction',
  },
};

const validV1Canvas: CanvasData = {
  version: '1.0',
  name: 'Layered Canvas',
  viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
  nodes: [sceneNode, shotOne, shotTwo],
  connections: [
    {
      id: 'conn-1',
      sourceId: 'shot-1',
      sourceAnchor: 'right',
      targetId: 'shot-2',
      targetAnchor: 'left',
    },
  ],
};

describe('NKC layered migration', () => {
  it('mirrors v1 Scene/Shot organization into v2 optional fields', () => {
    const migration = migrateNkc(validV1Canvas);

    expect(migration.migrated).toBe(true);
    expect(migration.data.version).toBe('2.0');

    const migratedScene = migration.data.nodes.find((node) => node.id === 'scene-1');
    const migratedShot = migration.data.nodes.find((node) => node.id === 'shot-1');

    expect(migratedScene?.container).toEqual(
      expect.objectContaining({
        policy: 'scene',
        childIds: ['shot-1', 'shot-2'],
      }),
    );
    expect(migratedShot?.parentId).toBe('scene-1');

    if (!migratedScene || !migratedShot) {
      throw new Error('expected migrated nodes to exist');
    }

    expect(getContainerChildIds(migratedScene)).toEqual(['shot-1', 'shot-2']);
    expect(getNodeParentId(migratedShot)).toBe('scene-1');
    expect(validateNkcLayered(migration.data).valid).toBe(true);
  });

  it('loads v1 canvases through the migration pipeline', () => {
    const result = loadNkc(JSON.stringify(validV1Canvas));

    expect(result.validation.valid).toBe(true);
    expect(result.migration?.migrated).toBe(true);
    expect(result.data.version).toBe('2.0');
  });

  it('keeps legacy v1 nodes content-free so Webview legacy renderers remain available', () => {
    const result = loadNkc(JSON.stringify(validV1Canvas));
    const scene = result.data.nodes.find((node) => node.id === 'scene-1');
    const shot = result.data.nodes.find((node) => node.id === 'shot-1');

    expect(result.validation.valid).toBe(true);
    expect(scene?.content).toBeUndefined();
    expect(scene?.preset).toBeUndefined();
    expect(shot?.content).toBeUndefined();
    expect(shot?.preset).toBeUndefined();
    expect(scene?.type === 'scene' ? scene.data.shotIds : []).toEqual(['shot-1', 'shot-2']);
    expect(shot?.type === 'shot' ? shot.data.sceneGroupId : undefined).toBe('scene-1');
  });

  it('mirrors legacy group child IDs without removing legacy data', () => {
    const group: GroupCanvasNode = {
      id: 'group-1',
      type: 'group',
      position: { x: 0, y: 0 },
      size: { width: 400, height: 300 },
      zIndex: 1,
      data: {
        childIds: ['shot-1'],
        label: 'References',
      },
    };
    const canvas: CanvasData = {
      ...validV1Canvas,
      nodes: [group, { ...shotOne, data: { ...shotOne.data, sceneGroupId: undefined } }],
    };

    const migration = migrateNkc(canvas);
    const migratedGroup = migration.data.nodes.find((node) => node.id === 'group-1');
    const migratedChild = migration.data.nodes.find((node) => node.id === 'shot-1');

    expect(migratedGroup?.type === 'group' ? migratedGroup.data.childIds : []).toEqual(['shot-1']);
    expect(migratedGroup?.container?.childIds).toEqual(['shot-1']);
    expect(migratedChild?.parentId).toBe('group-1');
  });
});

describe('NKC layered validator', () => {
  it('accepts a valid migrated canvas', () => {
    const migration = migrateNkc(validV1Canvas);
    const result = validateNkcLayered(migration.data);

    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('reports dangling container child IDs', () => {
    const migration = migrateNkc(validV1Canvas);
    const scene = migration.data.nodes.find((node) => node.id === 'scene-1');
    if (scene?.container) {
      scene.container.childIds = [...scene.container.childIds, 'missing-shot'];
    }

    const result = validateNkcLayered(migration.data);

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining('missing child "missing-shot"'),
      }),
    );
  });

  it('reports inconsistent bidirectional membership', () => {
    const migration = migrateNkc(validV1Canvas);
    const shot = migration.data.nodes.find((node) => node.id === 'shot-1');
    if (shot) {
      shot.parentId = 'missing-scene';
    }

    const result = validateNkcLayered(migration.data);

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining('multiple parents'),
      }),
    );
  });

  it('reports container cycles', () => {
    const migration = migrateNkc(validV1Canvas);
    const shot = migration.data.nodes.find((node) => node.id === 'shot-1');
    if (shot) {
      shot.container = { policy: 'group', childIds: ['scene-1'] };
    }

    const result = validateNkcLayered(migration.data);

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining('container cycle detected'),
      }),
    );
  });

  it('reports required field bindings that cannot resolve into node.data', () => {
    const migration = migrateNkc(validV1Canvas);
    const shot = migration.data.nodes.find((node) => node.id === 'shot-1');
    if (shot) {
      shot.content = {
        id: 'root',
        blocks: [
          {
            id: 'missing-field',
            kind: 'text',
            binding: { path: '/missingField', required: true },
          },
        ],
      };
    }

    const result = validateNkcLayered(migration.data);

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        message: expect.stringContaining('required binding path "/missingField"'),
      }),
    );
  });

  it('reports dangling connection endpoints', () => {
    const migration = migrateNkc(validV1Canvas);
    migration.data.connections.push({
      id: 'conn-missing',
      sourceId: 'shot-1',
      sourceAnchor: 'right',
      targetId: 'missing-node',
      targetAnchor: 'left',
    });

    const result = validateNkcLayered(migration.data);

    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({
        field: 'connections[1].targetId',
        message: expect.stringContaining('missing node "missing-node"'),
      }),
    );
  });
});
