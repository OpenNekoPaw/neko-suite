import type {
  ArtifactProfileDescriptor,
  CreationProfileDescriptor,
  ProviderExpressionProfileDescriptor,
  SkillProfileReference,
  ToolDefinition,
} from '@neko/shared';
import type { AgentCapabilityDiagnostic, AgentInjectedCapabilitySet } from './capability';
import type { AgentMultimodalEvidenceRef } from './multimodal-tooling';
import type { AgentLegacyCreationTrace } from './legacy-trace';

export type PromptSchemaProviderToolMode = 'native' | 'prompt-only' | 'none';
export type PromptSchemaStructuredOutputMode = 'native' | 'prompt-json' | 'unsupported';
export type GeneratedSchemaPurpose =
  | 'idc-draft'
  | 'idc-plan'
  | 'idc-apply'
  | 'creation-stage-output'
  | 'evaluator-output'
  | 'recovery-decision'
  | 'tool-arguments';

export interface PromptGenerationCreationContext {
  readonly creationId?: string;
  readonly iterationId?: string;
  readonly profileId?: string;
  readonly stage?: string;
  readonly planMode?: boolean;
  readonly allowedToolNames?: readonly string[];
  readonly legacyTrace?: AgentLegacyCreationTrace;
}

export interface PromptGenerationProviderCapabilities {
  readonly providerId?: string;
  readonly modelId?: string;
  readonly toolMode?: PromptSchemaProviderToolMode;
  readonly structuredOutputMode?: PromptSchemaStructuredOutputMode;
}

export interface PromptGenerationProfileContext {
  readonly skillProfileReferences?: readonly SkillProfileReference[];
  readonly artifactProfiles?: readonly ArtifactProfileDescriptor[];
  readonly creationProfile?: CreationProfileDescriptor;
  readonly providerExpressionProfiles?: readonly ProviderExpressionProfileDescriptor[];
}

export interface PromptGenerationContext {
  readonly locale?: 'en' | 'zh';
  readonly basePrompt: string;
  readonly agentsMdOverlay?: string;
  readonly settings?: Readonly<Record<string, unknown>>;
  readonly activeSkillId?: string;
  readonly creation?: PromptGenerationCreationContext;
  readonly injectedCapabilities?: AgentInjectedCapabilitySet;
  readonly provider?: PromptGenerationProviderCapabilities;
  readonly providerPromptFragments?: readonly {
    readonly id: string;
    readonly content: string;
    readonly priority?: number;
  }[];
  readonly profiles?: PromptGenerationProfileContext;
  readonly memoryContextSummary?: string;
  readonly multimodalContextSummary?: string;
  readonly multimodalEvidenceRefs?: readonly AgentMultimodalEvidenceRef[];
  readonly toolSchemas?: readonly ToolDefinition[];
  readonly requestedSchemaPurposes?: readonly GeneratedSchemaPurpose[];
}

export interface GeneratedPromptSection {
  readonly id: string;
  readonly layer: 'base' | 'schema' | 'skill' | 'environment' | 'ephemeral';
  readonly content: string;
  readonly priority: number;
}

export interface GeneratedStructuredSchema {
  readonly id: string;
  readonly purpose: GeneratedSchemaPurpose;
  readonly version: string;
  readonly schema: Record<string, unknown>;
}

export interface GeneratedSchemaBundle {
  readonly toolAllowlist: readonly string[];
  readonly toolSchemas: readonly ToolDefinition[];
  readonly structuredOutputSchemas: readonly GeneratedStructuredSchema[];
  readonly providerProjection: {
    readonly toolMode: PromptSchemaProviderToolMode;
    readonly structuredOutputMode: PromptSchemaStructuredOutputMode;
    readonly promptOnlyToolInstructions?: string;
  };
}

export interface GeneratedPromptBundle {
  readonly prompt: string;
  readonly sections: readonly GeneratedPromptSection[];
  readonly schemaBundle: GeneratedSchemaBundle;
  readonly diagnostics: readonly AgentCapabilityDiagnostic[];
  readonly snapshot: {
    readonly promptHash: string;
    readonly schemaHash: string;
  };
}
