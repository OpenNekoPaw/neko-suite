import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { ScriptTableView } from '../components/ScriptTableView';
import { renderWithI18n } from './setup';
import type { StorySceneState } from '../types';
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

const pendingState: StorySceneState = {
  sceneId: 'scene_abc123',
  agentStatus: 'not-requested',
  canvasStatus: 'not-sent',
};

function renderTable(props: Partial<React.ComponentProps<typeof ScriptTableView>> = {}) {
  return renderWithI18n(
    <ScriptTableView
      scriptIndex={scriptIndex}
      sceneStates={{ scene_abc123: pendingState }}
      {...props}
    />,
  );
}

describe('ScriptTableView', () => {
  it('renders the storyboard table without a separate progress/issues or status column', () => {
    renderTable({
      sceneStates: {
        scene_abc123: {
          sceneId: 'scene_abc123',
          agentStatus: 'ready',
          canvasStatus: 'sent',
        },
      },
    });

    const table = screen.getByRole('table');
    const headers = within(table)
      .getAllByRole('columnheader')
      .map((header) => header.textContent);
    expect(headers).toEqual(['', '#', 'Scene', 'Characters']);
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

  it('keeps table-level workflow actions as the primary controls', () => {
    renderTable();

    expect(screen.getByRole('button', { name: 'Send Table to Agent' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sync to Canvas' })).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Start Video Generation' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start' })).not.toBeInTheDocument();
    expect(screen.getByText('All scenes')).toBeInTheDocument();
    expect(screen.queryByText('0/1 done')).not.toBeInTheDocument();
    expect(screen.queryByText(/Est\. total/)).not.toBeInTheDocument();
  });

  it('keeps row actions as a compact recovery menu', () => {
    const onSceneAction = vi.fn();
    renderTable({
      sceneStates: {
        scene_abc123: {
          sceneId: 'scene_abc123',
          agentStatus: 'ready',
          canvasStatus: 'sent',
        },
      },
      onSceneAction,
    });

    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Storyboard' }));
    expect(onSceneAction).toHaveBeenCalledWith('scene_abc123', 'generateStoryboard');
  });

  it('shows blocking failure details inline without a row status badge', () => {
    renderTable({
      sceneStates: {
        scene_abc123: {
          sceneId: 'scene_abc123',
          agentStatus: 'failed',
          canvasStatus: 'not-sent',
        },
      },
    });

    expect(screen.getByText('Generation failed')).toBeInTheDocument();
    expect(screen.queryByText('Needs Attention')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(screen.getByRole('menuitem', { name: 'Retry' })).toBeInTheDocument();
  });

  it('dispatches full-table handoff only to Agent', () => {
    const onSceneAction = vi.fn();
    const onTableAction = vi.fn();
    renderTable({ onSceneAction, onTableAction });

    fireEvent.click(screen.getByRole('button', { name: 'Send Table to Agent' }));
    expect(onTableAction).toHaveBeenCalledWith('sendToAgentAll', {
      sceneIds: ['scene_abc123'],
    });
    expect(onSceneAction).not.toHaveBeenCalled();
    expect(onTableAction).toHaveBeenCalledTimes(1);
  });

  it('allows selected-scene handoff to Agent regardless of previous processing state', () => {
    const onTableAction = vi.fn();
    renderTable({
      scriptIndex: multiSceneIndex,
      sceneStates: {
        scene_abc123: pendingState,
        scene_def456: {
          sceneId: 'scene_def456',
          agentStatus: 'sent',
          canvasStatus: 'opened',
        },
      },
      onTableAction,
    });

    fireEvent.click(screen.getByRole('checkbox', { name: 'Select #2' }));
    expect(screen.getByText('1 selected')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Send Selected to Agent' }));
    expect(onTableAction).toHaveBeenCalledWith('sendToAgentAll', {
      sceneIds: ['scene_def456'],
    });
    expect(
      screen.queryByRole('button', { name: 'Send Selected to Canvas' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Start Selected' })).not.toBeInTheDocument();
  });

  it('renders readiness character visual states and missing input indicators', () => {
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
        ],
        readinessStatus: 'needs-input',
        creatorStatus: 'attention',
        allowedActions: ['analyze', 'toggleSkip'],
      },
    ];

    const { container } = renderTable({ readinessRows });

    expect(screen.getByText('BOB is missing a character visual')).toBeInTheDocument();
    expect(screen.queryByText('Needs Attention')).not.toBeInTheDocument();
    expect(screen.getByText('Missing visual')).toBeInTheDocument();
    expect(container.querySelector('img[src="vscode-webview://thumb/alice.png"]')).toBeTruthy();
    expect(container.querySelector('[data-character-visual-status="missing"]')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(screen.getByRole('menuitem', { name: 'Analyse' })).toBeInTheDocument();
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

  it('renders Canvas summaries inline in the scene cell', () => {
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

    expect(screen.getByText('Canvas 1/2')).toBeInTheDocument();
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

  it('keeps skipped rows visible as a lightweight issue with restore action', () => {
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

    renderTable({
      sceneStates: {
        scene_abc123: {
          sceneId: 'scene_abc123',
          agentStatus: 'skipped',
          canvasStatus: 'skipped',
        },
      },
      readinessRows,
    });

    expect(screen.getByText('Skipped')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'More' }));
    expect(screen.getByRole('menuitem', { name: 'Unskip' })).toBeInTheDocument();
  });

  it('dispatches character actions with scene and character identifiers when readiness exists', () => {
    const onCharacterSendToAgent = vi.fn();
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

    renderTable({ readinessRows, onCharacterSendToAgent });

    fireEvent.click(screen.getByTitle('Send to Agent'));
    expect(onCharacterSendToAgent).toHaveBeenCalledWith('ALICE', 'scene_abc123', 'char-alice');
  });
});
