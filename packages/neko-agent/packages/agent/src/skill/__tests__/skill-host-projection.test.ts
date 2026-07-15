import { describe, expect, it } from 'vitest';
import type { NekoSkillHostProjection, Skill } from '@neko/shared';
import {
  projectSkillHostProjection,
  resolveNekoSkillCompatibility,
} from '../skill-host-projection';
import { SkillRegistry } from '../skill-registry';

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    name: 'portable-review',
    description: 'Review a portable package.',
    content: '# Review',
    source: 'project',
    directoryPath: '/workspace/.agents/skills/portable-review',
    enabled: true,
    portableDefinition: {
      name: 'portable-review',
      description: 'Review a portable package.',
      body: '# Review',
    },
    ...overrides,
  };
}

describe('Skill Host projection', () => {
  it('derives source, location, provenance, policy, compatibility, and fingerprint from Host inputs', () => {
    const projection = projectSkillHostProjection(makeSkill());

    expect(projection).toMatchObject({
      source: 'project',
      location: {
        rootId: 'project-agent-skills',
        relativePath: 'portable-review',
      },
      provenance: 'workspace',
      enabled: true,
      editable: true,
      trusted: false,
      compatibility: { state: 'compatible', diagnostics: [] },
      catalogActions: [{ id: 'run' }, { id: 'edit' }, { id: 'reveal' }, { id: 'duplicate' }],
    });
    expect(projection.fingerprint).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('resolves required and optional Neko dependencies against Host availability', () => {
    const compatibility = resolveNekoSkillCompatibility(
      {
        schemaVersion: 1,
        dependencies: {
          capabilities: [
            { id: 'canvas.render', requirement: 'required' },
            { id: 'audio.mix', requirement: 'optional' },
          ],
          profiles: [
            {
              id: 'storyboard-v1',
              kind: 'artifact',
              relationship: 'requires',
            },
            {
              id: 'style-v1',
              kind: 'provider-expression',
              relationship: 'prefers',
            },
          ],
        },
      },
      {
        availableCapabilities: new Set(['audio.mix']),
        availableProfiles: new Set(['style-v1']),
      },
    );

    expect(compatibility.state).toBe('incompatible');
    expect(compatibility.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'skill-required-capability-missing',
          severity: 'error',
        }),
        expect.objectContaining({
          code: 'skill-required-profile-missing',
          severity: 'error',
        }),
      ]),
    );
  });

  it('reports unknown only when required Host availability has not been resolved', () => {
    const compatibility = resolveNekoSkillCompatibility({
      schemaVersion: 1,
      dependencies: {
        capabilities: [{ id: 'canvas.render', requirement: 'required' }],
      },
    });

    expect(compatibility.state).toBe('unknown');
    expect(compatibility.diagnostics[0]).toMatchObject({
      code: 'skill-capability-availability-unknown',
      severity: 'info',
    });
  });

  it('registry replaces pre-populated runtime facts with trusted Host policy', () => {
    const poisonedProjection: NekoSkillHostProjection = {
      source: 'builtin',
      location: { rootId: 'author-root', relativePath: '../../escape' },
      provenance: 'builtin',
      enabled: true,
      editable: false,
      trusted: true,
      compatibility: { state: 'compatible', diagnostics: [] },
      fingerprint: 'author-controlled',
      catalogActions: [{ id: 'run' }],
    };
    const registry = new SkillRegistry({
      resolveHostProjectionContext: () => ({
        enabled: false,
        trusted: false,
        availableCapabilities: new Set(),
      }),
    });

    registry.registerSkill(
      makeSkill({
        hostProjection: poisonedProjection,
        catalog: {
          role: 'standalone',
          source: 'builtin',
          visibility: 'primary',
          editable: false,
          actions: [{ id: 'run' }],
        },
      }),
    );

    const registered = registry.getSkill('portable-review');
    expect(registered?.enabled).toBe(false);
    expect(registered?.hostProjection).toMatchObject({
      source: 'project',
      provenance: 'workspace',
      trusted: false,
      enabled: false,
      editable: true,
      location: {
        rootId: 'project-agent-skills',
        relativePath: 'portable-review',
      },
    });
    expect(registered?.hostProjection?.fingerprint).not.toBe('author-controlled');
    expect(registered?.catalog).toMatchObject({
      source: 'project',
      editable: true,
      actions: [{ id: 'run' }, { id: 'edit' }, { id: 'reveal' }, { id: 'duplicate' }],
    });
  });
});
