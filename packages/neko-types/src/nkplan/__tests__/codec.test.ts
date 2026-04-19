/**
 * NKPLAN format SDK — codec + validator + migrator tests.
 */

import { describe, expect, it } from 'vitest';
import {
  CURRENT_NKPLAN_VERSION,
  isValidNkplan,
  loadNkplan,
  saveNkplan,
  validateNkplan,
  detectNkplanVersion,
  migrateNkplan,
  type NkPlan,
} from '../index';

function goodPlan(overrides: Partial<NkPlan> = {}): NkPlan {
  return {
    version: '1.0',
    id: 'plan_test',
    createdAt: 1000,
    updatedAt: 1000,
    status: 'pending',
    statusHistory: [{ status: 'pending', at: 1000 }],
    route: {
      level: 'L2',
      flowId: 'flowE',
      entryExtension: 'story',
      skipStages: ['readDocument'],
      reason: 'fixture',
      confidence: 0.9,
      provenance: 'rules',
    },
    stages: [
      { id: 'parseStoryboard', label: 'Parse storyboard', skipped: false },
      { id: 'batchGenerate', label: 'Batch generate', skipped: false, userCheckpoint: true },
    ],
    ...overrides,
  };
}

// =============================================================================
// validator
// =============================================================================

describe('validateNkplan', () => {
  it('accepts a minimal good plan', () => {
    const res = validateNkplan(goodPlan());
    expect(res.valid).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  it('flags missing root', () => {
    const res = validateNkplan(null);
    expect(res.valid).toBe(false);
    expect(res.errors[0]?.field).toBe('');
  });

  it('flags missing version', () => {
    const { version: _drop, ...rest } = goodPlan();
    const res = validateNkplan(rest);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.field === 'version')).toBe(true);
  });

  it('flags invalid status', () => {
    const res = validateNkplan({ ...goodPlan(), status: 'bogus' });
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.field === 'status')).toBe(true);
  });

  it('flags invalid route level', () => {
    const plan = goodPlan({ route: { ...goodPlan().route, level: 'L9' as unknown as 'L2' } });
    const res = validateNkplan(plan);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.field === 'route.level')).toBe(true);
  });

  it('flags confidence out of range', () => {
    const plan = goodPlan({ route: { ...goodPlan().route, confidence: 2 } });
    const res = validateNkplan(plan);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.field === 'route.confidence')).toBe(true);
  });

  it('accepts shots with valid primary + alternatives', () => {
    const plan = goodPlan({
      shots: [
        {
          shotId: 'shot_1',
          primary: {
            character: {
              slot: 'character',
              entityId: 'alice',
              assetId: 'alice_casual',
              provenance: 'L1',
              confidence: 0.98,
            },
          },
          alternatives: {
            character: [
              {
                slot: 'character',
                entityId: 'alice',
                assetId: 'alice_formal',
                provenance: 'L2',
                confidence: 0.85,
              },
            ],
          },
          unmatched: [],
        },
      ],
    });
    expect(validateNkplan(plan).valid).toBe(true);
  });

  it('flags unknown binding slot in shot', () => {
    const plan = goodPlan({
      shots: [
        {
          shotId: 's',
          primary: {
            /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
            bogus: {
              slot: 'character',
              entityId: 'a',
              assetId: 'x',
              provenance: 'L1',
              confidence: 0.9,
            },
          } as unknown as NkPlan['shots'] extends readonly (infer S)[]
            ? S extends { primary: infer P }
              ? P
              : never
            : never,
          alternatives: {},
          unmatched: [],
        },
      ],
    });
    expect(validateNkplan(plan).valid).toBe(false);
  });

  it('accepts constraints', () => {
    const plan = goodPlan({
      constraints: [
        {
          id: 'lock-alice',
          kind: 'character_lock',
          entity: 'alice',
          shots: ['shot_1', 'shot_2'],
          payload: { lockedAsset: 'alice_casual' },
        },
      ],
    });
    expect(validateNkplan(plan).valid).toBe(true);
  });

  it('strict mode promotes warnings to errors', () => {
    const plan = { ...goodPlan(), version: 'weird-future-1.2' };
    const loose = validateNkplan(plan);
    expect(loose.valid).toBe(true); // only a warning
    const strict = validateNkplan(plan, { strict: true });
    expect(strict.valid).toBe(false);
  });

  it('accepts an optional referenceChain array', () => {
    const plan = goodPlan({
      referenceChain: [
        {
          shotId: 's2',
          slot: 'character',
          references: ['s1'],
          strategy: 'hybrid',
        },
      ],
    });
    const res = validateNkplan(plan);
    expect(res.valid).toBe(true);
  });

  it('flags invalid reference-chain strategy', () => {
    const plan = {
      ...goodPlan(),
      referenceChain: [
        {
          shotId: 's2',
          slot: 'character',
          references: ['s1'],
          strategy: 'nonsense',
        },
      ],
    } as unknown as NkPlan;
    const res = validateNkplan(plan);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.field === 'referenceChain[0].strategy')).toBe(true);
  });

  it('flags non-array references', () => {
    const plan = {
      ...goodPlan(),
      referenceChain: [
        {
          shotId: 's2',
          slot: 'character',
          references: 'not-an-array',
          strategy: 'hybrid',
        },
      ],
    } as unknown as NkPlan;
    const res = validateNkplan(plan);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.field === 'referenceChain[0].references')).toBe(true);
  });

  it('flags invalid slot', () => {
    const plan = {
      ...goodPlan(),
      referenceChain: [
        {
          shotId: 's2',
          slot: 'not-a-slot',
          references: ['s1'],
          strategy: 'hybrid',
        },
      ],
    } as unknown as NkPlan;
    const res = validateNkplan(plan);
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.field === 'referenceChain[0].slot')).toBe(true);
  });
});

// =============================================================================
// detectVersion + migrator
// =============================================================================

describe('detectNkplanVersion', () => {
  it('returns "1.0" for current plans', () => {
    expect(detectNkplanVersion(goodPlan())).toBe('1.0');
  });

  it('returns undefined for non-objects', () => {
    expect(detectNkplanVersion(null)).toBeUndefined();
    expect(detectNkplanVersion('x')).toBeUndefined();
  });

  it('returns undefined for unknown version strings', () => {
    expect(detectNkplanVersion({ version: '0.5' })).toBeUndefined();
  });
});

describe('migrateNkplan', () => {
  it('is a no-op for current version', () => {
    const plan = goodPlan();
    const res = migrateNkplan(plan);
    expect(res.toVersion).toBe(CURRENT_NKPLAN_VERSION);
    expect(res.appliedMigrations).toHaveLength(0);
  });

  it('produces a stamped plan even for malformed input (best-effort)', () => {
    const res = migrateNkplan({ foo: 'bar' });
    expect(res.data.version).toBe(CURRENT_NKPLAN_VERSION);
    expect(res.warnings.length).toBeGreaterThanOrEqual(0);
  });
});

// =============================================================================
// codec — load / save round-trip
// =============================================================================

describe('loadNkplan + saveNkplan round-trip', () => {
  it('saves and reloads identical content', () => {
    const plan = goodPlan();
    const serialised = saveNkplan(plan);
    const reloaded = loadNkplan(serialised);
    expect(reloaded.validation.valid).toBe(true);
    expect(reloaded.plan.id).toBe(plan.id);
    expect(reloaded.plan.stages).toHaveLength(plan.stages.length);
  });

  it('save throws on invalid plan when validate=true', () => {
    const plan = { ...goodPlan(), id: 42 } as unknown as NkPlan;
    expect(() => saveNkplan(plan)).toThrow(/NKPLAN validation failed/);
  });

  it('save allows invalid plan when validate=false', () => {
    const plan = { ...goodPlan(), id: '' } as NkPlan; // empty id
    const out = saveNkplan(plan, { validate: false });
    expect(typeof out).toBe('string');
  });

  it('load returns an empty plan + error for malformed JSON', () => {
    const res = loadNkplan('not json');
    expect(res.validation.valid).toBe(false);
    expect(res.plan.id).toBe('');
  });

  it('load gracefully surfaces validation errors for wrong schema', () => {
    const res = loadNkplan(JSON.stringify({ version: '1.0', route: 'not-an-object', stages: [] }));
    expect(res.validation.valid).toBe(false);
  });
});

describe('isValidNkplan', () => {
  it('true for good plan', () => {
    expect(isValidNkplan(goodPlan())).toBe(true);
  });
  it('false for bad plan', () => {
    expect(isValidNkplan({})).toBe(false);
  });
});
