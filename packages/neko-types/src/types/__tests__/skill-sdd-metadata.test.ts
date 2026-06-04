/**
 * validateSkill + validateSkillManifest SDD metadata tests (B1 + B1.5)
 *
 * Covers agent-unified-workflow.md §5.2.1 manifest fields:
 *   version, domain, requiredSubpackages, autoInvoke,
 *   referencedAssets, referencedSkills, mediaWorkflow, compliance.
 *
 * The SDD manifest lives in a sibling `manifest.json` — separate from
 * SKILL.md frontmatter — so configuration that only the runtime cares
 * about stays out of the prompt window. Two surfaces to cover:
 *
 *   - `validateSkill(skill)`: runtime snapshot (manifest merged into Skill);
 *     used by the loader after createSkill().
 *   - `validateSkillManifest(manifest)`: bare manifest pass used by the
 *     marketplace installer and by the activation guard.
 *
 * Missing version / domain warn; deterministic runtime fields are
 * shape-checked when present.
 */

import { describe, it, expect } from 'vitest';
import { validateSkill, validateSkillManifest } from '../skill';
import type { Skill, SkillManifest } from '../skill';

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

function baseManifest(overrides: Partial<SkillManifest> = {}): Partial<SkillManifest> {
  return {
    version: '1.0.0',
    domain: 'cut',
    ...overrides,
  };
}

describe('validateSkill — SDD metadata §5.2.1', () => {
  describe('base invariants', () => {
    it('requires slash-routable lowercase hyphen skill names', () => {
      for (const name of ['Bad Name', '中文-skill', 'skill_name']) {
        const r = validateSkill(baseSkill({ name }));
        expect(r.valid).toBe(false);
        expect(r.errors.some((e) => e.includes('name'))).toBe(true);
      }
    });

    it('limits skill names to 64 characters', () => {
      const r = validateSkill(baseSkill({ name: 'a'.repeat(65) }));

      expect(r.valid).toBe(false);
      expect(r.errors.some((e) => e.includes('64'))).toBe(true);
    });

    it('requires description and content', () => {
      const r = validateSkill(baseSkill({ description: '', content: '' }));

      expect(r.valid).toBe(false);
      expect(r.errors).toEqual(
        expect.arrayContaining([
          expect.stringContaining('description'),
          expect.stringContaining('content'),
        ]),
      );
    });

    it('limits descriptions to 2048 characters', () => {
      const r = validateSkill(baseSkill({ description: 'a'.repeat(2049) }));

      expect(r.valid).toBe(false);
      expect(r.errors.some((e) => e.includes('2048'))).toBe(true);
    });
  });

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

  describe('retired workflow DSL fields', () => {
    it('ignores unknown retired workflow DSL fields', () => {
      const r = validateSkillManifest({
        ...baseManifest(),
        phases: [],
        pipelines: {},
        workflow: {},
        stages: [],
      } as unknown as SkillManifest);

      expect(r.valid).toBe(true);
      expect(r.errors).toEqual([]);
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

describe('validateSkillManifest — standalone manifest pass', () => {
  it('a well-formed manifest is valid', () => {
    const r = validateSkillManifest(baseManifest());
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('empty manifest warns on missing version + domain but does not error', () => {
    const r = validateSkillManifest({});
    expect(r.valid).toBe(true);
    expect(r.warnings.length).toBeGreaterThanOrEqual(2);
    expect(r.errors).toEqual([]);
  });

  it('malformed version errors', () => {
    const r = validateSkillManifest(baseManifest({ version: '1.x' }));
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('version'))).toBe(true);
  });

  it('requiredSubpackages duplicate ids reported', () => {
    const r = validateSkillManifest(
      baseManifest({
        requiredSubpackages: [
          { id: 'neko-cut', required: true },
          { id: 'neko-cut', required: false },
        ],
      }),
    );
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('Duplicate'))).toBe(true);
  });

  it('referencedAssets must use asset:// URIs', () => {
    const r = validateSkillManifest(
      baseManifest({
        referencedAssets: [{ uri: 'file:///local/path' }],
      }),
    );
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.includes('asset://'))).toBe(true);
  });

  it('accepts a prompt-chain era metadata block loaded from manifest.json', () => {
    const r = validateSkillManifest({
      version: '1.2.0',
      domain: 'cut',
      requiredSubpackages: [
        { id: 'neko-cut', required: true, minVersion: '1.0.0' },
        { id: 'neko-audio', required: false, fallback: { message: 'no BGM' } },
      ],
      autoInvoke: true,
      referencedAssets: [
        { uri: 'asset://styles/cinematic-lut', required: false, purpose: 'default LUT' },
      ],
      referencedSkills: [{ id: 'audio-expert', relationship: 'collaborator' }],
      mediaWorkflow: {
        acceptedModalities: ['comic', 'image-sequence'],
        producedArtifacts: ['storyboard-table'],
        tags: ['comic', 'storyboard'],
        costLevel: 'low',
        riskLevel: 'low',
        validationRequirements: ['StoryboardTableV1'],
        optionalTools: ['ReadImage'],
      },
      compliance: {
        framework: 'creator-standard',
        auditRequired: false,
      },
    });
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('accepts media workflow hints without requiring them on manifest-less skills', () => {
    const skill = baseSkill({
      mediaWorkflow: {
        acceptedModalities: ['image'],
        producedArtifacts: ['storyboard-table', 'animation-plan'],
        inputArtifacts: ['generated-media-ref'],
        tags: ['media-to-video'],
        costLevel: 'medium',
        riskLevel: 'medium',
        validationRequirements: ['StoryboardTableV1'],
      },
    });

    const withHints = validateSkill(skill);
    const withoutHints = validateSkill(baseSkill({ mediaWorkflow: undefined }));

    expect(withHints.valid).toBe(true);
    expect(withHints.errors).toEqual([]);
    expect(withoutHints.valid).toBe(true);
    expect(withoutHints.errors).toEqual([]);
  });

  it('rejects workflow-order DSL fields in media workflow hints', () => {
    const r = validateSkillManifest(
      baseManifest({
        mediaWorkflow: {
          acceptedModalities: ['comic'],
          producedArtifacts: ['storyboard-table'],
          steps: ['inspect', 'structure'],
          routes: [{ from: 'comic', to: 'video' }],
        } as unknown as SkillManifest['mediaWorkflow'],
      }),
    );

    expect(r.valid).toBe(false);
    expect(r.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('mediaWorkflow.steps is not allowed'),
        expect.stringContaining('mediaWorkflow.routes is not allowed'),
      ]),
    );
  });

  it('rejects malformed media workflow hint fields', () => {
    const r = validateSkillManifest(
      baseManifest({
        mediaWorkflow: {
          acceptedModalities: ['comic', ''],
          costLevel: 'expensive',
          riskLevel: 'unsafe',
        } as unknown as SkillManifest['mediaWorkflow'],
      }),
    );

    expect(r.valid).toBe(false);
    expect(r.errors).toEqual(
      expect.arrayContaining([
        'mediaWorkflow.acceptedModalities[1] must be a non-empty string',
        'mediaWorkflow.costLevel must be "free", "low", "medium", or "high"',
        'mediaWorkflow.riskLevel must be "low", "medium", "high", or "destructive"',
      ]),
    );
  });
});
