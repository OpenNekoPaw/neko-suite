import type {
  AgentCapabilityDiagnostic,
  AgentMultimodalEvidenceRef,
  GeneratedPromptBundle,
  GeneratedPromptSection,
  GeneratedSchemaPurpose,
  GeneratedStructuredSchema,
  PromptGenerationContext,
  PromptSchemaProviderToolMode,
  PromptSchemaStructuredOutputMode,
} from '@neko-agent/types';
import type { ToolDefinition } from '@neko/shared';

export interface AgentPromptSchemaGenerator {
  generate(context: PromptGenerationContext): GeneratedPromptBundle;
}

export function createAgentPromptSchemaGenerator(): AgentPromptSchemaGenerator {
  return new DefaultAgentPromptSchemaGenerator();
}

const DEFAULT_CAPABILITY_FRAGMENT_PRIORITY = 70;
const DEFAULT_PROVIDER_FRAGMENT_PRIORITY = 68;

class DefaultAgentPromptSchemaGenerator implements AgentPromptSchemaGenerator {
  generate(context: PromptGenerationContext): GeneratedPromptBundle {
    if (context.ablation?.disablePromptSchemaGenerator) {
      const diagnostics = [
        promptSchemaDiagnostic(
          'generator-disabled',
          'Prompt/schema generation is disabled by ablation.',
        ),
      ];
      return {
        prompt: context.basePrompt,
        sections: [
          {
            id: 'base',
            layer: 'base',
            content: context.basePrompt,
            priority: 100,
          },
        ],
        schemaBundle: createSchemaBundle(context, diagnostics),
        diagnostics,
        snapshot: {
          promptHash: stableHash(context.basePrompt),
          schemaHash: stableHash(createSchemaBundle(context, diagnostics)),
        },
      };
    }

    const diagnostics: AgentCapabilityDiagnostic[] = [];
    const sections = buildPromptSections(context, diagnostics);
    const prompt = composePromptSections(sections);
    const schemaBundle = createSchemaBundle(context, diagnostics);

    return {
      prompt,
      sections,
      schemaBundle,
      diagnostics,
      snapshot: {
        promptHash: stableHash(sections),
        schemaHash: stableHash(schemaBundle),
      },
    };
  }
}

function buildPromptSections(
  context: PromptGenerationContext,
  diagnostics: AgentCapabilityDiagnostic[],
): readonly GeneratedPromptSection[] {
  const sections: GeneratedPromptSection[] = [
    {
      id: 'base',
      layer: 'base',
      content: context.basePrompt,
      priority: 100,
    },
  ];

  const workflowSection = renderWorkflowSection(context);
  if (workflowSection) {
    sections.push({
      id: 'creation:idc-profile',
      layer: 'schema',
      content: workflowSection,
      priority: 95,
    });
  }

  const profileProjectionSection = renderProfileProjectionSection(context);
  if (profileProjectionSection) {
    sections.push({
      id: 'profiles:resolved',
      layer: 'schema',
      content: profileProjectionSection,
      priority: 92,
    });
  }

  const structuredSchemaHint = renderStructuredSchemaHint(context);
  if (structuredSchemaHint) {
    sections.push({
      id: 'schema:structured-output',
      layer: 'schema',
      content: structuredSchemaHint,
      priority: 85,
    });
  }

  if (!context.ablation?.disablePromptFragments) {
    for (const fragment of context.injectedCapabilities?.promptFragments ?? []) {
      if (!fragment.content.trim()) {
        diagnostics.push(
          promptSchemaDiagnostic(
            'prompt-fragment-skipped',
            'Skipping an empty capability prompt fragment.',
            { fragmentId: fragment.id },
          ),
        );
        continue;
      }
      sections.push({
        id: `capability:${fragment.id}`,
        layer: context.activeSkillId ? 'skill' : 'environment',
        content: fragment.content,
        priority: fragment.priority ?? DEFAULT_CAPABILITY_FRAGMENT_PRIORITY,
      });
    }

    for (const fragment of context.providerPromptFragments ?? []) {
      if (!fragment.content.trim()) {
        diagnostics.push(
          promptSchemaDiagnostic(
            'provider-fragment-skipped',
            'Skipping an empty provider expression fragment.',
            { fragmentId: fragment.id },
          ),
        );
        continue;
      }
      sections.push({
        id: `provider:${fragment.id}`,
        layer: 'environment',
        content: fragment.content,
        priority: fragment.priority ?? DEFAULT_PROVIDER_FRAGMENT_PRIORITY,
      });
    }
  }

  if (context.agentsMdOverlay?.trim()) {
    sections.push({
      id: 'environment:agents-md',
      layer: 'environment',
      content: context.agentsMdOverlay,
      priority: 80,
    });
  }

  const settingsSummary = renderSettingsSummary(context.settings);
  if (settingsSummary) {
    sections.push({
      id: 'environment:settings',
      layer: 'environment',
      content: settingsSummary,
      priority: 50,
    });
  }

  if (context.memoryContextSummary?.trim()) {
    sections.push({
      id: 'ephemeral:memory',
      layer: 'ephemeral',
      content: context.memoryContextSummary,
      priority: 70,
    });
  }

  const evidenceFeedbackSummary = renderEvidenceFeedbackSummary(context.multimodalEvidenceRefs);
  if (evidenceFeedbackSummary) {
    if (
      context.ablation?.disableMultimodalContext ||
      context.ablation?.disableMultimodalEvidenceFeedback
    ) {
      diagnostics.push(
        promptSchemaDiagnostic(
          'multimodal-evidence-feedback-skipped',
          'Multimodal feedback evidence was withheld by ablation.',
        ),
      );
    } else {
      sections.push({
        id: 'ephemeral:multimodal-evidence-feedback',
        layer: 'ephemeral',
        content: evidenceFeedbackSummary,
        priority: 76,
      });
    }
  }

  if (context.multimodalContextSummary?.trim()) {
    if (context.ablation?.disableMultimodalContext) {
      diagnostics.push(
        promptSchemaDiagnostic(
          'multimodal-context-skipped',
          'Multimodal context summary was withheld by ablation.',
        ),
      );
    } else {
      sections.push({
        id: 'ephemeral:multimodal-context',
        layer: 'ephemeral',
        content: context.multimodalContextSummary,
        priority: 75,
      });
    }
  }

  return sortPromptSections(sections);
}

function createSchemaBundle(
  context: PromptGenerationContext,
  diagnostics: AgentCapabilityDiagnostic[],
) {
  const providerToolMode = context.provider?.toolMode ?? 'native';
  const providerStructuredMode = context.provider?.structuredOutputMode ?? 'native';
  const toolAllowlist = resolveToolAllowlist(context);
  const toolSchemas = resolveToolSchemas(context, toolAllowlist, providerToolMode, diagnostics);
  const structuredOutputSchemas = resolveStructuredOutputSchemas(
    context,
    providerStructuredMode,
    diagnostics,
  );

  return {
    toolAllowlist,
    toolSchemas,
    structuredOutputSchemas,
    providerProjection: {
      toolMode: providerToolMode,
      structuredOutputMode: providerStructuredMode,
      ...(providerToolMode === 'prompt-only'
        ? {
            promptOnlyToolInstructions:
              'Native tool calling is unavailable; treat listed tools as JSON request contracts and wait for host mediation.',
          }
        : {}),
    },
  };
}

function resolveToolAllowlist(context: PromptGenerationContext): readonly string[] {
  if (context.ablation?.disableDynamicToolSchemas) {
    return [];
  }
  const injected = context.injectedCapabilities?.allowedTools ?? [];
  const nodeAllowed = context.creation?.allowedToolNames;
  const source =
    nodeAllowed && nodeAllowed.length > 0
      ? injected.filter((toolName) => nodeAllowed.includes(toolName))
      : injected;
  return Array.from(new Set(source)).sort((left, right) => left.localeCompare(right));
}

function resolveToolSchemas(
  context: PromptGenerationContext,
  toolAllowlist: readonly string[],
  providerToolMode: PromptSchemaProviderToolMode,
  diagnostics: AgentCapabilityDiagnostic[],
): readonly ToolDefinition[] {
  if (context.ablation?.disableDynamicToolSchemas) {
    diagnostics.push(
      promptSchemaDiagnostic(
        'tool-schemas-skipped',
        'Dynamic tool schemas were withheld by ablation.',
      ),
    );
    return [];
  }
  if (providerToolMode === 'none') {
    if (toolAllowlist.length > 0) {
      diagnostics.push(
        promptSchemaDiagnostic(
          'provider-incompatible-tool-schemas',
          'Selected provider does not support tool schema projection.',
        ),
      );
    }
    return [];
  }

  const schemasByName = new Map(
    (context.toolSchemas ?? []).map((schema) => [schema.function.name, schema]),
  );
  const selected: ToolDefinition[] = [];
  for (const toolName of toolAllowlist) {
    const schema = schemasByName.get(toolName);
    if (!schema) {
      diagnostics.push(
        promptSchemaDiagnostic(
          'tool-schema-skipped',
          'Skipping an allowed tool because no schema was registered.',
          { toolName },
        ),
      );
      continue;
    }
    selected.push(schema);
  }
  return selected;
}

function resolveStructuredOutputSchemas(
  context: PromptGenerationContext,
  providerStructuredMode: PromptSchemaStructuredOutputMode,
  diagnostics: AgentCapabilityDiagnostic[],
): readonly GeneratedStructuredSchema[] {
  if (context.ablation?.disableStructuredOutputSchemas) {
    diagnostics.push(
      promptSchemaDiagnostic(
        'structured-schemas-skipped',
        'Structured output schemas were withheld by ablation.',
      ),
    );
    return [];
  }
  if (providerStructuredMode === 'unsupported') {
    diagnostics.push(
      promptSchemaDiagnostic(
        'provider-incompatible-structured-output',
        'Selected provider cannot consume structured output schemas.',
      ),
    );
    return [];
  }

  const purposes = context.requestedSchemaPurposes ?? inferSchemaPurposes(context);
  return purposes.map((purpose) => createStructuredSchema(purpose, context));
}

function inferSchemaPurposes(context: PromptGenerationContext): readonly GeneratedSchemaPurpose[] {
  switch (context.creation?.stage) {
    case 'draft':
      return ['idc-draft'];
    case 'plan':
      return ['idc-plan'];
    case 'apply':
      return ['idc-apply'];
    default:
      return context.creation?.stage ? ['creation-stage-output'] : [];
  }
}

function createStructuredSchema(
  purpose: GeneratedSchemaPurpose,
  context: PromptGenerationContext,
): GeneratedStructuredSchema {
  return {
    id: `schema:${purpose}`,
    purpose,
    version: '1.0',
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        kind: { const: purpose },
        creationId: { type: 'string' },
        iterationId: { type: 'string' },
        stageId: { type: 'string' },
        summary: { type: 'string' },
        artifacts: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              type: { type: 'string' },
              uri: { type: 'string' },
            },
            required: ['id', 'type'],
          },
        },
        decisions: {
          type: 'array',
          items: { type: 'string' },
        },
        metrics: {
          type: 'object',
          additionalProperties: true,
        },
      },
      required: ['kind', 'summary'],
      metadata: {
        creationId: context.creation?.creationId,
        iterationId: context.creation?.iterationId,
        stageId: context.creation?.stage,
        legacyTrace: context.creation?.legacyTrace,
      },
    },
  };
}

function renderWorkflowSection(context: PromptGenerationContext): string | null {
  const creation = context.creation;
  if (!creation) return null;

  const lines = [
    '## Creation Profile Guidance',
    `- Plan mode: ${creation.planMode ? 'enabled' : 'disabled'}`,
    creation.profileId ? `- Creation profile: ${creation.profileId}` : null,
    creation.stage ? `- Creation stage: ${creation.stage}` : null,
    creation.creationId ? `- Creation id: ${creation.creationId}` : null,
    creation.iterationId ? `- Iteration id: ${creation.iterationId}` : null,
    creation.legacyTrace?.workflowNodeId
      ? `- Legacy trace node: ${creation.legacyTrace.workflowNodeId}`
      : null,
  ].filter((line): line is string => Boolean(line));

  if (creation.planMode) {
    lines.push(
      '- Follow creation profile guidance: Draft clarifies intent, Plan decomposes work, Apply executes verified changes.',
    );
  }

  return lines.join('\n');
}

function renderProfileProjectionSection(context: PromptGenerationContext): string | null {
  const profiles = context.profiles;
  if (!profiles) return null;

  const lines = ['## Profile Projection'];

  if (profiles.skillProfileReferences && profiles.skillProfileReferences.length > 0) {
    lines.push(
      `- Skill profile references: ${profiles.skillProfileReferences
        .map(
          (reference) =>
            `${reference.relationship}:${reference.kind}:${reference.profileId}${
              reference.versionRange ? `@${reference.versionRange}` : ''
            }`,
        )
        .join(', ')}`,
    );
  }

  if (profiles.creationProfile) {
    lines.push(
      `- Creation profile: ${profiles.creationProfile.profileId}@${profiles.creationProfile.version}`,
    );
    lines.push(
      `- Creation stages: ${profiles.creationProfile.stages
        .map((stage) => stage.stageId)
        .join(' -> ')}`,
    );
  }

  if (profiles.artifactProfiles && profiles.artifactProfiles.length > 0) {
    lines.push(
      `- Artifact profiles: ${profiles.artifactProfiles
        .map((profile) => `${profile.profileId}@${profile.version} (${profile.protocol})`)
        .join(', ')}`,
    );
  }

  if (profiles.providerExpressionProfiles && profiles.providerExpressionProfiles.length > 0) {
    lines.push(
      `- Provider expression profiles: ${profiles.providerExpressionProfiles
        .map((profile) =>
          [
            `${profile.profileId}@${profile.version}`,
            profile.modelId ? `${profile.providerId}/${profile.modelId}` : profile.providerId,
            profile.capabilities.join('+'),
          ].join(' '),
        )
        .join(', ')}`,
    );
  }

  return lines.length > 1 ? lines.join('\n') : null;
}

function renderEvidenceFeedbackSummary(
  evidenceRefs: readonly AgentMultimodalEvidenceRef[] | undefined,
): string | null {
  if (!evidenceRefs || evidenceRefs.length === 0) return null;

  const included = evidenceRefs.filter((evidence) => !evidence.withheld);
  const withheld = evidenceRefs.filter((evidence) => evidence.withheld);
  const lines = ['## Feedback Evidence'];
  lines.push(
    `- Included: ${
      included.length > 0
        ? included.map((evidence) => formatEvidenceSummary(evidence)).join('; ')
        : 'none'
    }`,
  );
  lines.push(
    `- Withheld: ${
      withheld.length > 0
        ? withheld
            .map(
              (evidence) =>
                `${formatEvidenceSummary(evidence)} (${evidence.withheldReason ?? 'policy'})`,
            )
            .join('; ')
        : 'none'
    }`,
  );
  return lines.join('\n');
}

function formatEvidenceSummary(evidence: AgentMultimodalEvidenceRef): string {
  const source = evidence.toolCallId
    ? `${evidence.source}/${evidence.toolCallId}`
    : evidence.source;
  const summary = evidence.summary ? `: ${evidence.summary}` : '';
  return `${evidence.id} [${evidence.modality}, ${source}]${summary}`;
}

function renderStructuredSchemaHint(context: PromptGenerationContext): string | null {
  const purposes = context.requestedSchemaPurposes ?? inferSchemaPurposes(context);
  if (purposes.length === 0 || context.ablation?.disableStructuredOutputSchemas) return null;
  return [
    '## Structured Output Contract',
    `- Expected schema purposes: ${purposes.join(', ')}`,
    '- Return machine-readable JSON when a creation stage explicitly asks for a structured artifact.',
  ].join('\n');
}

function renderSettingsSummary(
  settings: Readonly<Record<string, unknown>> | undefined,
): string | null {
  if (!settings || Object.keys(settings).length === 0) return null;
  return [
    '## Runtime Settings',
    ...Object.entries(settings)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => `- ${key}: ${formatSettingValue(value)}`),
  ].join('\n');
}

function formatSettingValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value === null) return 'null';
  return JSON.stringify(value);
}

function composePromptSections(sections: readonly GeneratedPromptSection[]): string {
  return sections
    .map((section) => section.content)
    .filter(Boolean)
    .join('\n\n---\n\n');
}

function sortPromptSections(
  sections: readonly GeneratedPromptSection[],
): readonly GeneratedPromptSection[] {
  const layerOrder = new Map([
    ['base', 0],
    ['schema', 1],
    ['skill', 2],
    ['environment', 3],
    ['ephemeral', 4],
  ]);

  return [...sections].sort(
    (left, right) =>
      (layerOrder.get(left.layer) ?? 99) - (layerOrder.get(right.layer) ?? 99) ||
      right.priority - left.priority ||
      left.id.localeCompare(right.id),
  );
}

function promptSchemaDiagnostic(
  reason: string,
  message: string,
  metadata?: Record<string, unknown>,
): AgentCapabilityDiagnostic {
  return {
    phase: 'injection',
    code: `agent.prompt-schema.${reason}`,
    reason,
    message,
    ...(metadata ? { metadata } : {}),
  };
}

function stableHash(value: unknown): string {
  const text = typeof value === 'string' ? value : stableStringify(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
