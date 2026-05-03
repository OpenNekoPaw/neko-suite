import { describe, expect, it } from 'vitest';
import { createPlanContentBlockFromToolResultData } from '../plan-tool-result-projector';

describe('plan tool result projector', () => {
  it('projects awaiting approval tool results into a plan content block', () => {
    const projection = createPlanContentBlockFromToolResultData(
      {
        planMode: { status: 'awaiting_approval' },
        title: 'Refactor Auth',
        plan: '## Step 1\nDo X\n## Step 2\nDo Y',
        filePath: '/tmp/plan.md',
      },
      { now: () => 123 },
    );

    expect(projection).not.toBeNull();
    expect(projection?.plan).toEqual(
      expect.objectContaining({
        id: 'plan-123',
        title: 'Refactor Auth',
        filePath: '/tmp/plan.md',
      }),
    );
    expect(projection?.plan.steps).toHaveLength(2);
    expect(projection?.contentBlock).toEqual({
      id: 'block-plan-plan-123',
      type: 'plan',
      timestamp: 123,
      plan: projection?.plan,
    });
  });

  it('uses defaults for sparse plan tool result data', () => {
    const projection = createPlanContentBlockFromToolResultData(
      { planMode: { status: 'awaiting_approval' } },
      { now: () => 456, createPlanId: (timestamp) => `custom-${timestamp}` },
    );

    expect(projection?.plan.id).toBe('custom-456');
    expect(projection?.plan.title).toBe('Implementation Plan');
    expect(projection?.plan.filePath).toBe('');
  });

  it('ignores non plan-approval tool result data', () => {
    expect(createPlanContentBlockFromToolResultData(null)).toBeNull();
    expect(createPlanContentBlockFromToolResultData({ planMode: { status: 'done' } })).toBeNull();
  });
});
