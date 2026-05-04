import { describe, expect, it } from 'vitest';
import type { AgentInjectedCapabilitySet, PromptGenerationContext } from '@neko-agent/types';
import type { ToolDefinition } from '@neko/shared';
import { createAgentPromptSchemaGenerator } from '../agent-prompt-schema-generator';

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
    workflowFragments: [],
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
      workflow: {
        identity: {
          workflowDefinitionId: 'idc',
          workflowRunId: 'run-1',
          workflowNodeId: 'plan',
        },
        stage: 'plan',
        nodeId: 'plan',
        nodeKind: 'prompt',
        planMode: true,
        allowedToolNames: ['write_plan'],
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
      'workflow:idc-profile',
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

      ## Runtime Workflow Profile
      - Plan mode: enabled
      - IDC stage: plan
      - Workflow node: plan
      - Node kind: prompt
      - Follow IDC order: Draft clarifies intent, Plan decomposes work, Apply executes verified changes.

      ---

      ## Structured Output Contract
      - Expected schema purposes: idc-plan
      - Return machine-readable JSON when a workflow node explicitly asks for a structured artifact.

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
    expect(bundle.snapshot).toEqual({ promptHash: 'af4d7556', schemaHash: '19b94944' });
  });

  it('projects prompt-only tool instructions for providers without native tool calls', () => {
    const bundle = generate({
      basePrompt: 'BASE',
      injectedCapabilities: injected({ allowedTools: ['write_plan'] }),
      toolSchemas: [toolSchema],
      provider: { toolMode: 'prompt-only', structuredOutputMode: 'prompt-json' },
      requestedSchemaPurposes: ['workflow-node-output'],
    });

    expect(bundle.schemaBundle.toolSchemas).toEqual([toolSchema]);
    expect(bundle.schemaBundle.providerProjection).toMatchObject({
      toolMode: 'prompt-only',
      structuredOutputMode: 'prompt-json',
      promptOnlyToolInstructions:
        'Native tool calling is unavailable; treat listed tools as JSON request contracts and wait for host mediation.',
    });
  });

  it('reports skipped fragments, missing tool schemas, provider incompatibility, and multimodal ablation', () => {
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
      ablation: { disableMultimodalContext: true, disableMultimodalEvidenceFeedback: true },
    });

    expect(bundle.schemaBundle.toolSchemas).toEqual([]);
    expect(bundle.schemaBundle.structuredOutputSchemas).toEqual([]);
    expect(bundle.diagnostics.map((diagnostic) => diagnostic.reason)).toEqual([
      'prompt-fragment-skipped',
      'provider-fragment-skipped',
      'multimodal-evidence-feedback-skipped',
      'multimodal-context-skipped',
      'provider-incompatible-tool-schemas',
      'provider-incompatible-structured-output',
    ]);
  });

  it('can disable prompt/schema generation through ablation without host dependencies', () => {
    const bundle = generate({
      basePrompt: 'BASE',
      injectedCapabilities: injected({
        promptFragments: [{ id: 'skill:test', content: 'SKILL' }],
        allowedTools: ['write_plan'],
      }),
      toolSchemas: [toolSchema],
      ablation: { disablePromptSchemaGenerator: true },
    });

    expect(bundle.prompt).toBe('BASE');
    expect(bundle.sections).toEqual([
      { id: 'base', layer: 'base', content: 'BASE', priority: 100 },
    ]);
    expect(bundle.diagnostics).toEqual([
      {
        phase: 'injection',
        code: 'agent.prompt-schema.generator-disabled',
        reason: 'generator-disabled',
        message: 'Prompt/schema generation is disabled by ablation.',
      },
    ]);
  });
});
