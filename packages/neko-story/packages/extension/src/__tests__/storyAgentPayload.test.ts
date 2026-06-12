import { describe, expect, it } from 'vitest';
import { buildStoryTableAgentPayload } from '../services/storyAgentPayload';
import type { ScriptIndex } from '../services/types';

const scriptIndex: ScriptIndex = {
  uri: 'file:///project/demo.fountain',
  total_lines: 12,
  scenes: [
    {
      id: 'scene_1',
      sceneId: 'scene_1',
      heading: 'INT. OFFICE - DAY',
      sceneTitle: 'INT. OFFICE - DAY',
      intExt: 'INT',
      timeOfDay: 'DAY',
      location: 'OFFICE',
      time: 'DAY',
      sceneNumber: '1',
      sceneCharacters: ['ALICE'],
      actionSummary: 'Alice studies a wall of monitors.',
      estimatedDuration: 54,
      directives: [],
      line_start: 0,
      line_end: 5,
    },
  ],
  characters: [{ name: 'ALICE', first_line: 3, scene_ids: ['scene_1'] }],
};

describe('buildStoryTableAgentPayload', () => {
  it('leaves storyboard timing and shot-count decisions to Agent', () => {
    const payload = buildStoryTableAgentPayload({
      scriptPath: '/project/demo.fountain',
      sourceScriptUri: scriptIndex.uri,
      scriptIndex,
      workflowIntent: 'storyboard-only',
      intent: 'Plan storyboard.',
    });

    expect(payload).not.toBeNull();
    const selectedText = payload?.data.selectedText;
    expect(selectedText).toContain('"sceneId": "scene_1"');
    expect(selectedText).toContain('"lineRange"');
    expect(selectedText).toContain('"characters"');
    expect(selectedText).not.toContain('estimatedDuration');
    expect(selectedText).not.toContain('recommendedShotCount');

    const serializedData = JSON.stringify(payload?.data);
    expect(serializedData).not.toContain('estimatedDuration');
    expect(serializedData).not.toContain('recommendedShotCount');
  });
});
