import { describe, expect, it, vi } from 'vitest';
import { applyStoryboardPayloadToCanvas, createStoryboardPayload } from '../storyboardPlanner';
import type { NekoCanvasAPI, NekoStoryScriptIndex } from '../../types/extension-api';
import type { StoryScenePlan } from '../../types/storyboard-planner';

const scriptIndex: NekoStoryScriptIndex = {
  uri: 'file:///project/demo.fountain',
  total_lines: 42,
  scenes: [
    {
      id: 'scene_alpha',
      sceneId: 'scene_alpha',
      heading: 'INT. OFFICE - DAY',
      sceneTitle: 'INT. OFFICE - DAY',
      intExt: 'INT',
      timeOfDay: 'DAY',
      location: 'OFFICE',
      time: 'DAY',
      sceneNumber: '1',
      sceneCharacters: ['ALICE', 'BOB'],
      actionSummary: 'Alice studies a wall of monitors.',
      estimatedDuration: 16,
      line_start: 0,
      line_end: 15,
    },
  ],
  characters: [],
};

describe('storyboardPlanner', () => {
  it('creates a mechanical storyboard payload from script index', () => {
    const payload = createStoryboardPayload(scriptIndex);

    expect(payload.mode).toBe('mechanical');
    expect(payload.scenes).toHaveLength(1);
    expect(payload.scenes[0]!.shotPlans.length).toBeGreaterThan(0);
    expect(payload.scenes[0]!.shotPlans[0]).toMatchObject({
      visualDescription: 'Alice studies a wall of monitors.',
      shotScale: 'MS',
    });
  });

  it('uses semantic scene plans when provided', () => {
    const scenePlans: StoryScenePlan[] = [
      {
        sceneId: 'scene_alpha',
        sceneTitle: 'Office Infiltration',
        shotPlans: [
          {
            shotNumber: 10,
            visualDescription: 'Close-up on Alice decoding the monitor wall.',
            duration: 5,
            shotScale: 'CU',
            emotion: ['tense'],
          },
        ],
      },
    ];

    const payload = createStoryboardPayload(scriptIndex, {
      mode: 'semantic',
      scenePlans,
    });

    expect(payload.mode).toBe('semantic');
    expect(payload.scenes[0]).toMatchObject({
      sceneTitle: 'Office Infiltration',
    });
    expect(payload.scenes[0]!.shotPlans[0]).toMatchObject({
      shotNumber: 10,
      visualDescription: 'Close-up on Alice decoding the monitor wall.',
      shotScale: 'CU',
      emotion: ['tense'],
    });
  });

  it('injects character ids from character bindings', () => {
    const payload = createStoryboardPayload(scriptIndex, {
      characterBindings: {
        ALICE: 'char_alice',
        BOB: 'char_bob',
      },
    });

    expect(payload.scenes[0]!.shotPlans[0]!.characters).toEqual([
      { characterId: 'char_alice', characterName: 'ALICE' },
      { characterId: 'char_bob', characterName: 'BOB' },
    ]);
  });

  it('applies a storyboard payload to canvas via unified helper', async () => {
    const createComposite = vi
      .fn<NekoCanvasAPI['nodes']['createComposite']>()
      .mockResolvedValueOnce({
        containerId: 'scene-node-1',
        childIds: ['shot-node-1', 'shot-node-2'],
      });
    const createConnection = vi.fn<NekoCanvasAPI['nodes']['createConnection']>();

    const result = await applyStoryboardPayloadToCanvas(
      {
        nodes: {
          createComposite,
          createConnection,
        },
      } as Pick<NekoCanvasAPI, 'nodes'>,
      createStoryboardPayload(scriptIndex, { scenesLimit: 1 }),
    );

    expect(result).toMatchObject({
      scenesCreated: 1,
      totalShots: 2,
    });
    expect(createComposite).toHaveBeenCalledTimes(1);
    const request = createComposite.mock.calls[0]?.[0];
    expect(request).toBeDefined();
    expect(request).toMatchObject({
      containerType: 'scene',
      position: { x: 100, y: 100 },
      data: expect.objectContaining({ sceneTitle: 'INT. OFFICE - DAY' }),
      autoLayout: false,
      connections: [
        {
          sourceChildIndex: 0,
          sourceAnchor: 'right',
          targetChildIndex: 1,
          targetAnchor: 'left',
          type: 'sequence',
          label: 'next',
          priority: 0,
        },
      ],
    });
    expect(request?.children).toHaveLength(2);
    expect(request?.children.every((child) => child.type === 'shot')).toBe(true);
    expect(createConnection).not.toHaveBeenCalled();
  });

  it('creates scene sequence connections between imported storyboard scenes', async () => {
    const createComposite = vi
      .fn<NekoCanvasAPI['nodes']['createComposite']>()
      .mockResolvedValueOnce({
        containerId: 'scene-node-1',
        childIds: ['shot-node-1'],
      })
      .mockResolvedValueOnce({
        containerId: 'scene-node-2',
        childIds: ['shot-node-2'],
      });
    const createConnection = vi.fn<NekoCanvasAPI['nodes']['createConnection']>();

    await applyStoryboardPayloadToCanvas(
      {
        nodes: {
          createComposite,
          createConnection,
        },
      } as Pick<NekoCanvasAPI, 'nodes'>,
      {
        mode: 'semantic',
        sourceScriptUri: 'agent://storyboard',
        scenes: [
          {
            sceneId: 'scene-1',
            sceneTitle: 'Page 1',
            sceneNumber: 1,
            shotPlans: [
              {
                shotNumber: 1,
                duration: 3,
                visualDescription: 'First page',
                characters: [],
                shotScale: 'MS',
                characterAction: 'Enter',
                emotion: [],
                sceneTags: [],
              },
            ],
          },
          {
            sceneId: 'scene-2',
            sceneTitle: 'Page 2',
            sceneNumber: 2,
            shotPlans: [
              {
                shotNumber: 1,
                duration: 3,
                visualDescription: 'Second page',
                characters: [],
                shotScale: 'MS',
                characterAction: 'React',
                emotion: [],
                sceneTags: [],
              },
            ],
          },
        ],
      },
    );

    expect(createConnection).toHaveBeenCalledTimes(1);
    expect(createConnection).toHaveBeenCalledWith({
      sourceId: 'scene-node-1',
      sourceAnchor: 'right',
      targetId: 'scene-node-2',
      targetAnchor: 'left',
      type: 'sequence',
      label: 'next',
      priority: 0,
    });
  });
});
