/**
 * Subpackage guard tests (ADR §5.2.10).
 *
 * Covers:
 *   - no requiredSubpackages declared → pass silently
 *   - resolver not wired → log + skip (no throw)
 *   - required + installed + enabled → pass
 *   - required + missing → throw
 *   - required + disabled → throw (treated as missing)
 *   - required + version too low → throw with version-mismatch
 *   - optional + missing → warn + pass
 *   - optional + version too low → warn + pass
 *   - mixed blockers: error carries every blocking issue
 *   - unparseable version → lenient (do not block)
 */

import { describe, it, expect } from 'vitest';
import type { Skill } from '@neko/shared';
import {
  assertSubpackagesAvailable,
  SkillActivationError,
  type ISubpackageResolver,
  type SubpackageInfo,
} from '../subpackage-guard';

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    name: 'test-skill',
    description: 'desc',
    content: '# content',
    source: 'builtin',
    enabled: true,
    ...overrides,
  } as Skill;
}

function makeResolver(entries: Record<string, SubpackageInfo>): ISubpackageResolver {
  return {
    get: (id) => entries[id] ?? null,
  };
}

describe('assertSubpackagesAvailable', () => {
  it('no requiredSubpackages → no-op', () => {
    const skill = makeSkill();
    expect(() => assertSubpackagesAvailable(skill, null)).not.toThrow();
  });

  it('resolver missing but deps declared → warn + skip (no throw)', () => {
    const skill = makeSkill({
      requiredSubpackages: [{ id: 'neko-cut', required: true }],
    });
    expect(() => assertSubpackagesAvailable(skill, null)).not.toThrow();
  });

  it('all required deps satisfied → pass', () => {
    const skill = makeSkill({
      requiredSubpackages: [
        { id: 'neko-cut', required: true, minVersion: '1.0.0' },
        { id: 'neko-audio', required: false },
      ],
    });
    const resolver = makeResolver({
      'neko-cut': { id: 'neko-cut', version: '1.2.3', enabled: true },
      'neko-audio': { id: 'neko-audio', version: '0.5.0', enabled: true },
    });
    expect(() => assertSubpackagesAvailable(skill, resolver)).not.toThrow();
  });

  it('required + missing → throws with subpackage-missing', () => {
    const skill = makeSkill({
      requiredSubpackages: [{ id: 'neko-cut', required: true }],
    });
    const resolver = makeResolver({});
    let err: unknown;
    try {
      assertSubpackagesAvailable(skill, resolver);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(SkillActivationError);
    const issues = (err as SkillActivationError).issues;
    expect(issues).toHaveLength(1);
    expect(issues[0]!.code).toBe('subpackage-missing');
    expect(issues[0]!.subpackageId).toBe('neko-cut');
  });

  it('required + disabled is treated as missing', () => {
    const skill = makeSkill({
      requiredSubpackages: [{ id: 'neko-cut', required: true }],
    });
    const resolver = makeResolver({
      'neko-cut': { id: 'neko-cut', version: '1.0.0', enabled: false },
    });
    expect(() => assertSubpackagesAvailable(skill, resolver)).toThrow(SkillActivationError);
  });

  it('required + version too low → throws subpackage-version-mismatch', () => {
    const skill = makeSkill({
      requiredSubpackages: [{ id: 'neko-cut', required: true, minVersion: '2.0.0' }],
    });
    const resolver = makeResolver({
      'neko-cut': { id: 'neko-cut', version: '1.9.9', enabled: true },
    });
    try {
      assertSubpackagesAvailable(skill, resolver);
      expect.fail('should have thrown');
    } catch (e) {
      const err = e as SkillActivationError;
      expect(err).toBeInstanceOf(SkillActivationError);
      expect(err.issues[0]!.code).toBe('subpackage-version-mismatch');
      expect(err.issues[0]!.installedVersion).toBe('1.9.9');
      expect(err.issues[0]!.minVersion).toBe('2.0.0');
    }
  });

  it('optional + missing → warn + pass (does not throw)', () => {
    const skill = makeSkill({
      requiredSubpackages: [
        {
          id: 'neko-audio',
          required: false,
          fallback: { message: 'no bgm' },
        },
      ],
    });
    const resolver = makeResolver({});
    expect(() => assertSubpackagesAvailable(skill, resolver)).not.toThrow();
  });

  it('optional + version mismatch → warn + pass', () => {
    const skill = makeSkill({
      requiredSubpackages: [{ id: 'neko-audio', required: false, minVersion: '2.0.0' }],
    });
    const resolver = makeResolver({
      'neko-audio': { id: 'neko-audio', version: '1.0.0', enabled: true },
    });
    expect(() => assertSubpackagesAvailable(skill, resolver)).not.toThrow();
  });

  it('mixed blockers are reported together', () => {
    const skill = makeSkill({
      requiredSubpackages: [
        { id: 'neko-cut', required: true },
        { id: 'neko-canvas', required: true, minVersion: '3.0.0' },
        { id: 'neko-audio', required: false },
      ],
    });
    const resolver = makeResolver({
      'neko-canvas': { id: 'neko-canvas', version: '1.0.0', enabled: true },
    });
    try {
      assertSubpackagesAvailable(skill, resolver);
      expect.fail('should have thrown');
    } catch (e) {
      const err = e as SkillActivationError;
      expect(err.issues).toHaveLength(2);
      const codes = err.issues.map((i) => i.code).sort();
      expect(codes).toEqual(['subpackage-missing', 'subpackage-version-mismatch']);
      const ids = err.issues.map((i) => i.subpackageId).sort();
      expect(ids).toEqual(['neko-canvas', 'neko-cut']);
    }
  });

  it('unparseable version is lenient (does not block)', () => {
    const skill = makeSkill({
      requiredSubpackages: [{ id: 'neko-cut', required: true, minVersion: 'not-a-version' }],
    });
    const resolver = makeResolver({
      'neko-cut': { id: 'neko-cut', version: '0.0.1', enabled: true },
    });
    expect(() => assertSubpackagesAvailable(skill, resolver)).not.toThrow();
  });
});
