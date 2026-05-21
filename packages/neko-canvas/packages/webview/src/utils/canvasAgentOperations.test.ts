import { describe, expect, it } from 'vitest';
import type { CanvasNode } from '@neko/shared';
import { getContainerChildIds, getDefaultCanvasNodePresetName } from '@neko/shared';
import {
  applyCanvasAgentContent,
  createCanvasComposite,
  createCanvasAgentActiveContext,
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

  it('queries compact active context with stable node and container summaries', () => {
    const scene = {
      ...node('scene-1', 'scene', 100, 100),
      container: { policy: 'scene', childIds: ['shot-1'] },
      data: { sceneTitle: 'Arrival', sceneNumber: 1 },
    } as unknown as CanvasNode;
    const shot = { ...node('shot-1', 'shot'), parentId: 'scene-1' } as CanvasNode;

    const result = createCanvasAgentActiveContext({
      nodes: [scene, shot],
      selectedNodeIds: ['shot-1'],
      viewport: { pan: { x: 10, y: 20 }, zoom: 1.5 },
      insertionPoint: { x: 320, y: 240 },
      request: { includeFocusedContainer: true },
    });

    expect(result.selectedNodeIds).toEqual(['shot-1']);
    expect(result.selectedNodes[0]).toMatchObject({
      id: 'shot-1',
      type: 'shot',
      parentId: 'scene-1',
    });
    expect(result.selectedNodes[0]?.targetableFields?.map((field) => field.path)).toContain(
      '/generationPrompt',
    );
    expect(result.focusedContainer).toMatchObject({
      id: 'scene-1',
      policy: 'scene',
      childIds: ['shot-1'],
    });
    expect(result.focusedContainer?.acceptedChildTypes).toContain('text');
    expect(result.insertionPoint).toEqual({ x: 320, y: 240 });
  });

  it('keeps old active context callers compatible while adding subsystem summaries', () => {
    const scene = node('scene-1', 'scene');
    const choice = node('choice-1', 'choice');
    const state = node('state-1', 'state');

    const result = createCanvasAgentActiveContext({
      nodes: [scene, choice, state],
      selectedNodeIds: ['choice-1', 'missing'],
    });

    expect(result.selectedNodeIds).toEqual(['choice-1']);
    expect(result.selectedNodes).toHaveLength(1);
    expect(result.nodeTypeSummary).toMatchObject({
      scene: 1,
      choice: 1,
      state: 1,
    });
    expect(result.activeSubsystems).toEqual(['storyboard', 'narrative', 'behavior']);
    expect(result.selectedNodeTypes).toEqual(['choice']);
    expect(result.subsystemMetadata).toBeUndefined();
  });

  it('returns bounded subsystem metadata summaries only when requested', () => {
    const variables = Array.from({ length: 60 }, (_, index) => ({
      id: `var-${index}`,
      name: `var${index}`,
      value: index,
    }));
    const blackboard = Array.from({ length: 55 }, (_, index) => ({
      id: `bb-${index}`,
      name: `bb${index}`,
      value: index,
    }));

    const compact = createCanvasAgentActiveContext({
      nodes: [node('choice-1', 'choice')],
      selectedNodeIds: ['choice-1'],
      canvasData: {
        narrative: { entryNodeId: 'choice-1', variables },
      },
    });
    expect(compact.subsystemMetadata).toBeUndefined();

    const detailed = createCanvasAgentActiveContext({
      nodes: [node('choice-1', 'choice'), node('state-1', 'state')],
      selectedNodeIds: ['choice-1'],
      canvasData: {
        narrative: { entryNodeId: 'choice-1', variables },
        behavior: { rootNodeId: 'state-1', blackboard },
        entityGraph: { entityScope: ['character'], bindingSource: 'assets/entities.json' },
        memoryGraph: {
          queryContext: 'scene memories',
          timeRange: { start: '2026-01-01', end: '2026-01-31' },
        },
      },
      request: { includeSubsystemMetadata: true },
    });

    expect(detailed.subsystemMetadata?.narrative).toMatchObject({
      entryNodeId: 'choice-1',
    });
    expect(detailed.subsystemMetadata?.narrative?.variables).toHaveLength(50);
    expect(detailed.subsystemMetadata?.behavior?.blackboard).toHaveLength(50);
    expect(detailed.subsystemMetadata?.entityGraph).toEqual({
      entityScope: ['character'],
      bindingSource: 'assets/entities.json',
    });
    expect(detailed.subsystemMetadata?.memoryGraph?.queryContext).toBe('scene memories');
  });

  it('applies prompt content to a validated Shot field without replacing unrelated data', () => {
    const shot = node('shot-1', 'shot');

    const result = applyCanvasAgentContent(
      { nodes: [shot], connections: [], generateId: ids() },
      {
        kind: 'prompt',
        prompt: 'cinematic rim light',
        target: { nodeId: 'shot-1', fieldPath: '/generationPrompt', mode: 'replace' },
      },
    );

    const nextShot = result.nodes.find((item) => item.id === 'shot-1') as CanvasNode;
    expect(result.result).toMatchObject({ changed: true, mode: 'replace', nodeId: 'shot-1' });
    expect(nextShot.data).toMatchObject({
      visualDescription: 'A quiet hallway',
      generationPrompt: 'cinematic rim light',
    });
  });

  it('inserts Agent text into a container through generic membership actions', () => {
    const scene = {
      ...node('scene-1', 'scene', 100, 100),
      container: { policy: 'scene', childIds: [] },
      data: { sceneTitle: 'Arrival', sceneNumber: 1 },
    } as unknown as CanvasNode;

    const result = applyCanvasAgentContent(
      { nodes: [scene], connections: [], generateId: ids() },
      {
        kind: 'text',
        text: 'Beat note',
        format: 'markdown',
        target: {
          containerId: 'scene-1',
          mode: 'create-child',
          insertionPoint: { x: 160, y: 220 },
        },
      },
    );

    const created = result.nodes.find((item) => item.id === 'generated-1') as CanvasNode;
    const nextScene = result.nodes.find((item) => item.id === 'scene-1') as CanvasNode;
    expect(result.result.createdNodeIds).toEqual(['generated-1']);
    expect(created.type).toBe('text');
    expect(created.parentId).toBe('scene-1');
    expect(created.data).toMatchObject({ content: 'Beat note', format: 'markdown' });
    expect(getContainerChildIds(nextScene)).toEqual(['generated-1']);
  });

  it('rejects invalid Agent content targets atomically', () => {
    const shot = node('shot-1', 'shot');

    expect(() =>
      applyCanvasAgentContent(
        { nodes: [shot], connections: [], generateId: ids() },
        {
          kind: 'text',
          text: 'bad write',
          target: { nodeId: 'shot-1', fieldPath: '/generatedImage', mode: 'replace' },
        },
      ),
    ).toThrow(/not targetable/);
  });

  it('rejects unregistered Agent node operation types before mutation', () => {
    const source = node('shot-1', 'shot');
    const invalidType = 'future-node' as CanvasNode['type'];

    expect(() =>
      deriveCanvasNode(
        { nodes: [source], connections: [], generateId: ids() },
        { sourceNodeId: 'shot-1', targetType: invalidType },
      ),
    ).toThrow(/Unsupported Canvas node type/);

    expect(() =>
      createCanvasComposite(
        { nodes: [], connections: [], generateId: ids() },
        {
          containerType: invalidType,
          children: [],
        },
      ),
    ).toThrow(/Unsupported Canvas node type/);

    expect(() =>
      createCanvasComposite(
        { nodes: [], connections: [], generateId: ids() },
        {
          containerType: 'group',
          children: [{ type: invalidType }],
        },
      ),
    ).toThrow(/Unsupported Canvas node type/);
  });

  it('creates registered subsystem nodes through Agent create defaults', () => {
    const result = createCanvasComposite(
      { nodes: [], connections: [], generateId: ids() },
      {
        containerType: 'group',
        children: [{ type: 'choice', data: { label: 'Branch A' } }],
      },
    );

    const choice = result.nodes.find((item) => item.type === 'choice');
    expect(choice?.data).toMatchObject({
      label: 'Branch A',
      choices: [],
    });
  });
});
