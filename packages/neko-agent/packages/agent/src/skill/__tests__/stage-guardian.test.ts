/**
 * StageGuardian tests (ADR §5.4, §6.5).
 *
 * Covers the two checks shipped in the first PR:
 *   - stage-out-of-order: Apply as the first-ever entered stage
 *   - stage-timeout:       tick detects when a stage stays active too long
 * Plus bookkeeping: disposal, history cap, seeded-current-stage behaviour.
 */

import { describe, it, expect } from 'vitest';
import { createStageTracker } from '../stage-tracker';
import { createStageGuardian, type StageGuardianIssue } from '../stage-guardian';

function collect(): [StageGuardianIssue[], (i: StageGuardianIssue) => void] {
  const issues: StageGuardianIssue[] = [];
  return [issues, (i) => issues.push(i)];
}

describe('StageGuardian', () => {
  describe('stage-out-of-order', () => {
    it('flags apply-first entry', () => {
      const tracker = createStageTracker({ now: () => 0 });
      const guardian = createStageGuardian(tracker, { now: () => 0 });
      const [issues, listener] = collect();
      guardian.onIssue(listener);

      tracker.enter('apply');

      expect(issues).toHaveLength(1);
      expect(issues[0]!.code).toBe('stage-out-of-order');
      expect(issues[0]!.stage).toBe('apply');
      expect(issues[0]).not.toHaveProperty('message');
    });

    it('does not flag apply when draft was already visited', () => {
      const tracker = createStageTracker({ now: () => 0 });
      const guardian = createStageGuardian(tracker, { now: () => 0 });
      const [issues, listener] = collect();
      guardian.onIssue(listener);

      tracker.enter('draft');
      tracker.enter('apply');

      expect(issues.filter((i) => i.code === 'stage-out-of-order')).toHaveLength(0);
    });

    it('does not flag when enforceOrderedEntry=false', () => {
      const tracker = createStageTracker({ now: () => 0 });
      const guardian = createStageGuardian(tracker, {
        now: () => 0,
        enforceOrderedEntry: false,
      });
      const [issues, listener] = collect();
      guardian.onIssue(listener);

      tracker.enter('apply');

      expect(issues).toHaveLength(0);
    });

    it('does not flag when constructed mid-run on an already-Apply tracker', () => {
      // If someone creates a guardian after a run is mid-flight, the current
      // stage counts as visited — we should not retroactively complain.
      const tracker = createStageTracker({ now: () => 0, initialStage: 'apply' });
      const guardian = createStageGuardian(tracker, { now: () => 100 });
      const [issues, listener] = collect();
      guardian.onIssue(listener);

      // No further transitions — nothing should fire.
      expect(issues).toHaveLength(0);
      // A re-entrance (idempotent, no-op) also stays quiet.
      tracker.enter('apply');
      expect(issues).toHaveLength(0);
    });
  });

  describe('stage-timeout', () => {
    it('tick fires timeout once the budget is exceeded', () => {
      let t = 0;
      const tracker = createStageTracker({ now: () => t });
      const guardian = createStageGuardian(tracker, {
        now: () => t,
        stageTimeoutMs: 1000,
      });
      const [issues, listener] = collect();
      guardian.onIssue(listener);

      tracker.enter('draft'); // enteredAt = 0
      t = 500;
      guardian.tick();
      expect(issues.filter((i) => i.code === 'stage-timeout')).toHaveLength(0);

      t = 2000;
      guardian.tick();
      expect(issues.filter((i) => i.code === 'stage-timeout')).toHaveLength(1);
      const issue = issues.find(
        (candidate): candidate is Extract<StageGuardianIssue, { code: 'stage-timeout' }> =>
          candidate.code === 'stage-timeout',
      );
      expect(issue?.stage).toBe('draft');
      expect(issue?.detail.elapsedMs).toBe(2000);
      expect(issue?.detail.budgetMs).toBe(1000);
    });

    it('stage-timeout only fires once per stage entry', () => {
      let t = 0;
      const tracker = createStageTracker({ now: () => t });
      const guardian = createStageGuardian(tracker, {
        now: () => t,
        stageTimeoutMs: 100,
      });
      const [issues, listener] = collect();
      guardian.onIssue(listener);

      tracker.enter('draft');
      t = 500;
      guardian.tick();
      guardian.tick();
      guardian.tick();

      expect(issues.filter((i) => i.code === 'stage-timeout')).toHaveLength(1);
    });

    it('re-entering the same stage after timeout re-arms the check', () => {
      let t = 0;
      const tracker = createStageTracker({ now: () => t });
      const guardian = createStageGuardian(tracker, {
        now: () => t,
        stageTimeoutMs: 100,
      });
      const [issues, listener] = collect();
      guardian.onIssue(listener);

      tracker.enter('draft');
      t = 500;
      guardian.tick();
      expect(issues.filter((i) => i.code === 'stage-timeout')).toHaveLength(1);

      tracker.enter('plan'); // new stage — fresh watch window, enteredAt = 500
      t = 550; // 50ms into plan, well under 100ms budget
      guardian.tick();
      expect(issues.filter((i) => i.code === 'stage-timeout')).toHaveLength(1);

      t = 1000; // now 500ms into plan, over budget
      guardian.tick();
      expect(issues.filter((i) => i.code === 'stage-timeout')).toHaveLength(2);
    });

    it('tick is a no-op when stageTimeoutMs <= 0', () => {
      let t = 0;
      const tracker = createStageTracker({ now: () => t });
      const guardian = createStageGuardian(tracker, { now: () => t });
      // No stageTimeoutMs — timeouts disabled.
      const [issues, listener] = collect();
      guardian.onIssue(listener);
      tracker.enter('draft');
      t = 1_000_000;
      guardian.tick();
      expect(issues).toHaveLength(0);
    });
  });

  describe('bookkeeping', () => {
    it('dispose unsubscribes from tracker and silences listeners', () => {
      const tracker = createStageTracker({ now: () => 0 });
      const guardian = createStageGuardian(tracker, { now: () => 0 });
      const [issues, listener] = collect();
      guardian.onIssue(listener);

      guardian.dispose();

      // After dispose, further tracker transitions must not raise issues.
      tracker.enter('apply');
      expect(issues).toHaveLength(0);
    });

    it('getHistory returns the issues raised so far (bounded)', () => {
      const tracker = createStageTracker({ now: () => 0 });
      const guardian = createStageGuardian(tracker, { now: () => 0 });

      tracker.enter('apply'); // raises out-of-order
      const history = guardian.getHistory();
      expect(history).toHaveLength(1);
      expect(history[0]!.code).toBe('stage-out-of-order');
    });

    it('restore reseeds visited stages after tracker state is rehydrated', () => {
      const tracker = createStageTracker({ now: () => 0 });
      const guardian = createStageGuardian(tracker, { now: () => 0 });
      const [issues, listener] = collect();
      guardian.onIssue(listener);

      tracker.restore({ current: 'plan', enteredAt: 10 });
      guardian.restore({
        current: 'plan',
        enteredAt: 10,
        visitedStages: ['draft', 'plan'],
      });

      tracker.enter('apply');

      expect(issues.filter((i) => i.code === 'stage-out-of-order')).toHaveLength(0);
    });
  });

  describe('approval-skipped', () => {
    it('flags apply without a preceding approval', () => {
      const tracker = createStageTracker({ now: () => 0, initialStage: 'apply' });
      const guardian = createStageGuardian(tracker, { now: () => 0 });
      const [issues, listener] = collect();
      guardian.onIssue(listener);

      guardian.noteApply('tool:generate_image');

      expect(issues).toHaveLength(1);
      const issue = issues[0];
      expect(issue?.code).toBe('approval-skipped');
      if (issue?.code !== 'approval-skipped') {
        throw new Error('Expected approval-skipped issue');
      }
      expect(issue.detail.subject).toBe('tool:generate_image');
      expect(issue.stage).toBe('apply');
    });

    it('does not flag when approval precedes apply for the same subject', () => {
      const tracker = createStageTracker({ now: () => 0, initialStage: 'apply' });
      const guardian = createStageGuardian(tracker, { now: () => 0 });
      const [issues, listener] = collect();
      guardian.onIssue(listener);

      guardian.noteApproval('tool:generate_image');
      guardian.noteApply('tool:generate_image');

      expect(issues.filter((i) => i.code === 'approval-skipped')).toHaveLength(0);
    });

    it('one approval gates one apply — the second apply flags', () => {
      // Each Apply must be preceded by its own Approve. This catches the
      // case where a skill approves once and then performs multiple
      // destructive applies against the same tool.
      const tracker = createStageTracker({ now: () => 0, initialStage: 'apply' });
      const guardian = createStageGuardian(tracker, { now: () => 0 });
      const [issues, listener] = collect();
      guardian.onIssue(listener);

      guardian.noteApproval('tool:generate_image');
      guardian.noteApply('tool:generate_image'); // ok
      guardian.noteApply('tool:generate_image'); // unauthorised

      expect(issues.filter((i) => i.code === 'approval-skipped')).toHaveLength(1);
    });

    it('approvals are per-subject; apply on a different subject still flags', () => {
      const tracker = createStageTracker({ now: () => 0, initialStage: 'apply' });
      const guardian = createStageGuardian(tracker, { now: () => 0 });
      const [issues, listener] = collect();
      guardian.onIssue(listener);

      guardian.noteApproval('tool:generate_image');
      guardian.noteApply('tool:write_file');

      expect(issues.filter((i) => i.code === 'approval-skipped')).toHaveLength(1);
      const issue = issues[0];
      if (issue?.code !== 'approval-skipped') {
        throw new Error('Expected approval-skipped issue');
      }
      expect(issue.detail.subject).toBe('tool:write_file');
    });

    it('opt-out via enforceApprovalGate=false silences the check', () => {
      const tracker = createStageTracker({ now: () => 0, initialStage: 'apply' });
      const guardian = createStageGuardian(tracker, {
        now: () => 0,
        enforceApprovalGate: false,
      });
      const [issues, listener] = collect();
      guardian.onIssue(listener);

      guardian.noteApply('tool:generate_image');

      expect(issues).toEqual([]);
    });

    it('after dispose, noteApproval / noteApply become no-ops', () => {
      const tracker = createStageTracker({ now: () => 0, initialStage: 'apply' });
      const guardian = createStageGuardian(tracker, { now: () => 0 });
      const [issues, listener] = collect();
      guardian.onIssue(listener);

      guardian.dispose();
      guardian.noteApproval('tool:x');
      guardian.noteApply('tool:x');

      expect(issues).toEqual([]);
    });
  });
});
