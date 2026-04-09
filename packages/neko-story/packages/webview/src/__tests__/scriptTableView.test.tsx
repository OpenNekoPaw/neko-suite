import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { ScriptTableView } from '../components/ScriptTableView';
import { renderWithI18n } from './setup';
import type { StorySceneState } from '../types';
import type { NekoStoryScriptIndex } from '@neko/shared';

const scriptIndex: NekoStoryScriptIndex = {
  uri: 'file:///project/demo.fountain',
  total_lines: 12,
  scenes: [
    {
      id: 'scene_abc123',
      sceneId: 'scene_abc123',
      heading: 'INT. OFFICE - DAY',
      sceneTitle: 'INT. OFFICE - DAY',
      intExt: 'INT',
      location: 'OFFICE',
      timeOfDay: 'DAY',
      time: 'DAY',
      sceneNumber: '1',
      sceneCharacters: ['ALICE', 'BOB'],
      actionSummary: 'Alice studies a wall of monitors.',
      estimatedDuration: 18,
      line_start: 0,
      line_end: 5,
    },
  ],
  characters: [{ name: 'ALICE', first_line: 3, scene_ids: ['scene_abc123'] }],
};

const sceneStates: Record<string, StorySceneState> = {
  scene_abc123: {
    sceneId: 'scene_abc123',
    agentStatus: 'ready',
    canvasStatus: 'sent',
  },
};

describe('ScriptTableView', () => {
  it('renders upgraded scene-level columns', () => {
    renderWithI18n(<ScriptTableView scriptIndex={scriptIndex} sceneStates={sceneStates} />);

    expect(screen.getByText('Agent Status')).toBeInTheDocument();
    expect(screen.getByText('Canvas Status')).toBeInTheDocument();
    expect(screen.getByText('ALICE, BOB')).toBeInTheDocument();
    expect(screen.getByText('Analysed')).toBeInTheDocument();
  });

  it('dispatches scene actions from action buttons', () => {
    const onSceneAction = vi.fn();

    renderWithI18n(
      <ScriptTableView
        scriptIndex={scriptIndex}
        sceneStates={sceneStates}
        onSceneAction={onSceneAction}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Storyboard' }));
    expect(onSceneAction).toHaveBeenCalledWith('scene_abc123', 'generateStoryboard');
  });
});
