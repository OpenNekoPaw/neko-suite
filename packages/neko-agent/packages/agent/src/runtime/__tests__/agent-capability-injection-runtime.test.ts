import { describe, expect, it } from 'vitest';
import {
  createAgentCapabilityInjectionRuntime,
  normalizeManifestCapability,
  normalizeSkillScanCapabilities,
  normalizeSkillCapability,
  validateCapabilityContribution,
} from '../agent-capability-injection-runtime';
import type { Skill } from '@neko/shared';

function skill(name: string, overrides: Partial<Skill> = {}): Skill {
  return {
    name,
    description: `${name} description`,
    content: `${name} prompt`,
    source: 'project',
    enabled: true,
    ...overrides,
  };
}

describe('agent-capability-injection-runtime', () => {
  it('registers market and local skills through one normalized schema', () => {
    const runtime = createAgentCapabilityInjectionRuntime();
    const market = normalizeSkillCapability({
      skill: skill('storyboard', { allowedTools: ['canvas_generate_image'] }),
      source: 'market',
      sourceId: '@neko/storyboard',
      version: '1.2.0',
    });
    const local = normalizeSkillCapability({
      skill: skill('local-review', { allowedTools: ['read_file'] }),
      source: 'local',
    });

    runtime.registerMany([market, local]);
    const injected = runtime.inject({ host: 'vscode' });

    expect(runtime.listRegistered().map((item) => item.identity.source)).toEqual([
      'market',
      'local',
    ]);
    expect(injected.promptFragments.map((fragment) => fragment.id)).toEqual([
      'skill:storyboard:prompt',
      'skill:local-review:prompt',
    ]);
    expect(injected.allowedTools).toEqual(['canvas_generate_image', 'read_file']);
  });

  it('normalizes market-installed and local rescanned skills through one scan path', () => {
    const [builtin, market, local] = normalizeSkillScanCapabilities({
      builtin: [skill('draft')],
      market: [skill('storyboard', { source: 'market', version: '1.2.0' })],
      local: [
        skill('local-review', { source: 'project', directoryPath: '.neko/skills/local-review' }),
      ],
    });

    expect([builtin?.identity.source, market?.identity.source, local?.identity.source]).toEqual([
      'builtin',
      'market',
      'local',
    ]);
    expect(market).toMatchObject({
      identity: {
        id: 'skill:storyboard',
        sourceId: 'storyboard',
        version: '1.2.0',
      },
      metadata: { skillSource: 'market' },
    });
    expect(local).toMatchObject({
      identity: { sourceId: '.neko/skills/local-review' },
      metadata: { skillSource: 'project', directoryPath: '.neko/skills/local-review' },
    });
  });

  it('validates manifest/frontmatter contribution fields during registration', () => {
    const runtime = createAgentCapabilityInjectionRuntime();

    runtime.register({
      identity: {
        id: '',
        source: 'market',
        sourceId: '',
        trustLevel: 'community',
      },
      promptFragments: [{ id: '', content: '' }],
      slashCommands: [{ id: '', name: '' }],
      workflowFragments: [{ id: '' }],
      hostRequirements: [{ host: 'vscode' }],
      permissionRequirements: [{ scope: '' }],
      workflowNodeRequirements: [{}],
    });

    expect(runtime.getDiagnostics('registration').map((item) => item.reason)).toEqual([
      'missing-required-field',
      'missing-required-field',
      'missing-required-field',
      'missing-required-field',
      'missing-required-field',
      'missing-required-field',
      'missing-required-field',
      'missing-required-field',
      'empty-workflow-node-requirement',
    ]);
    expect(
      validateCapabilityContribution({
        identity: {
          id: 'skill:valid',
          source: 'market',
          sourceId: '@neko/valid',
          trustLevel: 'community',
        },
      }),
    ).toEqual([]);
  });

  it('normalizes installed provider manifests without injecting implementations immediately', () => {
    const runtime = createAgentCapabilityInjectionRuntime();

    runtime.register(
      normalizeManifestCapability({
        id: 'neko-cut',
        displayName: 'Neko Cut',
        version: '1.0.0',
        capabilities: [
          {
            type: 'tool',
            name: 'timeline_insert_clip',
            description: 'Insert clip',
            category: 'media',
          },
        ],
      }),
    );

    expect(runtime.listRegistered()[0]).toMatchObject({
      identity: { id: 'provider:neko-cut', source: 'provider' },
      toolNames: ['timeline_insert_clip'],
    });
  });

  it('reports deterministic command, tool, prompt, and workflow collisions at registration', () => {
    const runtime = createAgentCapabilityInjectionRuntime();

    runtime.registerMany([
      {
        identity: {
          id: 'builtin:review',
          source: 'builtin',
          sourceId: 'builtin',
          trustLevel: 'core',
        },
        slashCommands: [{ id: 'cmd-review', name: 'review' }],
        allowedTools: ['read_file'],
        promptFragments: [{ id: 'fragment:review', content: 'review' }],
        workflowFragments: [{ id: 'workflow:review' }],
      },
      {
        identity: {
          id: 'market:review',
          source: 'market',
          sourceId: '@neko/review',
          trustLevel: 'community',
        },
        slashCommands: [{ id: 'cmd-review-market', name: 'review' }],
        allowedTools: ['read_file'],
        promptFragments: [{ id: 'fragment:review', content: 'review 2' }],
        workflowFragments: [{ id: 'workflow:review' }],
      },
    ]);

    expect(runtime.getDiagnostics('registration').map((item) => item.reason)).toEqual([
      'slash-command-collision',
      'tool-collision',
      'prompt-fragment-collision',
      'workflow-fragment-collision',
    ]);
    expect(runtime.getDiagnostics('registration')[0]?.metadata).toMatchObject({
      winner: 'builtin:review',
    });
  });

  it('skips injection by host requirement, trust policy, active skill, and ablation', () => {
    const runtime = createAgentCapabilityInjectionRuntime();
    runtime.registerMany([
      {
        identity: {
          id: 'skill:vscode-only',
          source: 'market',
          sourceId: '@neko/vscode-only',
          trustLevel: 'community',
        },
        hostRequirements: [{ host: 'vscode' }],
      },
      {
        identity: {
          id: 'skill:danger',
          source: 'market',
          sourceId: '@neko/danger',
          trustLevel: 'untrusted',
        },
      },
      normalizeSkillCapability({ skill: skill('selected'), source: 'market' }),
      normalizeSkillCapability({ skill: skill('other'), source: 'market' }),
    ]);

    const injected = runtime.inject({
      host: 'cli',
      activeSkillId: 'skill:selected',
      allowedTrustLevels: ['core', 'community'],
      disabledContributionIds: ['skill:other'],
    });

    expect(injected.contributions.map((item) => item.identity.id)).toEqual(['skill:selected']);
    expect(injected.diagnostics.map((item) => item.reason)).toEqual([
      'host-requirement',
      'trust-policy',
      'disabled',
    ]);

    expect(
      runtime.inject({
        host: 'vscode',
        ablation: { disableCapabilityInjection: true },
      }).contributions,
    ).toEqual([]);
  });

  it('skips injection by workflow node and permission policy before prompt/tool injection', () => {
    const runtime = createAgentCapabilityInjectionRuntime();
    runtime.registerMany([
      {
        identity: {
          id: 'skill:apply-only',
          source: 'market',
          sourceId: '@neko/apply-only',
          trustLevel: 'community',
        },
        workflowNodeRequirements: [{ stages: ['apply'] }],
        promptFragments: [{ id: 'apply', content: 'apply prompt' }],
      },
      {
        identity: {
          id: 'skill:write',
          source: 'market',
          sourceId: '@neko/write',
          trustLevel: 'community',
        },
        permissionRequirements: [{ scope: 'workspace.write', mode: 'write' }],
        allowedTools: ['write_file'],
      },
      {
        identity: {
          id: 'skill:delete',
          source: 'market',
          sourceId: '@neko/delete',
          trustLevel: 'community',
        },
        permissionRequirements: [{ scope: 'workspace.delete', mode: 'irreversible' }],
        allowedTools: ['delete_file'],
      },
    ]);

    const skipped = runtime.inject({
      host: 'vscode',
      workflowStage: 'draft',
      permissionPolicy: { allowedScopes: ['workspace.write'] },
    });

    expect(skipped.contributions.map((item) => item.identity.id)).toEqual(['skill:write']);
    expect(skipped.allowedTools).toEqual(['write_file']);
    expect(skipped.diagnostics.map((item) => item.reason)).toEqual([
      'workflow-node-requirement',
      'permission-policy',
    ]);

    const approved = runtime.inject({
      host: 'vscode',
      workflowStage: 'apply',
      permissionPolicy: {
        allowedScopes: ['workspace.write', 'workspace.delete'],
        allowIrreversible: true,
      },
    });

    expect(approved.contributions.map((item) => item.identity.id)).toEqual([
      'skill:apply-only',
      'skill:write',
      'skill:delete',
    ]);
  });

  it('enforces tool budgets before injection', () => {
    const runtime = createAgentCapabilityInjectionRuntime();
    runtime.register(
      normalizeSkillCapability({
        skill: skill('media', { allowedTools: ['image_generate', 'video_generate'] }),
        source: 'market',
      }),
    );

    const injected = runtime.inject({ host: 'vscode', toolBudget: 1 });

    expect(injected.allowedTools).toEqual(['image_generate']);
    expect(injected.diagnostics.at(-1)).toMatchObject({ reason: 'tool-budget' });
  });

  it('projects Webview slash command catalogs from runtime injection state', () => {
    const runtime = createAgentCapabilityInjectionRuntime();
    runtime.registerMany([
      normalizeSkillCapability({ skill: skill('storyboard'), source: 'market' }),
      {
        identity: {
          id: 'skill:cli-only',
          source: 'market',
          sourceId: '@neko/cli-only',
          trustLevel: 'community',
        },
        hostRequirements: [{ host: 'cli' }],
        slashCommands: [{ id: 'cmd-cli-only', name: 'cli-only' }],
      },
    ]);

    expect(runtime.projectSlashCommandCatalog({ host: 'vscode' }).map((item) => item.name)).toEqual(
      ['storyboard'],
    );
    expect(runtime.getDiagnostics('injection')).toEqual([]);
  });
});
