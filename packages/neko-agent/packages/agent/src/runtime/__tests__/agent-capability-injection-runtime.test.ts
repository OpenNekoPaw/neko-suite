import { describe, expect, it } from 'vitest';
import {
  createAgentCapabilityInjectionRuntime,
  normalizeManifestCapability,
  normalizeSkillScanCapabilities,
  normalizeSkillCapability,
  validateCapabilityContribution,
} from '../capability/agent-capability-injection-runtime';
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
        skill('local-review', { source: 'project', directoryPath: '.agents/skills/local-review' }),
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
      identity: { sourceId: '.agents/skills/local-review' },
      metadata: { skillSource: 'project', directoryPath: '.agents/skills/local-review' },
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
      promptChainFragments: [{ id: '' }],
      hostRequirements: [{ host: 'vscode' }],
      permissionRequirements: [{ scope: '' }],
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

  it('registers artifact facets as lightweight discoverable metadata', () => {
    const runtime = createAgentCapabilityInjectionRuntime();

    const projection = runtime.register({
      identity: {
        id: 'provider:canvas',
        source: 'provider',
        sourceId: 'neko-canvas',
        trustLevel: 'core',
      },
      artifactFacets: {
        protocols: [
          {
            id: 'protocol:CompositeArtifact',
            artifactKind: 'CompositeArtifact',
            schemaVersion: 1,
            validatorId: 'neko.shared.validateCompositeArtifact',
            rendererIds: ['renderer:generic-artifact'],
          },
        ],
        profiles: [
          {
            id: 'profile:media-production.shot-image-prep',
            profileId: 'media-production.shot-image-prep',
            protocol: 'GenericTable',
            version: 1,
            descriptorRef: '${WORKSPACE}/.agents/skills/comic/profiles/asset-prep.profile.json',
          },
        ],
        renderers: [
          {
            id: 'renderer:generic-artifact',
            accepts: ['CompositeArtifact', 'GenericTable'],
            profiles: ['media-production.shot-image-prep'],
            lazy: true,
          },
        ],
        lifecycleCapabilities: [
          {
            capabilityId: 'canvas.ingestMarkdown',
            providerId: 'neko-canvas',
            displayName: 'Ingest Markdown to Canvas',
            description: 'Ingest a review-first semantic storyboard table from Markdown.',
            phases: ['review'],
            inputSchema: { id: 'canvas.markdown.input', version: 1 },
            resultSchema: { id: 'agent.capability.lifecycle.result', version: 1 },
            accepts: ['markdown', 'gfm-table'],
            produces: ['canvas.table'],
            risk: 'medium',
            requiresApproval: true,
            safetyKind: 'confirmation-gated',
          },
        ],
      },
    });

    expect(projection.artifactFacets?.protocols?.map((item) => item.id)).toEqual([
      'protocol:CompositeArtifact',
    ]);
    expect(runtime.getArtifactFacets().projectors).toEqual([]);
    expect(runtime.findArtifactCapabilities('canvas.importStoryboard')).toEqual([]);
    expect(runtime.getArtifactFacets().lifecycleCapabilities).toEqual([
      expect.objectContaining({
        capabilityId: 'canvas.ingestMarkdown',
        phases: ['review'],
        requiresApproval: true,
      }),
    ]);

    const injected = runtime.inject({ host: 'vscode' });
    expect(injected.promptFragments).toEqual([]);
    expect(injected.allowedTools).toEqual([]);
  });

  it('filters artifact execution capabilities through host, trust, and approval policy', () => {
    const runtime = createAgentCapabilityInjectionRuntime();
    runtime.registerMany([
      {
        identity: {
          id: 'provider:canvas',
          source: 'provider',
          sourceId: 'neko-canvas',
          trustLevel: 'core',
        },
        hostRequirements: [{ host: 'vscode' }],
        permissionRequirements: [{ scope: 'canvas.write', mode: 'write', approvalRequired: true }],
        artifactFacets: {
          capabilities: [
            {
              capabilityId: 'timeline.importStoryboard',
              packageId: 'neko-cut',
              accepts: ['CutStoryboardImportPayload'],
              actions: ['timeline.importStoryboard'],
              risk: 'medium',
              requiresApproval: true,
            },
          ],
        },
      },
      {
        identity: {
          id: 'provider:third-party-video',
          source: 'plugin',
          sourceId: 'video-plugin',
          trustLevel: 'untrusted',
        },
        artifactFacets: {
          capabilities: [
            {
              capabilityId: 'video.generateFromArtifact',
              packageId: 'video-plugin',
              accepts: ['CompositeArtifact'],
              actions: ['video.generateFromArtifact'],
              risk: 'high',
              requiresApproval: true,
            },
          ],
        },
      },
    ]);

    expect(runtime.findArtifactCapabilities('timeline.importStoryboard', { host: 'cli' })).toEqual(
      [],
    );
    expect(
      runtime.findArtifactCapabilities('timeline.importStoryboard', {
        host: 'vscode',
        permissionPolicy: { approvedContributionIds: ['provider:canvas'] },
      }),
    ).toHaveLength(1);
    expect(
      runtime.findArtifactCapabilities('video.generateFromArtifact', {
        host: 'vscode',
        allowedTrustLevels: ['core', 'community'],
      }),
    ).toEqual([]);
  });

  it('diagnoses invalid artifact facet metadata at registration', () => {
    const runtime = createAgentCapabilityInjectionRuntime();

    runtime.register({
      identity: {
        id: 'provider:bad-artifact',
        source: 'provider',
        sourceId: 'bad-artifact',
        trustLevel: 'core',
      },
      artifactFacets: {
        protocols: [
          {
            id: '',
            artifactKind: '',
            schemaVersion: Number.NaN,
            validatorId: '',
          },
        ],
        renderers: [{ id: '', accepts: [] }],
        projectors: [{ id: '', accepts: [], produces: [] }],
        capabilities: [
          {
            capabilityId: '',
            packageId: '',
            accepts: [],
            actions: [],
            risk: 'unsafe' as never,
            requiresApproval: 'yes' as never,
          },
        ],
        lifecycleCapabilities: [
          {
            capabilityId: 'canvas.badLifecycle',
            providerId: 'neko-canvas',
            displayName: 'Bad lifecycle',
            description: 'Invalid lifecycle descriptor',
            phases: ['review', 'publish' as never],
            inputSchema: { id: '' },
            resultSchema: { id: 'result' },
            risk: 'unsafe' as never,
            requiresApproval: 'yes' as never,
          },
        ],
      },
    });

    expect(runtime.getDiagnostics('registration').map((item) => item.reason)).toEqual(
      expect.arrayContaining([
        'missing-required-field',
        'invalid-integer-field',
        'invalid-string-array-field',
        'invalid-artifact-risk',
        'invalid-artifact-approval',
        'invalid-lifecycle-phases',
        'invalid-lifecycle-input-schema',
        'invalid-lifecycle-risk',
        'invalid-lifecycle-approval',
        'invalid-lifecycle-descriptor',
      ]),
    );
  });

  it('does not turn Skill or Profile capability references into providers', () => {
    const runtime = createAgentCapabilityInjectionRuntime();

    runtime.register({
      identity: {
        id: 'profile:media-production/from-comic',
        source: 'market',
        sourceId: 'media-production/from-comic',
        trustLevel: 'community',
      },
      metadata: {
        mediaWorkflow: {
          producedArtifacts: ['CompositeArtifact'],
          artifactProfiles: ['media-production.shot-image-prep'],
          referencedCapabilities: ['canvas.ingestMarkdown'],
          suggestedProjectors: ['capability:canvas.ingestMarkdown'],
        },
      },
    });

    expect(runtime.getArtifactFacets().capabilities).toEqual([]);
    expect(runtime.findArtifactCapabilities('canvas.ingestMarkdown')).toEqual([]);
  });

  it('registers entity memory and semantic index facets as discoverable metadata', () => {
    const runtime = createAgentCapabilityInjectionRuntime();

    const projection = runtime.register({
      identity: {
        id: 'provider:semantic',
        source: 'provider',
        sourceId: 'neko-semantic',
        trustLevel: 'core',
      },
      artifactFacets: {
        entityMemoryContributors: [
          {
            id: 'entity-memory:comic',
            packageId: 'neko-agent',
            sourceKinds: ['comic', 'agent'],
            contributionKinds: ['characterObservation', 'mediaTextSegment'],
            reviewPolicies: ['draft-only', 'requires-user-review', 'source-approved'],
            actions: ['entityMemory.contribute'],
            risk: 'low',
            requiresApproval: false,
          },
        ],
        mediaTextExtractors: [
          {
            id: 'media-text:ocr',
            packageId: 'runtime-media',
            textKinds: ['ocr'],
            sourceKinds: ['comic', 'document'],
            modalities: ['image'],
            supportsBoundingBoxes: true,
            actions: ['mediaText.extract'],
          },
        ],
        semanticIndexProviders: [
          {
            id: 'semantic-index:project',
            packageId: 'neko-search',
            partitions: ['semantic-evidence'],
            sourceKinds: ['comic', 'video', 'audio', 'document'],
            supportsVector: true,
            supportsRag: true,
          },
        ],
        reviewSurfaces: [
          {
            id: 'review:agent-artifact',
            packageId: 'neko-agent',
            surfaceKinds: ['artifact'],
            actions: ['accept', 'reject', 'conflict', 'supersede'],
            requiresApproval: true,
          },
        ],
      },
    });

    expect(projection.artifactFacets?.entityMemoryContributors?.map((item) => item.id)).toEqual([
      'entity-memory:comic',
    ]);
    expect(runtime.getArtifactFacets().semanticIndexProviders?.[0]).toMatchObject({
      id: 'semantic-index:project',
      supportsVector: true,
    });

    const injected = runtime.inject({ host: 'vscode' });
    expect(injected.promptFragments).toEqual([]);
    expect(injected.allowedTools).toEqual([]);
  });

  it('filters semantic facets through host and trust policy without deleting registry metadata', () => {
    const runtime = createAgentCapabilityInjectionRuntime();

    runtime.registerMany([
      {
        identity: {
          id: 'provider:dashboard-review',
          source: 'provider',
          sourceId: 'neko-dashboard',
          trustLevel: 'core',
        },
        hostRequirements: [{ host: 'vscode' }],
        artifactFacets: {
          reviewSurfaces: [
            {
              id: 'review:dashboard',
              packageId: 'neko-dashboard',
              surfaceKinds: ['dashboard'],
              actions: ['accept'],
            },
          ],
        },
      },
      {
        identity: {
          id: 'plugin:semantic',
          source: 'plugin',
          sourceId: 'third-party-semantic',
          trustLevel: 'untrusted',
        },
        artifactFacets: {
          semanticIndexProviders: [
            {
              id: 'semantic-index:third-party',
              packageId: 'third-party-semantic',
              partitions: ['semantic-evidence'],
            },
          ],
        },
      },
    ]);

    expect(runtime.getArtifactFacets().reviewSurfaces).toHaveLength(1);
    expect(runtime.getArtifactFacets().semanticIndexProviders).toHaveLength(1);
    expect(runtime.getArtifactFacets({ host: 'cli' }).reviewSurfaces).toEqual([]);
    expect(
      runtime.getArtifactFacets({
        host: 'vscode',
        allowedTrustLevels: ['core', 'community'],
      }).semanticIndexProviders,
    ).toEqual([]);
  });

  it('registers perception capability facets through the artifact facet registry', () => {
    const runtime = createAgentCapabilityInjectionRuntime();

    runtime.registerMany([
      {
        identity: {
          id: 'provider:local-perception',
          source: 'provider',
          sourceId: 'neko-local-perception',
          trustLevel: 'core',
        },
        hostRequirements: [{ host: 'vscode' }],
        artifactFacets: {
          perceptionCapabilities: [
            {
              providerId: 'local.ocr',
              source: 'engine',
              tasks: ['ocr', 'panel-detection'],
              supportedMediaKinds: ['comic', 'image'],
              executionMode: 'async-local',
              deviceTier: 'light',
              defaultConcurrency: 2,
              cachePolicy: 'recommended',
              confidenceKind: 'provider-score',
            },
            {
              providerId: 'local.vlm-review',
              source: 'local',
              tasks: ['vlm-review'],
              supportedMediaKinds: ['comic'],
              executionMode: 'async-local',
              deviceTier: 'medium',
              defaultConcurrency: 1,
              cachePolicy: 'recommended',
              confidenceKind: 'none',
              approvalRequired: true,
            },
          ],
        },
      },
    ]);

    expect(
      runtime.getArtifactFacets().perceptionCapabilities?.map((facet) => facet.providerId),
    ).toEqual(['local.ocr', 'local.vlm-review']);
    expect(runtime.getArtifactFacets({ host: 'cli' }).perceptionCapabilities).toEqual([]);
    expect(runtime.inject({ host: 'vscode' }).allowedTools).toEqual([]);
  });

  it('reports semantic facet action availability without executing providers', () => {
    const runtime = createAgentCapabilityInjectionRuntime();

    runtime.registerMany([
      {
        identity: {
          id: 'provider:dashboard-review',
          source: 'provider',
          sourceId: 'neko-dashboard',
          trustLevel: 'core',
        },
        hostRequirements: [{ host: 'vscode' }],
        artifactFacets: {
          reviewSurfaces: [
            {
              id: 'review:dashboard',
              packageId: 'neko-dashboard',
              surfaceKinds: ['dashboard'],
              actions: ['entityMemory.review.accept'],
            },
          ],
        },
      },
    ]);

    expect(runtime.getSemanticFacetActionAvailability('entityMemory.review.accept')).toEqual({
      actionId: 'entityMemory.review.accept',
      available: true,
      facetIds: ['review:dashboard'],
      unavailableFacetIds: [],
    });
    expect(
      runtime.getSemanticFacetActionAvailability('entityMemory.review.accept', { host: 'cli' }),
    ).toEqual({
      actionId: 'entityMemory.review.accept',
      available: false,
      facetIds: [],
      unavailableFacetIds: ['review:dashboard'],
      reason: 'provider-unavailable',
      message:
        'Semantic facet providers declare this action but are unavailable in the current context.',
    });
    expect(runtime.getSemanticFacetActionAvailability('mediaText.extract.ocr')).toEqual({
      actionId: 'mediaText.extract.ocr',
      available: false,
      facetIds: [],
      unavailableFacetIds: [],
      reason: 'missing-provider',
      message: 'No registered semantic facet provider declares this action.',
    });
  });

  it('diagnoses invalid semantic facet metadata at registration', () => {
    const runtime = createAgentCapabilityInjectionRuntime();

    runtime.register({
      identity: {
        id: 'provider:bad-semantic',
        source: 'provider',
        sourceId: 'bad-semantic',
        trustLevel: 'core',
      },
      artifactFacets: {
        entityMemoryContributors: [
          {
            id: '',
            packageId: '',
            sourceKinds: [],
            reviewPolicies: [],
            availability: 'missing' as never,
            risk: 'unsafe' as never,
            requiresApproval: 'yes' as never,
          },
        ],
        perceptionProviders: [
          {
            id: 'perception:bad',
            packageId: 'neko-agent',
            layers: [0, -1.5],
          },
        ],
        perceptionCapabilities: [
          {
            providerId: '',
            source: 'desktop' as never,
            tasks: [],
            supportedMediaKinds: [],
            executionMode: 'worker' as never,
            deviceTier: 'gpu' as never,
            defaultConcurrency: 0,
            cachePolicy: 'always' as never,
            confidenceKind: 'score' as never,
            approvalRequired: 'yes' as never,
          },
        ],
      },
    });

    expect(runtime.getDiagnostics('registration').map((item) => item.reason)).toEqual(
      expect.arrayContaining([
        'missing-required-field',
        'invalid-string-array-field',
        'invalid-facet-availability',
        'invalid-artifact-risk',
        'invalid-artifact-approval',
        'invalid-integer-array-field',
        'invalid-perception-capability-source',
        'invalid-perception-capability-execution-mode',
        'invalid-perception-capability-device-tier',
        'invalid-perception-capability-cache-policy',
        'invalid-perception-capability-confidence-kind',
        'invalid-perception-capability-concurrency',
      ]),
    );
  });

  it('reports deterministic command, tool, prompt, and prompt-chain collisions at registration', () => {
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
        promptChainFragments: [{ id: 'prompt-chain:review' }],
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
        promptChainFragments: [{ id: 'prompt-chain:review' }],
      },
    ]);

    expect(runtime.getDiagnostics('registration').map((item) => item.reason)).toEqual([
      'slash-command-collision',
      'tool-collision',
      'prompt-fragment-collision',
      'prompt-chain-fragment-collision',
    ]);
    expect(runtime.getDiagnostics('registration')[0]?.metadata).toMatchObject({
      winner: 'builtin:review',
    });
  });

  it('skips skill-scoped injection by active skill without blocking provider tools', () => {
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
      {
        identity: {
          id: 'provider:timeline',
          source: 'provider',
          sourceId: 'timeline',
          trustLevel: 'core',
        },
        toolNames: ['timeline_read'],
      },
    ]);

    const injected = runtime.inject({
      host: 'cli',
      activeSkillId: 'skill:selected',
      allowedTrustLevels: ['core', 'community'],
      disabledContributionIds: ['skill:other'],
    });

    expect(injected.contributions.map((item) => item.identity.id)).toEqual([
      'skill:selected',
      'provider:timeline',
    ]);
    expect(injected.allowedTools).toEqual(['timeline_read']);
    expect(injected.diagnostics.map((item) => item.reason)).toEqual([
      'host-requirement',
      'trust-policy',
      'disabled',
    ]);
  });

  it('skips injection by permission policy before prompt/tool injection', () => {
    const runtime = createAgentCapabilityInjectionRuntime();
    runtime.registerMany([
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
      permissionPolicy: { allowedScopes: ['workspace.write'] },
    });

    expect(skipped.contributions.map((item) => item.identity.id)).toEqual(['skill:write']);
    expect(skipped.allowedTools).toEqual(['write_file']);
    expect(skipped.diagnostics.map((item) => item.reason)).toEqual(['permission-policy']);

    const approved = runtime.inject({
      host: 'vscode',
      permissionPolicy: {
        allowedScopes: ['workspace.write', 'workspace.delete'],
        allowIrreversible: true,
      },
    });

    expect(approved.contributions.map((item) => item.identity.id)).toEqual([
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
        unsupportedFields: ['promptChainFragments.experimental'],
      },
    });

    runtime.inject({
      host: 'vscode',
      permissionPolicy: { allowedScopes: [] },
    });
    const snapshot = runtime.getTelemetrySnapshot();
    expect(snapshot.fieldCounts).toMatchObject({
      used: expect.any(Number),
      'unknown-field': 1,
      'unsupported-field': 1,
      'policy-skipped': 1,
    });
    expect(snapshot.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'futurePrompt', reason: 'unknown-field' }),
        expect.objectContaining({
          field: 'promptChainFragments.experimental',
          reason: 'unsupported-field',
        }),
        expect.objectContaining({ reason: 'policy-skipped' }),
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
      kind: 'prompt-chain-fragment-change',
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
        'prompt-chain-fragment-change',
        'provider-card-change',
        'skill-remove',
      ]),
    );
  });
});
