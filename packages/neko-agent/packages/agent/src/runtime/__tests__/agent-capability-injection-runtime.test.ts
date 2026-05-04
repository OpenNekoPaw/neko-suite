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

  it('keeps slash command catalog projection side-effect free', () => {
    const runtime = createAgentCapabilityInjectionRuntime();
    runtime.registerMany([
      normalizeSkillCapability({ skill: skill('storyboard'), source: 'market' }),
      {
        identity: {
          id: 'skill:blocked',
          source: 'market',
          sourceId: '@neko/blocked',
          trustLevel: 'community',
        },
        permissionRequirements: [{ scope: 'workspace.write', approvalRequired: true }],
        slashCommands: [{ id: 'cmd-blocked', name: 'blocked' }],
      },
    ]);
    const beforeTelemetry = runtime.getTelemetrySnapshot().events.length;

    for (let index = 0; index < 5; index += 1) {
      expect(
        runtime.projectSlashCommandCatalog({ host: 'vscode' }).map((item) => item.name),
      ).toEqual(['storyboard']);
    }

    expect(runtime.getDiagnostics('injection')).toEqual([]);
    expect(runtime.getTelemetrySnapshot().events).toHaveLength(beforeTelemetry);
  });

  it('bounds retained injection diagnostics and telemetry for long sessions', () => {
    const runtime = createAgentCapabilityInjectionRuntime({
      retention: {
        maxInjectionDiagnostics: 3,
        maxTelemetryEvents: 5,
      },
    });
    runtime.register(
      normalizeSkillCapability({
        skill: skill('blocked', { allowedTools: ['write_file'] }),
        source: 'market',
      }),
    );

    for (let index = 0; index < 10; index += 1) {
      runtime.inject({
        host: 'vscode',
        disabledContributionIds: ['skill:blocked'],
      });
    }

    expect(runtime.getDiagnostics('injection')).toHaveLength(3);
    expect(runtime.getDiagnostics('injection').map((item) => item.reason)).toEqual([
      'disabled',
      'disabled',
      'disabled',
    ]);
    expect(runtime.getTelemetrySnapshot().events).toHaveLength(5);
    expect(new Set(runtime.getTelemetrySnapshot().events.map((event) => event.id)).size).toBe(5);
  });

  it('records capability telemetry separately from registration and injection diagnostics', () => {
    const runtime = createAgentCapabilityInjectionRuntime();
    runtime.register({
      identity: {
        id: 'skill:telemetry',
        source: 'market',
        sourceId: '@neko/telemetry',
        version: '1.0.0',
        trustLevel: 'community',
      },
      promptFragments: [{ id: 'prompt', content: 'Sensitive prompt text' }],
      allowedTools: ['write_file'],
      permissionRequirements: [{ scope: 'workspace.write', mode: 'write', approvalRequired: true }],
      metadata: {
        unknownFields: ['futurePrompt'],
        unsupportedFields: ['workflowFragments.experimental'],
      },
    });

    runtime.inject({
      host: 'vscode',
      permissionPolicy: { allowedScopes: [] },
    });
    runtime.inject({
      host: 'vscode',
      ablation: { disableCapabilityInjection: true },
    });

    const snapshot = runtime.getTelemetrySnapshot();
    expect(snapshot.fieldCounts).toMatchObject({
      used: expect.any(Number),
      'unknown-field': 1,
      'unsupported-field': 1,
      'policy-skipped': 1,
      'ablation-skipped': 1,
    });
    expect(snapshot.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'futurePrompt', reason: 'unknown-field' }),
        expect.objectContaining({
          field: 'workflowFragments.experimental',
          reason: 'unsupported-field',
        }),
        expect.objectContaining({ reason: 'policy-skipped' }),
        expect.objectContaining({ reason: 'ablation-skipped' }),
        expect.objectContaining({ field: 'promptFragments', hash: expect.any(String) }),
      ]),
    );
    expect(JSON.stringify(snapshot.events)).not.toContain('Sensitive prompt text');
  });

  it('records market skill lifecycle and provider/schema/workflow evolution telemetry', () => {
    const runtime = createAgentCapabilityInjectionRuntime();
    const installed = normalizeSkillCapability({
      skill: skill('market-storyboard', { source: 'market', version: '1.0.0' }),
      source: 'market',
      sourceId: '@neko/market-storyboard',
      version: '1.0.0',
    });
    runtime.register(installed);

    runtime.recordTelemetryEvent({
      kind: 'skill-install',
      contributionId: installed.identity.id,
      source: installed.identity.source,
      sourceId: installed.identity.sourceId,
      version: installed.identity.version,
      reason: 'used',
    });
    runtime.recordTelemetryEvent({
      kind: 'skill-update',
      contributionId: installed.identity.id,
      source: installed.identity.source,
      sourceId: installed.identity.sourceId,
      version: '1.1.0',
      reason: 'unsupported-field',
      field: 'providerCard.experimental',
    });
    runtime.recordTelemetryEvent({
      kind: 'schema-change',
      contributionId: installed.identity.id,
      source: installed.identity.source,
      sourceId: installed.identity.sourceId,
      version: '1.1.0',
      reason: 'used',
      hash: 'schema-hash',
    });
    runtime.recordTelemetryEvent({
      kind: 'workflow-fragment-change',
      contributionId: installed.identity.id,
      source: installed.identity.source,
      sourceId: installed.identity.sourceId,
      version: '1.1.0',
      reason: 'used',
      hash: 'workflow-hash',
    });
    runtime.recordTelemetryEvent({
      kind: 'provider-card-change',
      contributionId: installed.identity.id,
      source: installed.identity.source,
      sourceId: installed.identity.sourceId,
      version: '1.1.0',
      reason: 'used',
      hash: 'provider-hash',
    });
    runtime.recordTelemetryEvent({
      kind: 'skill-remove',
      contributionId: installed.identity.id,
      source: installed.identity.source,
      sourceId: installed.identity.sourceId,
      version: '1.1.0',
      reason: 'used',
    });

    expect(runtime.getTelemetrySnapshot().events.map((event) => event.kind)).toEqual(
      expect.arrayContaining([
        'skill-install',
        'skill-update',
        'schema-change',
        'workflow-fragment-change',
        'provider-card-change',
        'skill-remove',
      ]),
    );
  });
});
