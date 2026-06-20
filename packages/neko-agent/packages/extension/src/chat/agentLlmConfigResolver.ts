import type { Platform } from '@neko/platform';
import { projectLlmParameters, type LlmParameterDiagnostic } from '@neko/platform';
import type { AgentLlmConfig, AgentModelSlot, AgentModelSlots, ModelRef } from '@neko-agent/types';
import type { AgentLlmRuntimeOptions } from '@neko/agent/runtime';
import type { ProviderManager } from './providerManager';
import type { SettingsManager } from './settingsManager';

export type AgentLlmConfigDiagnosticCode =
  | 'unsupported-agent-model-slot'
  | 'conflicting-primary-model'
  | 'missing-primary-model'
  | 'missing-primary-provider'
  | 'primary-provider-not-configured'
  | 'primary-model-not-found'
  | 'primary-model-provider-mismatch'
  | 'primary-model-not-llm'
  | 'unsupported-llm-parameter';

export interface AgentLlmConfigDiagnostic {
  readonly code: AgentLlmConfigDiagnosticCode;
  readonly message: string;
  readonly slot?: AgentModelSlot;
  readonly field?: string;
}

export interface ResolveAgentLlmConfigInput {
  readonly sessionMode: string;
  readonly chatModel?: ModelRef<'llm'>;
  readonly agentModels?: AgentModelSlots;
  readonly llmConfig?: AgentLlmConfig;
  readonly settings: SettingsManager;
  readonly providers: ProviderManager;
  readonly platform?: Platform;
}

export type ResolveAgentLlmConfigResult =
  | {
      readonly ok: true;
      readonly chatModel?: ModelRef<'llm'>;
      readonly agentModels?: AgentModelSlots;
      readonly llmConfig?: AgentLlmConfig;
      readonly llmRuntimeOptions?: AgentLlmRuntimeOptions;
    }
  | {
      readonly ok: false;
      readonly diagnostics: readonly AgentLlmConfigDiagnostic[];
    };

const MVP_AGENT_MODEL_SLOTS = new Set<AgentModelSlot>(['primary']);

export function resolveAgentLlmConfigForTurn(
  input: ResolveAgentLlmConfigInput,
): ResolveAgentLlmConfigResult {
  if (input.sessionMode !== 'agent') {
    return { ok: true };
  }

  const diagnostics: AgentLlmConfigDiagnostic[] = [];
  diagnostics.push(...validateUnsupportedSlots(input.agentModels));

  const primaryModel = input.agentModels?.primary;
  if (primaryModel && input.chatModel && !sameModelRef(primaryModel, input.chatModel)) {
    diagnostics.push({
      code: 'conflicting-primary-model',
      slot: 'primary',
      message:
        'Agent primary model conflicts with the legacy chat model selection. Choose one provider/model for this Agent turn.',
    });
  }

  const resolvedPrimary = primaryModel ?? input.chatModel ?? resolveDefaultPrimaryModel(input);
  if (!resolvedPrimary) {
    diagnostics.push({
      code: 'missing-primary-model',
      slot: 'primary',
      message:
        'No Agent primary model is selected. Choose a configured LLM model before sending this Agent message.',
    });
    return { ok: false, diagnostics };
  }

  diagnostics.push(...validatePrimaryModel(input, resolvedPrimary));

  const projection = projectResolvedLlmRuntimeOptions(input, resolvedPrimary);
  if (projection.diagnostics.length > 0) {
    diagnostics.push(...projection.diagnostics);
  }

  if (diagnostics.length > 0) {
    return { ok: false, diagnostics };
  }

  return {
    ok: true,
    chatModel: resolvedPrimary,
    agentModels: { primary: resolvedPrimary },
    ...(input.llmConfig ? { llmConfig: input.llmConfig } : {}),
    ...(projection.runtimeOptions ? { llmRuntimeOptions: projection.runtimeOptions } : {}),
  };
}

export function formatAgentLlmConfigDiagnostics(
  diagnostics: readonly AgentLlmConfigDiagnostic[],
): string {
  return diagnostics.map((diagnostic) => diagnostic.message).join('\n');
}

function validateUnsupportedSlots(
  agentModels: AgentModelSlots | undefined,
): AgentLlmConfigDiagnostic[] {
  if (!agentModels) return [];
  return (Object.keys(agentModels) as AgentModelSlot[])
    .filter((slot) => !MVP_AGENT_MODEL_SLOTS.has(slot))
    .map((slot) => ({
      code: 'unsupported-agent-model-slot' as const,
      slot,
      message: `Agent model slot "${slot}" is defined, but this Agent runtime currently supports only the primary slot.`,
    }));
}

function resolveDefaultPrimaryModel(
  input: ResolveAgentLlmConfigInput,
): ModelRef<'llm'> | undefined {
  const selectedProviderId = input.settings.selectedProviderId ?? undefined;
  const selectedModelId = input.settings.selectedModelId ?? undefined;
  if (selectedProviderId && selectedModelId) {
    return { providerId: selectedProviderId, modelId: selectedModelId, category: 'llm' };
  }

  if (selectedProviderId) {
    const provider = input.providers.getProvider(selectedProviderId);
    if (!provider?.defaultModel) return undefined;
    return {
      providerId: selectedProviderId,
      modelId: provider.defaultModel,
      category: 'llm',
    };
  }

  if (selectedModelId) {
    const model = input.providers.getModel(selectedModelId);
    if (!model) return undefined;
    return {
      providerId: model.providerId,
      modelId: selectedModelId,
      category: 'llm',
    };
  }

  const defaultProvider = input.providers.getDefaultProvider();
  if (!defaultProvider?.id || !defaultProvider.defaultModel) {
    return undefined;
  }

  return {
    providerId: defaultProvider.id,
    modelId: defaultProvider.defaultModel,
    category: 'llm',
  };
}

function validatePrimaryModel(
  input: ResolveAgentLlmConfigInput,
  modelRef: ModelRef<'llm'>,
): AgentLlmConfigDiagnostic[] {
  const diagnostics: AgentLlmConfigDiagnostic[] = [];
  const provider = input.providers.getProvider(modelRef.providerId);
  if (!provider) {
    diagnostics.push({
      code: 'missing-primary-provider',
      slot: 'primary',
      message: `Agent primary provider "${modelRef.providerId}" is not registered.`,
    });
    return diagnostics;
  }

  if (!provider.isConfigured) {
    diagnostics.push({
      code: 'primary-provider-not-configured',
      slot: 'primary',
      message: `Agent primary provider "${modelRef.providerId}" is disabled or not configured.`,
    });
  }

  if (provider.modelIds && !provider.modelIds.includes(modelRef.modelId)) {
    diagnostics.push({
      code: 'primary-model-not-found',
      slot: 'primary',
      message: `Agent primary model "${modelRef.modelId}" is not available from provider "${modelRef.providerId}".`,
    });
  }

  const model = input.providers.getModel(modelRef.modelId);
  if (!model) {
    diagnostics.push({
      code: 'primary-model-not-found',
      slot: 'primary',
      message: `Agent primary model "${modelRef.modelId}" is not registered.`,
    });
    return diagnostics;
  }

  if (model.providerId !== modelRef.providerId) {
    diagnostics.push({
      code: 'primary-model-provider-mismatch',
      slot: 'primary',
      message: `Agent primary model "${modelRef.modelId}" belongs to provider "${model.providerId}", not "${modelRef.providerId}".`,
    });
  }

  if (model.enabled === false || (model.type !== undefined && model.type !== 'llm')) {
    diagnostics.push({
      code: 'primary-model-not-llm',
      slot: 'primary',
      message: `Agent primary model "${modelRef.modelId}" is not an enabled LLM model.`,
    });
  }

  return diagnostics;
}

function projectResolvedLlmRuntimeOptions(
  input: ResolveAgentLlmConfigInput,
  modelRef: ModelRef<'llm'>,
): {
  readonly runtimeOptions?: AgentLlmRuntimeOptions;
  readonly diagnostics: readonly AgentLlmConfigDiagnostic[];
} {
  if (!input.llmConfig || !input.platform) {
    return { diagnostics: [] };
  }

  const provider = input.providers.getProviderConfig(modelRef.providerId);
  const model = input.providers.getModel(modelRef.modelId);
  if (!provider || !model) {
    return { diagnostics: [] };
  }

  const projection = projectLlmParameters({
    provider,
    model,
    llmConfig: input.llmConfig,
  });
  const diagnostics = projection.diagnostics.map(mapLlmParameterDiagnostic);
  const runtimeOptions = removeUndefinedValues({
    temperature: projection.chatOptions.temperature,
    topP: projection.chatOptions.topP,
    maxTokens: projection.chatOptions.maxTokens,
    thinkingBudget: projection.chatOptions.thinkingBudget,
  });

  return {
    ...(Object.keys(runtimeOptions).length > 0 ? { runtimeOptions } : {}),
    diagnostics,
  };
}

function mapLlmParameterDiagnostic(diagnostic: LlmParameterDiagnostic): AgentLlmConfigDiagnostic {
  return {
    code: 'unsupported-llm-parameter',
    field: diagnostic.field,
    message: diagnostic.message,
  };
}

function sameModelRef(a: ModelRef<'llm'>, b: ModelRef<'llm'>): boolean {
  return a.providerId === b.providerId && a.modelId === b.modelId && a.category === b.category;
}

function removeUndefinedValues<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined),
  ) as Partial<T>;
}
