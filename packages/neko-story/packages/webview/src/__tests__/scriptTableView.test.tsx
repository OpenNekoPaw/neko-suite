import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { ScriptTableView } from '../components/ScriptTableView';
import { renderWithI18n } from './setup';
import type { NekoStoryScriptIndex, StorySceneVideoReadiness } from '@neko/shared';

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

const multiSceneIndex: NekoStoryScriptIndex = {
  ...scriptIndex,
  total_lines: 24,
  scenes: [
    scriptIndex.scenes[0]!,
    {
      id: 'scene_def456',
      sceneId: 'scene_def456',
      heading: 'EXT. SCHOOL - DAY',
      sceneTitle: 'EXT. SCHOOL - DAY',
      intExt: 'EXT',
      location: 'SCHOOL',
      timeOfDay: 'DAY',
      time: 'DAY',
      sceneNumber: '2',
      sceneCharacters: ['BOB'],
      actionSummary: 'Bob waits at the school gate.',
      estimatedDuration: 12,
      line_start: 6,
      line_end: 11,
    },
  ],
};

function renderTable(props: Partial<React.ComponentProps<typeof ScriptTableView>> = {}) {
  return renderWithI18n(<ScriptTableView scriptIndex={scriptIndex} {...props} />);
}

describe('ScriptTableView', () => {
  it('renders the storyboard table as a whole-table input preview', () => {
    const { container } = renderTable();

    expect(screen.getByRole('heading', { name: 'Breakdown' })).toBeInTheDocument();
    expect(
      screen.queryByText('Whole-table input preview for the current screenplay structure'),
    ).not.toBeInTheDocument();
    const headers = screen.getAllByRole('columnheader').map((header) => header.textContent);
    expect(headers).toEqual(['#', 'Scene', 'Characters']);
    expect(container.querySelector('.story-table-heading')).toBeTruthy();
    expect(container.querySelector('.story-table-heading')).not.toHaveClass(
      'story-table-column-heading',
    );
    expect(screen.getAllByRole('columnheader')[0]).toHaveClass('story-table-column-heading');
    expect(container.querySelector('.story-table-toolbar')?.children).toHaveLength(2);
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByText('Progress / Issues')).not.toBeInTheDocument();
    expect(screen.queryByText('Status')).not.toBeInTheDocument();
    expect(screen.queryByText('Duration')).not.toBeInTheDocument();
    expect(screen.queryByText('Processing')).not.toBeInTheDocument();
    expect(screen.queryByText('18s')).not.toBeInTheDocument();

    expect(screen.getByText('INT. OFFICE - DAY')).toBeInTheDocument();
    expect(screen.getByText('Alice studies a wall of monitors.')).toBeInTheDocument();
    expect(screen.getByText('ALICE')).toBeInTheDocument();
    expect(screen.getByText('BOB')).toBeInTheDocument();
  });

  it('keeps only table-level workflow actions as the primary controls', () => {
    const { container } = renderTable();

    const action = screen.getByRole('button', { name: 'Analyze Table' });
    expect(action).toBeInTheDocument();
    expect(action.closest('.story-table-actions')).toBeTruthy();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(container.querySelector('.story-table-metrics')?.textContent).toContain('1 scenes');
    expect(container.querySelector('.story-table-toolbar')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Sync to Canvas' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Start Video Generation' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'More' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
    expect(screen.queryByText('All scenes')).not.toBeInTheDocument();
    expect(screen.queryByText('0/1 done')).not.toBeInTheDocument();
    expect(screen.queryByText(/Est\. total/)).not.toBeInTheDocument();
  });

  it('does not surface processing failures as row status UI', () => {
    const readinessRows: StorySceneVideoReadiness[] = [
      {
        sceneId: 'scene_abc123',
        sourceScriptUri: scriptIndex.uri,
        sceneTitle: 'INT. OFFICE - DAY',
        estimatedDuration: 18,
        characters: [],
        missingInputs: [],
        readinessStatus: 'failed',
        creatorStatus: 'failed',
        allowedActions: ['retryFailed'],
      },
    ];

    renderTable({ readinessRows });

    expect(screen.queryByText('Generation failed')).not.toBeInTheDocument();
    expect(screen.queryByText('Needs Attention')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'More' })).not.toBeInTheDocument();
  });

  it('dispatches full-table handoff only to Agent', () => {
    const onTableAction = vi.fn();
    renderTable({ onTableAction });

    fireEvent.click(screen.getByRole('button', { name: 'Analyze Table' }));
    expect(onTableAction).toHaveBeenCalledWith('sendToAgentAll', {
      sceneIds: ['scene_abc123'],
    });
    expect(onTableAction).toHaveBeenCalledTimes(1);
  });

  it('always dispatches the current whole table regardless of previous processing state', () => {
    const onTableAction = vi.fn();
    renderTable({
      scriptIndex: multiSceneIndex,
      onTableAction,
    });

    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.queryByText('1 selected')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Analyze Table' }));
    expect(onTableAction).toHaveBeenCalledWith('sendToAgentAll', {
      sceneIds: ['scene_abc123', 'scene_def456'],
    });
    expect(
      screen.queryByRole('button', { name: 'Send Selected to Agent' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Send Selected to Canvas' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start Selected' })).not.toBeInTheDocument();
  });

  it('keeps asset readiness and missing-input fields out of the table body', () => {
    const readinessRows: StorySceneVideoReadiness[] = [
      {
        sceneId: 'scene_abc123',
        sourceScriptUri: scriptIndex.uri,
        sceneTitle: 'INT. OFFICE - DAY',
        estimatedDuration: 18,
        characters: [
          {
            name: 'ALICE',
            characterId: 'char-alice',
            matchSource: 'dialogue-character',
            status: 'bound',
            thumbnailUri: 'vscode-webview://thumb/alice.png',
          },
          {
            name: 'BOB',
            matchSource: 'dialogue-character',
            status: 'missing',
            missingReason: 'No usable character visual is available',
            missingReasonKey: 'table.character.missingReason.missingVisual',
          },
        ],
        missingInputs: [
          {
            kind: 'character-visual',
            label: 'BOB is missing a character visual',
            labelKey: 'table.missingInput.characterVisual',
            labelParams: { name: 'BOB' },
            severity: 'blocking',
            characterName: 'BOB',
          },
          {
            kind: 'location',
            label: 'Scene location is missing',
            labelKey: 'table.missingInput.location',
            severity: 'warning',
          },
        ],
        readinessStatus: 'needs-input',
        creatorStatus: 'attention',
        allowedActions: ['analyze', 'toggleSkip'],
      },
    ];

    const { container } = renderTable({ readinessRows });

    expect(screen.queryByText('BOB is missing a character visual')).not.toBeInTheDocument();
    expect(screen.queryByText('Scene location is missing')).not.toBeInTheDocument();
    expect(screen.queryByText('Needs Attention')).not.toBeInTheDocument();
    expect(screen.queryByText('Missing visual')).not.toBeInTheDocument();
    expect(container.querySelector('img[src="vscode-webview://thumb/alice.png"]')).toBeTruthy();
    expect(container.querySelector('[data-character-visual-status]')).toBeFalsy();
    expect(screen.queryByRole('button', { name: 'More' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Analyse' })).not.toBeInTheDocument();
  });

  it('renders empty character states explicitly', () => {
    const emptyCharacterIndex: NekoStoryScriptIndex = {
      ...scriptIndex,
      scenes: [{ ...scriptIndex.scenes[0]!, sceneCharacters: [] }],
      characters: [],
    };

    const { container } = renderTable({ scriptIndex: emptyCharacterIndex });

    expect(container.textContent).toContain('—');
  });

  it('does not render Canvas summaries in the Story table', () => {
    const readinessRows: StorySceneVideoReadiness[] = [
      {
        sceneId: 'scene_abc123',
        sourceScriptUri: scriptIndex.uri,
        sceneTitle: 'INT. OFFICE - DAY',
        estimatedDuration: 18,
        recommendedShotCount: 3,
        characters: [],
        missingInputs: [],
        readinessStatus: 'ready',
        creatorStatus: 'processing',
        allowedActions: ['openCanvas', 'toggleSkip'],
        canvasSummary: {
          sourceScriptUri: scriptIndex.uri,
          sceneId: 'scene_abc123',
          sceneNodeId: 'scene-node-1',
          shotCount: 2,
          generatedShotCount: 1,
          failedShotCount: 0,
          status: 'partial',
          shots: [],
        },
      },
    ];

    renderTable({ readinessRows });

    expect(screen.queryByText('Canvas 1/2')).not.toBeInTheDocument();
    expect(screen.queryByText('3 planned shots')).not.toBeInTheDocument();
  });

  it('does not surface heuristic planned shot counts without Canvas summary', () => {
    const readinessRows: StorySceneVideoReadiness[] = [
      {
        sceneId: 'scene_abc123',
        sourceScriptUri: scriptIndex.uri,
        sceneTitle: 'INT. OFFICE - DAY',
        estimatedDuration: 18,
        recommendedShotCount: 3,
        characters: [],
        missingInputs: [],
        readinessStatus: 'ready',
        creatorStatus: 'pending',
        allowedActions: ['startVideoCreation', 'toggleSkip'],
      },
    ];

    renderTable({ readinessRows });

    expect(screen.queryByText('3 planned shots')).not.toBeInTheDocument();
  });

  it('keeps skipped processing state out of the Story table', () => {
    const readinessRows: StorySceneVideoReadiness[] = [
      {
        sceneId: 'scene_abc123',
        sourceScriptUri: scriptIndex.uri,
        sceneTitle: 'INT. OFFICE - DAY',
        estimatedDuration: 18,
        characters: [],
        missingInputs: [],
        readinessStatus: 'skipped',
        creatorStatus: 'skipped',
        allowedActions: ['toggleSkip'],
      },
    ];

    renderTable({ readinessRows });

    expect(screen.queryByText('Skipped')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'More' })).not.toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Unskip' })).not.toBeInTheDocument();
  });

  it('keeps character badges navigable without exposing character-level send actions', () => {
    const onCharacterNavigate = vi.fn();
    const readinessRows: StorySceneVideoReadiness[] = [
      {
        sceneId: 'scene_abc123',
        sourceScriptUri: scriptIndex.uri,
        sceneTitle: 'INT. OFFICE - DAY',
        estimatedDuration: 18,
        characters: [
          {
            name: 'ALICE',
            characterId: 'char-alice',
            matchSource: 'dialogue-character',
            status: 'bound',
          },
        ],
        missingInputs: [],
        readinessStatus: 'ready',
        creatorStatus: 'pending',
        allowedActions: ['startVideoCreation', 'toggleSkip'],
      },
    ];

    renderTable({ readinessRows, onCharacterNavigate });

    fireEvent.click(screen.getByText('ALICE'));
    expect(onCharacterNavigate).toHaveBeenCalledWith('ALICE', 'scene_abc123', 'char-alice');
    expect(screen.queryByTitle('Send to Agent')).not.toBeInTheDocument();
  });
});
