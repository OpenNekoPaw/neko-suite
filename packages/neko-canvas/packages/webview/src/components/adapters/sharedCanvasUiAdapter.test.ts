import { describe, expect, it } from 'vitest';
import type { CanvasNode, CanvasSubsystemManifest } from '@neko/shared';
import {
  mapCanvasNodeLibraryGroupToTreeItems,
  mapCanvasNodePropertyCommit,
  mapCanvasNodeTransformToProperties,
} from './sharedCanvasUiAdapter';
import type { NodeLibraryGroup } from '../panels/NodeLibraryPanel';

describe('sharedCanvasUiAdapter', () => {
  it('maps node transform values to shared PropertyPanel definitions', () => {
    const node = createNode();
    const result = mapCanvasNodeTransformToProperties(node, (key) => key);

    expect(result.groups).toEqual([
      {
        id: 'transform',
        label: 'panel.transform',
        propertyIds: ['position.x', 'position.y', 'size.width', 'size.height', 'rotation'],
      },
    ]);
    expect(result.properties.find((property) => property.id === 'position.x')).toMatchObject({
      kind: 'number',
      value: 10,
    });
    expect(mapCanvasNodePropertyCommit(node, 'size.width', 20)).toEqual({
      size: { width: 50, height: 80 },
    });
    expect(mapCanvasNodePropertyCommit(node, 'rotation', -10)).toEqual({ rotation: 350 });
  });

  it('maps node library groups to TreeView items with creation metadata', () => {
    const group: NodeLibraryGroup = {
      id: 'core',
      label: 'Basic',
      nodeTypes: ['text', 'media'],
    };

    const items = mapCanvasNodeLibraryGroupToTreeItems({
      activeSubsystemIds: [],
      descriptors: {
        text: {
          type: 'text',
          labelKey: 'toolbar.text',
          icon: 'T',
          tagLabel: 'TXT',
          tagColor: '#fff',
          defaultSize: { width: 100, height: 50 },
        },
      },
      group,
    });

    expect(items[0]?.children?.[0]).toMatchObject({
      id: 'text',
      label: 'Text',
      draggable: true,
      disabled: false,
    });
    expect(items[0]?.children?.[1]).toMatchObject({
      id: 'media',
      draggable: false,
      disabled: false,
    });
    expect(items[0]?.children?.[1]?.metadata).toMatchObject({
      kind: 'node-type',
      nodeType: 'media',
    });
  });

  it('marks active subsystem groups with a badge', () => {
    const group: NodeLibraryGroup = {
      id: 'storyboard',
      label: 'Storyboard',
      nodeTypes: ['shot'],
      subsystemId: 'storyboard' as CanvasSubsystemManifest['id'],
    };

    const items = mapCanvasNodeLibraryGroupToTreeItems({
      activeSubsystemIds: ['storyboard'],
      descriptors: {},
      group,
    });

    expect(items[0]?.badges?.[0]?.label).toBe('Active');
  });
});

function createNode(): CanvasNode {
  return {
    id: 'node-1',
    type: 'annotation',
    position: { x: 10, y: 20 },
    size: { width: 120, height: 80 },
    zIndex: 4,
    rotation: 15,
    data: { content: 'Note' },
  } as CanvasNode;
}
