/**
 * NKPROJ format SDK — codec + validator + migrator + operations tests.
 */

import { describe, expect, it } from 'vitest';
import {
  CURRENT_NKPROJ_VERSION,
  addArtifacts,
  appendUpgradeEvent,
  artifactsByKind,
  detectNkprojVersion,
  isValidNkproj,
  loadNkproj,
  migrateNkproj,
  recordLosslessUpgrade,
  removeArtifacts,
  saveNkproj,
  validateNkproj,
  type NkProj,
  type NkprojArtifactRef,
} from '../index';

function goodArtifact(overrides: Partial<NkprojArtifactRef> = {}): NkprojArtifactRef {
  return {
    id: 'story-1',
    kind: 'script',
    path: 'story/main.nks',
    ...overrides,
  };
}

function goodProj(overrides: Partial<NkProj> = {}): NkProj {
  return {
    version: '1.0',
    id: 'proj_test',
    createdAt: 1000,
    updatedAt: 1000,
    name: 'Test Project',
    artifacts: [goodArtifact()],
    ...overrides,
  };
}

// =============================================================================
// validator
// =============================================================================

describe('validateNkproj', () => {
  it('accepts a minimal good project', () => {
    const res = validateNkproj(goodProj());
    expect(res.valid).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  it('flags missing root', () => {
    const res = validateNkproj(null);
    expect(res.valid).toBe(false);
    expect(res.errors[0]?.field).toBe('');
  });

  it('flags missing id and name', () => {
    const res = validateNkproj({
      version: '1.0',
      createdAt: 0,
      updatedAt: 0,
      artifacts: [],
    });
    expect(res.valid).toBe(false);
    const fields = res.errors.map((e) => e.field);
    expect(fields).toContain('id');
    expect(fields).toContain('name');
  });

  it('flags non-array artifacts', () => {
    const res = validateNkproj({ ...goodProj(), artifacts: 'nope' });
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.field === 'artifacts')).toBe(true);
  });

  it('flags duplicate artifact ids', () => {
    const res = validateNkproj({
      ...goodProj(),
      artifacts: [goodArtifact({ id: 'dup' }), goodArtifact({ id: 'dup', path: 'other.nks' })],
    });
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.message.includes('Duplicate'))).toBe(true);
  });

  it('flags unknown artifact kind', () => {
    const res = validateNkproj({
      ...goodProj(),
      artifacts: [goodArtifact({ kind: 'unknown' as unknown as NkprojArtifactRef['kind'] })],
    });
    expect(res.valid).toBe(false);
  });

  it('warns on absolute artifact paths but still validates', () => {
    const res = validateNkproj({
      ...goodProj(),
      artifacts: [goodArtifact({ path: '/abs/path/story.nks' })],
    });
    expect(res.valid).toBe(true);
    expect(res.warnings.some((w) => w.message.includes('Absolute path'))).toBe(true);
  });

  it('warns on windows-style absolute paths too', () => {
    const res = validateNkproj({
      ...goodProj(),
      artifacts: [goodArtifact({ path: 'C:\\foo\\story.nks' })],
    });
    expect(res.valid).toBe(true);
    expect(res.warnings.some((w) => w.message.includes('Absolute path'))).toBe(true);
  });

  it('flags invalid upgrade-event shapes', () => {
    const res = validateNkproj({
      ...goodProj(),
      upgradeHistory: [{ at: 1, toLevel: 'L9', addedArtifactIds: ['x'] }],
    });
    expect(res.valid).toBe(false);
    expect(res.errors.some((e) => e.field === 'upgradeHistory[0].toLevel')).toBe(true);
  });

  it('flags invalid workflow autoApproveThreshold', () => {
    const res = validateNkproj({
      ...goodProj(),
      workflow: { autoApproveThreshold: 5 },
    });
    expect(res.valid).toBe(false);
  });

  it('strict mode promotes warnings to errors', () => {
    const proj = {
      ...goodProj(),
      artifacts: [goodArtifact({ path: '/abs.nks' })],
    };
    expect(validateNkproj(proj).valid).toBe(true);
    expect(validateNkproj(proj, { strict: true }).valid).toBe(false);
  });
});

// =============================================================================
// detectVersion + migrator
// =============================================================================

describe('detectNkprojVersion', () => {
  it('returns "1.0" for current projects', () => {
    expect(detectNkprojVersion(goodProj())).toBe('1.0');
  });

  it('returns undefined for non-objects / unknown versions', () => {
    expect(detectNkprojVersion(null)).toBeUndefined();
    expect(detectNkprojVersion({ version: '0.5' })).toBeUndefined();
  });
});

describe('migrateNkproj', () => {
  it('is a no-op for current version', () => {
    const res = migrateNkproj(goodProj());
    expect(res.toVersion).toBe(CURRENT_NKPROJ_VERSION);
    expect(res.appliedMigrations).toHaveLength(0);
  });

  it('stamps the version on malformed input (best-effort)', () => {
    const res = migrateNkproj({ foo: 'bar' });
    expect(res.data.version).toBe(CURRENT_NKPROJ_VERSION);
    expect(res.warnings.length).toBeGreaterThanOrEqual(0);
  });
});

// =============================================================================
// codec — round-trip
// =============================================================================

describe('loadNkproj + saveNkproj round-trip', () => {
  it('saves and reloads identical content', () => {
    const proj = goodProj();
    const serialised = saveNkproj(proj);
    const reloaded = loadNkproj(serialised);
    expect(reloaded.validation.valid).toBe(true);
    expect(reloaded.proj.id).toBe(proj.id);
    expect(reloaded.proj.artifacts).toHaveLength(proj.artifacts.length);
  });

  it('save throws on invalid project when validate=true', () => {
    const proj = { ...goodProj(), id: 42 } as unknown as NkProj;
    expect(() => saveNkproj(proj)).toThrow(/NKPROJ validation failed/);
  });

  it('save skips validation when validate=false', () => {
    const proj = { ...goodProj(), id: 42 } as unknown as NkProj;
    expect(() => saveNkproj(proj, { validate: false })).not.toThrow();
  });

  it('load returns empty project + error on JSON parse failure', () => {
    const res = loadNkproj('{ malformed');
    expect(res.validation.valid).toBe(false);
    expect(res.proj.id).toBe('');
  });

  it('load returns empty project when critical errors are present', () => {
    const res = loadNkproj(JSON.stringify({ version: '1.0', name: 'x' }));
    expect(res.validation.valid).toBe(false);
    expect(res.proj.id).toBe('');
  });
});

describe('isValidNkproj', () => {
  it('returns true for good projects and narrows the type', () => {
    const unknownX: unknown = goodProj();
    expect(isValidNkproj(unknownX)).toBe(true);
    if (isValidNkproj(unknownX)) {
      // Compile-time narrowing check
      expect(unknownX.artifacts.length).toBeGreaterThan(0);
    }
  });

  it('returns false on bad data', () => {
    expect(isValidNkproj({})).toBe(false);
  });
});

// =============================================================================
// operations
// =============================================================================

describe('operations — artifactsByKind', () => {
  it('filters by kind with stable order', () => {
    const proj = goodProj({
      artifacts: [
        goodArtifact({ id: 'a', kind: 'script', path: 's.nks' }),
        goodArtifact({ id: 'b', kind: 'canvas', path: 'c.nkc' }),
        goodArtifact({ id: 'c', kind: 'script', path: 's2.nks' }),
      ],
    });
    const scripts = artifactsByKind(proj, 'script');
    expect(scripts.map((a) => a.id)).toEqual(['a', 'c']);
    expect(artifactsByKind(proj, 'timeline')).toHaveLength(0);
  });
});

describe('operations — addArtifacts', () => {
  it('appends new artifacts and bumps updatedAt', () => {
    const proj = goodProj({ updatedAt: 100 });
    const next = addArtifacts(
      proj,
      [goodArtifact({ id: 'new-1', path: 'p.nkplan', kind: 'plan' })],
      {
        now: 999,
      },
    );
    expect(next.artifacts).toHaveLength(2);
    expect(next.updatedAt).toBe(999);
  });

  it('replaces existing artifact when ids collide', () => {
    const proj = goodProj({
      artifacts: [goodArtifact({ id: 'x', label: 'old' })],
    });
    const next = addArtifacts(proj, [goodArtifact({ id: 'x', label: 'new' })]);
    expect(next.artifacts).toHaveLength(1);
    expect(next.artifacts[0]?.label).toBe('new');
  });

  it('is a no-op when given an empty list', () => {
    const proj = goodProj();
    expect(addArtifacts(proj, [])).toBe(proj);
  });
});

describe('operations — removeArtifacts', () => {
  it('drops matching ids and keeps the rest', () => {
    const proj = goodProj({
      artifacts: [goodArtifact({ id: 'a' }), goodArtifact({ id: 'b', path: 'b.nks' })],
    });
    const next = removeArtifacts(proj, ['a']);
    expect(next.artifacts.map((a) => a.id)).toEqual(['b']);
  });

  it('returns the same reference when nothing changed', () => {
    const proj = goodProj();
    expect(removeArtifacts(proj, ['missing'])).toBe(proj);
    expect(removeArtifacts(proj, [])).toBe(proj);
  });
});

describe('operations — appendUpgradeEvent', () => {
  it('appends to empty history', () => {
    const proj = goodProj();
    const next = appendUpgradeEvent(proj, {
      toLevel: 'L2',
      addedArtifactIds: ['x'],
      at: 200,
    });
    expect(next.upgradeHistory).toHaveLength(1);
    expect(next.upgradeHistory?.[0]?.toLevel).toBe('L2');
    expect(next.updatedAt).toBe(200);
  });

  it('appends to existing history without mutating the original', () => {
    const first = appendUpgradeEvent(goodProj(), {
      toLevel: 'L1',
      addedArtifactIds: ['a'],
      at: 100,
    });
    const second = appendUpgradeEvent(first, {
      toLevel: 'L2',
      addedArtifactIds: ['b'],
      fromLevel: 'L1',
      reason: 'user requested',
      at: 200,
    });
    expect(first.upgradeHistory).toHaveLength(1);
    expect(second.upgradeHistory).toHaveLength(2);
    expect(second.upgradeHistory?.[1]?.fromLevel).toBe('L1');
    expect(second.upgradeHistory?.[1]?.reason).toBe('user requested');
  });
});

describe('operations — recordLosslessUpgrade', () => {
  it('adds artifacts AND logs the upgrade in one go', () => {
    const proj = goodProj();
    const next = recordLosslessUpgrade(proj, {
      toLevel: 'L2',
      fromLevel: 'L0',
      newArtifacts: [
        goodArtifact({ id: 'board', kind: 'canvas', path: 'shots.nkc' }),
        goodArtifact({ id: 'plan', kind: 'plan', path: 'plan.nkplan' }),
      ],
      reason: 'adding storyboard + plan after prompt pilot',
      at: 500,
    });
    // New artifacts present
    expect(artifactsByKind(next, 'canvas')).toHaveLength(1);
    expect(artifactsByKind(next, 'plan')).toHaveLength(1);
    // Stamped with producedByRouteLevel
    const board = next.artifacts.find((a) => a.id === 'board');
    expect(board?.producedByRouteLevel).toBe('L2');
    // Upgrade event logged
    expect(next.upgradeHistory).toHaveLength(1);
    const evt = next.upgradeHistory?.[0];
    expect(evt?.toLevel).toBe('L2');
    expect(evt?.fromLevel).toBe('L0');
    expect(evt?.addedArtifactIds).toEqual(['board', 'plan']);
  });

  it('respects a caller-supplied producedByRouteLevel', () => {
    const proj = goodProj();
    const next = recordLosslessUpgrade(proj, {
      toLevel: 'L3',
      newArtifacts: [goodArtifact({ id: 'custom', producedByRouteLevel: 'L2' })],
      at: 1,
    });
    const custom = next.artifacts.find((a) => a.id === 'custom');
    expect(custom?.producedByRouteLevel).toBe('L2');
  });
});
