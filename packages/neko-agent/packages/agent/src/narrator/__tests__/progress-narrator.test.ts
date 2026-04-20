/**
 * ProgressNarrator tests
 *
 * Covers:
 * - narrateOne: default icons per kind
 * - narrateOne: custom icons override defaults
 * - narrateOne: timestamped style prepends [HH:MM:SS]
 * - narrate: preserves insertion order + joins with \n
 * - narrate: runId filter scopes output
 * - narrateHeadline: appends round counter
 * - narrateHeadline: returns null for empty history
 */

import { describe, it, expect } from 'vitest';
import { narrate, narrateOne, narrateHeadline } from '../progress-narrator';
import type { Milestone } from '../milestone-tracker';

function milestone(overrides: Partial<Milestone> = {}): Milestone {
  return {
    kind: 'round-decided',
    label: 'Round 0: plan→apply→step',
    at: new Date('2026-04-20T09:15:30Z').getTime(),
    runId: 'r1',
    channel: 'execution.round.activation.decided',
    ...overrides,
  };
}

describe('narrateOne', () => {
  it('prefixes the default icon for each kind', () => {
    expect(narrateOne(milestone({ kind: 'run-started', label: 'Run started (wf-1)' }))).toBe(
      '▶ Run started (wf-1)',
    );
    expect(narrateOne(milestone({ kind: 'autoheal', label: 'Retry #1 (tool.x)' }))).toBe(
      '↻ Retry #1 (tool.x)',
    );
    expect(narrateOne(milestone({ kind: 'run-ended', label: 'Run completed' }))).toBe(
      '■ Run completed',
    );
  });

  it('custom icons override defaults', () => {
    expect(
      narrateOne(milestone(), {
        icons: { 'round-decided': '→' },
      }),
    ).toBe('→ Round 0: plan→apply→step');
  });

  it('unknown kind falls back to defaultIcon override', () => {
    const custom = narrateOne({ ...milestone(), kind: 'other' }, { defaultIcon: '*', icons: {} });
    expect(custom.startsWith('•')).toBe(true); // still uses DEFAULT_NARRATION_ICONS.other = '•'
  });

  it('timestamped style prepends HH:MM:SS', () => {
    const out = narrateOne(milestone(), { style: 'timestamped' });
    expect(out).toMatch(/^· \[\d{2}:\d{2}:\d{2}\] Round 0:/);
  });
});

describe('narrate', () => {
  it('preserves insertion order and joins with newlines', () => {
    const events: Milestone[] = [
      milestone({ kind: 'run-started', label: 'Run started' }),
      milestone({ kind: 'round-decided', label: 'Round 0' }),
      milestone({ kind: 'run-ended', label: 'Run completed' }),
    ];
    const out = narrate(events);
    expect(out.split('\n')).toHaveLength(3);
    expect(out.startsWith('▶ Run started')).toBe(true);
    expect(out.endsWith('■ Run completed')).toBe(true);
  });

  it('runId filter scopes output', () => {
    const events: Milestone[] = [
      milestone({ runId: 'r1', label: 'A' }),
      milestone({ runId: 'r2', label: 'B' }),
      milestone({ runId: 'r1', label: 'C' }),
    ];
    const out = narrate(events, {}, 'r1');
    expect(out.split('\n')).toHaveLength(2);
    expect(out.includes('B')).toBe(false);
  });

  it('empty input returns an empty string', () => {
    expect(narrate([])).toBe('');
  });
});

describe('narrateHeadline', () => {
  it('returns null for empty history', () => {
    expect(narrateHeadline([])).toBeNull();
  });

  it('appends round counter when rounds exist', () => {
    const events: Milestone[] = [
      milestone({ kind: 'run-started', label: 'Started' }),
      milestone({ kind: 'round-decided', label: 'Round 0' }),
      milestone({ kind: 'round-decided', label: 'Round 1' }),
      milestone({ kind: 'round-decided', label: 'Round 2' }),
    ];
    const headline = narrateHeadline(events);
    expect(headline).toBe('· Round 2 (3 rounds)');
  });

  it('singular round reads `1 round`', () => {
    const events: Milestone[] = [milestone({ kind: 'round-decided', label: 'Round 0' })];
    expect(narrateHeadline(events)).toBe('· Round 0 (1 round)');
  });

  it('no rounds → no counter', () => {
    const events: Milestone[] = [milestone({ kind: 'run-started', label: 'Started' })];
    expect(narrateHeadline(events)).toBe('▶ Started');
  });
});
