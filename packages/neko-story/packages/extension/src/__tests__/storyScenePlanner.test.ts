import { describe, expect, it } from 'vitest';
import type { NekoStoryScriptIndex } from '@neko/shared';
import { buildShotPlansForScene, buildStoryScenePlans } from '../services/storyScenePlanner';

const scriptIndex: NekoStoryScriptIndex = {
  uri: 'file:///demo.fountain',
  total_lines: 40,
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
      estimatedDuration: 24,
      line_start: 0,
      line_end: 15,
    },
  ],
  characters: [],
};

describe('storyScenePlanner', () => {
  it('builds scene plans from script index scenes', () => {
    const plans = buildStoryScenePlans(scriptIndex);

    expect(plans).toHaveLength(1);
    expect(plans[0]).toMatchObject({
      sceneId: 'scene_alpha',
      sceneTitle: 'INT. OFFICE - DAY',
      summary: 'Alice studies a wall of monitors.',
    });
    expect(plans[0]!.shotPlans?.length).toBeGreaterThan(0);
  });

  it('filters scene plans by sceneIds', () => {
    const plans = buildStoryScenePlans(scriptIndex, { sceneIds: ['missing_scene'] });
    expect(plans).toEqual([]);
  });

  it('builds ordered shot plans with scene metadata', () => {
    const shots = buildShotPlansForScene(scriptIndex.scenes[0]!);

    expect(shots[0]).toMatchObject({
      shotNumber: 1,
      shotScale: 'LS',
      sceneTags: ['OFFICE', 'DAY'],
    });
    expect(shots[shots.length - 1]).toMatchObject({
      shotScale: 'CU',
    });
  });

  it('distributes scene duration across shots proportionally', () => {
    const shots = buildShotPlansForScene(scriptIndex.scenes[0]!, 3);

    expect(shots).toHaveLength(3);
    // Edge shots (first/last) get 1.2x weight, middle gets 1.0x
    const totalDuration = shots.reduce((sum, shot) => sum + (shot.duration ?? 0), 0);
    expect(totalDuration).toBeGreaterThanOrEqual(scriptIndex.scenes[0]!.estimatedDuration);
    // First and last should be longer than middle
    expect(shots[0]!.duration).toBeGreaterThanOrEqual(shots[1]!.duration!);
    expect(shots[2]!.duration).toBeGreaterThanOrEqual(shots[1]!.duration!);
  });

  it('uses camera angle and movement constants matching type definitions', () => {
    const shots = buildShotPlansForScene(scriptIndex.scenes[0]!, 3);

    expect(shots[0]!.cameraAngle).toBe('eye-level');
    expect(shots[2]!.cameraMovement).toBe('dolly-in');
  });
});
