/**
 * validateSkill SDD metadata tests (B1)
 *
 * Covers agent-unified-workflow.md §5.2.1 frontmatter fields:
 *   version, domain, requiredSubpackages, autoInvoke, phases, pipelines,
 *   referencedAssets, referencedSkills, compliance.
 *
 * The validator treats version/domain as "missing ⇒ warn, malformed ⇒
 * error"; every other field is optional but checked for shape when
 * present. Pre-existing Skill fields (name / description / content)
 * already have coverage via other surfaces; this suite focuses on the
 * new SDD block.
 */

import { describe, it, expect } from 'vitest';
import { validateSkill } from '../skill';
import type { Skill } from '../skill';

function baseSkill(overrides: Partial<Skill> = {}): Partial<Skill> {
  return {
    name: 'my-skill',
    description: 'Use when the user wants to exercise the validator surface.',
    content: '# my-skill\n\nSome persona content.',
    source: 'builtin',
    enabled: true,
    version: '1.0.0',
    domain: 'cut',
    ...overrides,
  };
}

describe('validateSkill — SDD metadata §5.2.1', () => {
  describe('version', () => {
    it('accepts a valid semver string', () => {
      const r = validateSkill(baseSkill({ version: '2.3.4' }));
      expect(r.valid).toBe(true);
    });

    it('warns when version is missing', () => {
      const r = validateSkill(baseSkill({ version: undefined }));
      expect(r.valid).toBe(true);
      expect(r.warnings.some((w) => w.includes('version'))).toBe(true);
    });

    it('errors on a malformed version', () => {
      const r = validateSkill(baseSkill({ version: '1.0' }));
      expect(r.valid).toBe(false);
      expect(r.errors.some((e) => e.includes('version'))).toBe(true);
    });
  });

  describe('domain', () => {
    it('warns when domain is missing', () => {
      const r = validateSkill(baseSkill({ domain: undefined }));
      expect(r.valid).toBe(true);
      expect(r.warnings.some((w) => w.includes('domain'))).toBe(true);
    });

    it('errors on an empty domain', () => {
      const r = validateSkill(baseSkill({ domain: '   ' }));
      expect(r.valid).toBe(false);
      expect(r.errors.some((e) => e.includes('domain'))).toBe(true);
    });
  });

  describe('requiredSubpackages', () => {
    it('accepts a well-formed list', () => {
      const r = validateSkill(
        baseSkill({
          requiredSubpackages: [
            { id: 'neko-cut', required: true, minVersion: '1.0.0' },
            {
              id: 'neko-audio',
              required: false,
              fallback: { message: 'no BGM without neko-audio' },
            },
          ],
        }),
      );
      expect(r.valid).toBe(true);
    });

    it('errors on duplicate ids', () => {
      const r = validateSkill(
        baseSkill({
          requiredSubpackages: [
            { id: 'neko-cut', required: true },
            { id: 'neko-cut', required: false },
          ],
        }),
      );
      expect(r.valid).toBe(false);
      expect(r.errors.some((e) => e.includes('Duplicate'))).toBe(true);
    });

    it('errors when required is not a boolean', () => {
      const r = validateSkill(
        baseSkill({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          requiredSubpackages: [{ id: 'neko-cut', required: 'yes' as any }],
        }),
      );
      expect(r.valid).toBe(false);
      expect(r.errors.some((e) => e.includes('required'))).toBe(true);
    });

    it('errors on malformed minVersion', () => {
      const r = validateSkill(
        baseSkill({
          requiredSubpackages: [{ id: 'neko-cut', required: true, minVersion: 'latest' }],
        }),
      );
      expect(r.valid).toBe(false);
      expect(r.errors.some((e) => e.includes('minVersion'))).toBe(true);
    });
  });

  describe('autoInvoke', () => {
    it('accepts boolean true/false', () => {
      expect(validateSkill(baseSkill({ autoInvoke: true })).valid).toBe(true);
      expect(validateSkill(baseSkill({ autoInvoke: false })).valid).toBe(true);
    });

    it('errors on non-boolean', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = validateSkill(baseSkill({ autoInvoke: 'yes' as any }));
      expect(r.valid).toBe(false);
      expect(r.errors.some((e) => e.includes('autoInvoke'))).toBe(true);
    });
  });

  describe('phases', () => {
    it('accepts a well-formed phase list', () => {
      const r = validateSkill(
        baseSkill({
          phases: [
            { name: 'specify', label: 'Specify', approval: true },
            { name: 'implement', label: 'Implement', parallel: true },
          ],
        }),
      );
      expect(r.valid).toBe(true);
    });

    it('errors on duplicate phase names', () => {
      const r = validateSkill(
        baseSkill({
          phases: [
            { name: 'specify', label: 'Specify' },
            { name: 'specify', label: 'Specify again' },
          ],
        }),
      );
      expect(r.valid).toBe(false);
      expect(r.errors.some((e) => e.includes('Duplicate phase'))).toBe(true);
    });

    it('errors on missing label', () => {
      const r = validateSkill(
        baseSkill({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          phases: [{ name: 'specify', label: '' as any }],
        }),
      );
      expect(r.valid).toBe(false);
      expect(r.errors.some((e) => e.includes('label'))).toBe(true);
    });
  });

  describe('pipelines', () => {
    it('accepts a well-formed pipelines map', () => {
      const r = validateSkill(
        baseSkill({
          pipelines: {
            export: {
              ops: [{ 'cut.upscale': { target: '1080p' } }, { 'cut.watermark': {} }],
            },
          },
        }),
      );
      expect(r.valid).toBe(true);
    });

    it('errors when ops is not an array', () => {
      const r = validateSkill(
        baseSkill({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          pipelines: { export: { ops: 'nope' as any } },
        }),
      );
      expect(r.valid).toBe(false);
      expect(r.errors.some((e) => e.includes('ops'))).toBe(true);
    });

    it('errors when an op is not an object', () => {
      const r = validateSkill(
        baseSkill({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          pipelines: { export: { ops: ['bad' as any] } },
        }),
      );
      expect(r.valid).toBe(false);
      expect(r.errors.some((e) => e.includes('ops[0]'))).toBe(true);
    });
  });

  describe('referencedAssets', () => {
    it('accepts well-formed asset references', () => {
      const r = validateSkill(
        baseSkill({
          referencedAssets: [
            { uri: 'asset://styles/cinematic-lut', required: false, purpose: 'default LUT' },
          ],
        }),
      );
      expect(r.valid).toBe(true);
    });

    it('errors when uri does not start with asset://', () => {
      const r = validateSkill(
        baseSkill({
          referencedAssets: [{ uri: 'https://example.com/foo.png' }],
        }),
      );
      expect(r.valid).toBe(false);
      expect(r.errors.some((e) => e.includes('asset://'))).toBe(true);
    });
  });

  describe('referencedSkills', () => {
    it('accepts collaborator and delegator relationships', () => {
      const r = validateSkill(
        baseSkill({
          referencedSkills: [
            { id: 'audio-expert', relationship: 'collaborator' },
            { id: 'render-delegate', relationship: 'delegator' },
          ],
        }),
      );
      expect(r.valid).toBe(true);
    });

    it('errors on unknown relationship values', () => {
      const r = validateSkill(
        baseSkill({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          referencedSkills: [{ id: 'foo', relationship: 'partner' as any }],
        }),
      );
      expect(r.valid).toBe(false);
      expect(r.errors.some((e) => e.includes('relationship'))).toBe(true);
    });
  });

  describe('compliance', () => {
    it('accepts a well-formed block', () => {
      const r = validateSkill(
        baseSkill({
          compliance: {
            framework: 'SOC2',
            auditRequired: true,
            reviewedBy: ['legal', 'security'],
            reviewDate: '2026-04-01',
          },
        }),
      );
      expect(r.valid).toBe(true);
    });

    it('errors when auditRequired is not a boolean', () => {
      const r = validateSkill(
        baseSkill({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          compliance: { auditRequired: 'yes' as any },
        }),
      );
      expect(r.valid).toBe(false);
      expect(r.errors.some((e) => e.includes('auditRequired'))).toBe(true);
    });

    it('errors when reviewedBy is not an array', () => {
      const r = validateSkill(
        baseSkill({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          compliance: { reviewedBy: 'legal' as any },
        }),
      );
      expect(r.valid).toBe(false);
      expect(r.errors.some((e) => e.includes('reviewedBy'))).toBe(true);
    });
  });

  describe('backwards compatibility', () => {
    it('Skills without any SDD metadata are still valid (only warnings)', () => {
      const r = validateSkill({
        name: 'legacy',
        description: 'A legacy skill that predates the SDD block.',
        content: '# legacy',
        source: 'builtin',
        enabled: true,
      });
      expect(r.valid).toBe(true);
      // Missing version + domain both warn, but nothing errors.
      expect(r.warnings.length).toBeGreaterThanOrEqual(2);
      expect(r.errors.length).toBe(0);
    });
  });
});
