import { describe, expect, it } from 'vitest';
import { createStageTracker } from '../stage-tracker';

describe('StageTracker', () => {
  it('restore replaces current stage and enteredAt without re-emitting events', () => {
    const now = 0;
    const tracker = createStageTracker({ now: () => now });
    const entered: string[] = [];
    tracker.onEntered((event) => entered.push(event.stage));

    tracker.enter('draft');
    entered.length = 0;

    tracker.restore({ current: 'plan', enteredAt: 42 });

    expect(tracker.current).toBe('plan');
    expect(tracker.enteredAt).toBe(42);
    expect(entered).toEqual([]);
  });

  it('restore clears enteredAt when the tracker becomes idle', () => {
    const tracker = createStageTracker({ now: () => 0, initialStage: 'draft' });

    tracker.restore({ current: null });

    expect(tracker.current).toBeNull();
    expect(tracker.enteredAt).toBe(0);
  });
});
