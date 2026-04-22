import { describe, it, expect } from 'vitest';
import type { ExecutionPlan } from '@neko-agent/types';
import { serializeExecutionPlan } from '../plan-markdown';

function make(overrides: Partial<ExecutionPlan> = {}): ExecutionPlan {
  return {
    id: 'cut-tiktok-001-plan',
    proposalId: 'cut-tiktok-001',
    title: 'TikTok 15s hero cut — plan',
    status: 'ready',
    createdAt: Date.UTC(2026, 3, 22, 10, 0, 0),
    updatedAt: Date.UTC(2026, 3, 22, 10, 30, 0),
    steps: [
      {
        id: 's1',
        tool: 'GenerateImage',
        rationale: 'Hero frame — warm golden hour.',
        args: 'prompt: hero on rooftop\nstyle: cinematic',
      },
    ],
    ...overrides,
  };
}

describe('serializeExecutionPlan', () => {
  it('writes canonical frontmatter + lineage back to proposal', () => {
    const md = serializeExecutionPlan(make());
    expect(md).toContain('id: cut-tiktok-001-plan');
    expect(md).toContain('kind: execution-plan');
    expect(md).toContain('proposalId: cut-tiktok-001');
    expect(md).toContain('status: ready');
    expect(md).toContain('> Compiled from proposal `cut-tiktok-001`.');
  });

  it('numbers steps starting at 1 with status label + tool + rationale + args fence', () => {
    const md = serializeExecutionPlan(make());
    expect(md).toMatch(/### 1\. \[pending\] GenerateImage/);
    expect(md).toContain('Hero frame — warm golden hour.');
    expect(md).toMatch(/```yaml\nprompt: hero on rooftop\nstyle: cinematic\n```/);
  });

  it('passes through step statuses (completed / in_progress / failed)', () => {
    const md = serializeExecutionPlan(
      make({
        steps: [
          { id: 's1', tool: 'GenerateImage', rationale: 'r', args: 'a', status: 'completed' },
          {
            id: 's2',
            tool: 'AddTimelineElement',
            rationale: 'r',
            args: 'a',
            status: 'in_progress',
          },
          { id: 's3', tool: 'Export', rationale: 'r', args: 'a', status: 'failed', error: 'OOM' },
        ],
      }),
    );
    expect(md).toContain('### 1. [completed] GenerateImage');
    expect(md).toContain('### 2. [in progress] AddTimelineElement');
    expect(md).toContain('### 3. [failed] Export');
    expect(md).toContain('_error: OOM_');
  });

  it('empty step list renders placeholder', () => {
    const md = serializeExecutionPlan(make({ steps: [] }));
    expect(md).toContain('_No steps._');
  });

  it('notes section is omitted when blank, rendered when present', () => {
    expect(serializeExecutionPlan(make())).not.toContain('## Notes');
    const withNotes = serializeExecutionPlan(make({ notes: 'Observe 4K render budget.' }));
    expect(withNotes).toContain('## Notes');
    expect(withNotes).toContain('Observe 4K render budget.');
  });

  it('step order is preserved', () => {
    const md = serializeExecutionPlan(
      make({
        steps: [
          { id: 's1', tool: 'First', rationale: '', args: '' },
          { id: 's2', tool: 'Second', rationale: '', args: '' },
          { id: 's3', tool: 'Third', rationale: '', args: '' },
        ],
      }),
    );
    const i1 = md.indexOf('1. [pending] First');
    const i2 = md.indexOf('2. [pending] Second');
    const i3 = md.indexOf('3. [pending] Third');
    expect(i1).toBeGreaterThan(0);
    expect(i2).toBeGreaterThan(i1);
    expect(i3).toBeGreaterThan(i2);
  });
});
