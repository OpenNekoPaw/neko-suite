/**
 * Dual-flow types smoke tests (P2 W5)
 *
 * Pure-shape types are exercised via their behavioural helpers:
 *   - toTodoStatusCamel / toTodoStatusSnake
 *   - roundSummaryFromDecision
 *   - CREATION_CHANNELS / EXECUTION_CHANNELS (frozen keys)
 *
 * The suite lives under agent/src/workflow/__tests__/ because the root
 * vitest include globs only pick up packages/{agent,platform,extension,
 * cli,cli-tui}/src/**. agent-types is consumed by agent, so keeping the
 * tests here aligns with the consumer side.
 */

import { describe, it, expect } from 'vitest';
import {
  CREATION_CHANNELS,
  EXECUTION_CHANNELS,
  roundSummaryFromDecision,
  toTodoStatusCamel,
  toTodoStatusSnake,
  type StageActivationDecision,
  type TodoList,
  type WorkflowRun,
} from '@neko-agent/types';

describe('TodoStatus bridge helpers', () => {
  it('snake → camel preserves terminal states', () => {
    expect(toTodoStatusCamel('pending')).toBe('pending');
    expect(toTodoStatusCamel('completed')).toBe('completed');
    expect(toTodoStatusCamel('failed')).toBe('failed');
  });

  it('snake → camel converts in_progress', () => {
    expect(toTodoStatusCamel('in_progress')).toBe('inProgress');
  });

  it('camel → snake is the inverse', () => {
    const statuses = ['pending', 'inProgress', 'completed', 'failed'] as const;
    for (const s of statuses) {
      expect(toTodoStatusCamel(toTodoStatusSnake(s))).toBe(s);
    }
  });
});

describe('roundSummaryFromDecision', () => {
  const baseDecision: StageActivationDecision = {
    taskShape: 'multi-step',
    activated: ['specify', 'plan', 'tasks', 'implement'],
    skipped: [{ stage: 'plan', reason: 'task-shape' }],
    decidedAt: 12345,
    round: 2,
  };

  it('copies activated/skipped verbatim and preserves timestamps', () => {
    const summary = roundSummaryFromDecision(baseDecision);
    expect(summary.round).toBe(2);
    expect(summary.activatedStages).toEqual(['specify', 'plan', 'tasks', 'implement']);
    expect(summary.skippedStages).toEqual([{ stage: 'plan', reason: 'task-shape' }]);
    expect(summary.decidedAt).toBe(12345);
    expect(summary.lastObserveHint).toBeUndefined();
  });

  it('attaches an optional observe hint', () => {
    const summary = roundSummaryFromDecision(baseDecision, 'retry');
    expect(summary.lastObserveHint).toBe('retry');
  });
});

describe('Event channel constants', () => {
  it('creation channels are stable namespaced strings', () => {
    for (const value of Object.values(CREATION_CHANNELS)) {
      expect(value.startsWith('creation.')).toBe(true);
    }
  });

  it('execution channels are stable namespaced strings', () => {
    for (const value of Object.values(EXECUTION_CHANNELS)) {
      expect(value.startsWith('execution.')).toBe(true);
    }
  });

  it('creation and execution namespaces do not collide', () => {
    const creation = new Set(Object.values(CREATION_CHANNELS));
    const execution = new Set(Object.values(EXECUTION_CHANNELS));
    const overlap = [...creation].filter((c) => execution.has(c as never));
    expect(overlap).toEqual([]);
  });
});

describe('Structural shapes', () => {
  it('TodoList accepts id + ordered items + timestamps', () => {
    const list: TodoList = {
      id: 'list-1',
      items: [
        { id: 't1', content: 'draft shot 1', status: 'completed' },
        {
          id: 't2',
          content: 'draft shot 2',
          activeForm: 'drafting shot 2',
          status: 'in_progress',
        },
        { id: 't3', content: 'draft shot 3', status: 'pending' },
      ],
      createdAt: 1,
      updatedAt: 10,
    };
    expect(list.items).toHaveLength(3);
    expect(list.items[1].status).toBe('in_progress');
  });

  it('WorkflowRun records rounds + transitions', () => {
    const run: WorkflowRun = {
      id: 'run-1',
      workflowId: 'flow-c',
      status: 'running',
      createdAt: 0,
      startedAt: 1,
      rounds: [
        {
          round: 0,
          activatedStages: ['tasks', 'implement'],
          skippedStages: [],
          decidedAt: 2,
        },
      ],
    };
    expect(run.rounds[0].activatedStages).toContain('implement');
  });
});
