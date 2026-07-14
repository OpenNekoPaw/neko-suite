import { describe, expect, it } from 'vitest';
import type { AgentInjectedCapabilitySet, PromptGenerationContext } from '@neko-agent/types';
import type { ToolDefinition } from '@neko/shared';
import { createAgentPromptSchemaGenerator } from '../capability/agent-prompt-schema-generator';

const toolSchema: ToolDefinition = {
  type: 'function',
  function: {
    name: 'write_plan',
    description: 'Write an IDC plan.',
    parameters: {
      type: 'object',
      properties: {
        summary: { type: 'string' },
      },
      required: ['summary'],
    },
  },
};

function injected(overrides: Partial<AgentInjectedCapabilitySet> = {}): AgentInjectedCapabilitySet {
  return {
    contributions: [],
    promptFragments: [],
    allowedTools: [],
    slashCommands: [],
    promptChainFragments: [],
    diagnostics: [],
    ...overrides,
  };
}

function generate(context: PromptGenerationContext) {
  return createAgentPromptSchemaGenerator().generate(context);
}

describe('agent-prompt-schema-generator', () => {
  it('generates deterministic layered prompt and schemas for PlanMode IDC context', () => {
    const bundle = generate({
      basePrompt: 'BASE',
      locale: 'zh',
      agentsMdOverlay: 'AGENTS overlay',
      settings: { executionMode: 'plan', temperature: 0.2 },
      activeSkillId: 'skill:storyboard',
      creation: {
        creationId: 'creation-1',
        iterationId: 'iteration-1',
        profileId: 'idc.default',
        stage: 'plan',
        planMode: true,
        allowedToolNames: ['write_plan'],
        legacyTrace: {
          workflowDefinitionId: 'idc',
          workflowRunId: 'run-1',
          workflowNodeId: 'plan',
        },
      },
      injectedCapabilities: injected({
        promptFragments: [{ id: 'skill:storyboard:prompt', content: 'SKILL PROMPT', priority: 75 }],
        allowedTools: ['write_plan', 'read_file'],
      }),
      providerPromptFragments: [{ id: 'provider:card', content: 'PROVIDER CARD', priority: 68 }],
      memoryContextSummary: 'Memory summary',
      multimodalContextSummary: 'Image + timeline evidence',
      multimodalEvidenceRefs: [
        {
          id: 'evidence-image',
          source: 'tool',
          modality: 'image',
          summary: 'Generated style frame',
          toolCallId: 'tool-1',
        },
        {
          id: 'evidence-video',
          source: 'engine',
          modality: 'video',
          summary: 'Motion score',
          withheld: true,
          withheldReason: 'policy',
        },
      ],
      toolSchemas: [toolSchema],
      provider: {
        providerId: 'mock',
        modelId: 'creative',
        toolMode: 'native',
        structuredOutputMode: 'native',
      },
    });

    expect(bundle.sections.map((section) => section.id)).toEqual([
      'base',
      'creation:idc-profile',
      'schema:structured-output',
      'capability:skill:storyboard:prompt',
      'environment:agents-md',
      'provider:provider:card',
      'environment:settings',
      'ephemeral:multimodal-evidence-feedback',
      'ephemeral:multimodal-context',
      'ephemeral:memory',
    ]);
    expect(bundle.prompt).toMatchInlineSnapshot(`
      "BASE

      ---

      ## Creation Profile Guidance
      - Plan mode: enabled
      - Creation profile: idc.default
      - Creation stage: plan
      - Creation id: creation-1
      - Iteration id: iteration-1
      - Legacy trace node: plan
      - Follow creation profile guidance: Draft clarifies intent, Plan decomposes work, Apply executes verified changes.

      ---

      ## Structured Output Contract
      - Expected schema purposes: idc-plan
      - Return machine-readable JSON when a creation stage explicitly asks for a structured artifact.

      ---

      SKILL PROMPT

      ---

      AGENTS overlay

      ---

      PROVIDER CARD

      ---

      ## Runtime Settings
      - executionMode: plan
      - temperature: 0.2

      ---

      ## Feedback Evidence
      - Included: evidence-image [image, tool/tool-1]: Generated style frame
      - Withheld: evidence-video [video, engine]: Motion score (policy)

      ---

      Image + timeline evidence

      ---

      Memory summary"
    `);
    expect(bundle.schemaBundle.toolAllowlist).toEqual(['write_plan']);
    expect(bundle.schemaBundle.toolSchemas).toEqual([toolSchema]);
    expect(bundle.schemaBundle.structuredOutputSchemas.map((schema) => schema.purpose)).toEqual([
      'idc-plan',
    ]);
    expect(bundle.snapshot).toEqual({ promptHash: 'aa622fed', schemaHash: '022451d8' });
  });

  it('projects prompt-only tool instructions for providers without native tool calls', () => {
    const bundle = generate({
      basePrompt: 'BASE',
      injectedCapabilities: injected({ allowedTools: ['write_plan'] }),
      toolSchemas: [toolSchema],
      provider: { toolMode: 'prompt-only', structuredOutputMode: 'prompt-json' },
      requestedSchemaPurposes: ['creation-stage-output'],
    });

    expect(bundle.schemaBundle.toolSchemas).toEqual([toolSchema]);
    expect(bundle.schemaBundle.providerProjection).toMatchObject({
      toolMode: 'prompt-only',
      structuredOutputMode: 'prompt-json',
      promptOnlyToolInstructions:
        'Native tool calling is unavailable; treat listed tools as JSON request contracts and wait for host mediation.',
    });
  });

  it('projects resolved profiles only when turn assembly supplies profile context', () => {
    const bundle = generate({
      basePrompt: 'BASE',
      profiles: {
        skillProfileReferences: [
          { profileId: 'studio.creation.review', kind: 'creation', relationship: 'requires' },
          { profileId: 'studio.shot-review', kind: 'artifact', relationship: 'produces' },
        ],
        creationProfile: {
          profileId: 'studio.creation.review',
          kind: 'creation',
          version: '1.0.0',
          source: 'package',
          defaultStageId: 'research',
          stages: [
            { stageId: 'research', purpose: 'Research source context.' },
            { stageId: 'review', purpose: 'Review output.' },
          ],
        },
        artifactProfiles: [
          {
            profileId: 'studio.shot-review',
            kind: 'artifact',
            protocol: 'GenericTable',
            version: 1,
            source: 'package',
            columns: [{ columnId: 'shotId', cellType: 'string', required: true }],
          },
        ],
        providerExpressionProfiles: [
          {
            profileId: 'provider-expression:flux',
            kind: 'provider-expression',
            source: 'package',
            providerId: 'flux',
            displayName: 'Flux',
            version: '1.0.0',
            sourceLayer: 'builtin',
            capabilities: ['image.generate'],
            syntaxProfile: { notes: [] },
            conceptCoverage: { entries: [] },
            trainingProfile: {
              styleAffinities: { photorealistic: 3 },
              antiBiasStrategies: [],
            },
          },
        ],
      },
    });

    expect(bundle.sections.map((section) => section.id)).toEqual(['base', 'profiles:resolved']);
    expect(bundle.prompt).toContain('## Profile Projection');
    expect(bundle.prompt).toContain('requires:creation:studio.creation.review');
    expect(bundle.prompt).toContain('Artifact profiles: studio.shot-review@1 (GenericTable)');
    expect(bundle.prompt).toContain('Provider expression profiles: provider-expression:flux@1.0.0');
  });

  it('reports skipped fragments, missing tool schemas, and provider incompatibility', () => {
    const bundle = generate({
      basePrompt: 'BASE',
      multimodalContextSummary: 'Video evidence',
      injectedCapabilities: injected({
        promptFragments: [{ id: 'empty', content: '' }],
        allowedTools: ['missing_tool'],
      }),
      providerPromptFragments: [{ id: 'empty-provider', content: '' }],
      provider: { toolMode: 'none', structuredOutputMode: 'unsupported' },
      requestedSchemaPurposes: ['evaluator-output'],
      multimodalEvidenceRefs: [
        { id: 'evidence-1', source: 'tool', modality: 'image', summary: 'Preview' },
      ],
    });

    expect(bundle.schemaBundle.toolSchemas).toEqual([]);
    expect(bundle.schemaBundle.structuredOutputSchemas).toEqual([]);
    expect(bundle.diagnostics.map((diagnostic) => diagnostic.reason)).toEqual([
      'prompt-fragment-skipped',
      'provider-fragment-skipped',
      'provider-incompatible-tool-schemas',
      'provider-incompatible-structured-output',
    ]);
    expect(bundle.sections.map((section) => section.id)).toEqual([
      'base',
      'schema:structured-output',
      'ephemeral:multimodal-evidence-feedback',
      'ephemeral:multimodal-context',
    ]);
  });
});
