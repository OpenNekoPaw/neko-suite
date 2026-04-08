import { describe, expect, it, vi } from 'vitest';
import {
  applyStoryboardPayloadToCanvas,
  createStoryboardPayload,
} from '../storyboardPlanner';
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

  it('applies a storyboard payload to canvas via unified helper', async () => {
    const create = vi
      .fn<NekoCanvasAPI['nodes']['create']>()
      .mockResolvedValueOnce('scene-node-1')
      .mockResolvedValueOnce('shot-node-1');
    const update = vi.fn<NekoCanvasAPI['nodes']['update']>().mockResolvedValue(undefined);

    const result = await applyStoryboardPayloadToCanvas(
      {
        nodes: {
          create,
          update,
        },
      } as Pick<NekoCanvasAPI, 'nodes'>,
      createStoryboardPayload(scriptIndex, { scenesLimit: 1 }),
    );

    expect(result).toMatchObject({
      scenesCreated: 1,
      totalShots: 1,
    });
    expect(create).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledWith('scene-node-1', { shotIds: ['shot-node-1'] });
  });
});
