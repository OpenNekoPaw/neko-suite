import {
  createCanonicalQualityCheckTools,
  createMultimodalPerceptionEvaluator,
  createQualityGateRuntime,
  type MaterializedQualityResource,
  type MediaQualityChatModelRef,
  type MediaQualityLLMService,
  type QualityEvaluator,
  type QualityReviewRequest,
  type QualityTargetMaterializer,
} from '@neko/skills';
import type {
  AgentCapabilityContext,
  AgentCapabilityProvider,
  ModelRefConfig,
  QualityTarget,
  Tool,
} from '@neko/shared';
import type { AgentContentAccessRuntime } from '@neko/agent/runtime';
import {
  collectProjectQualityEvidence,
  type ProjectQualityFacadeResolver,
} from './projectQualityOrchestration';

export interface QualityCapabilityProviderDeps {
  readonly createService: () => MediaQualityLLMService;
  readonly getContentAccessRuntime: () => AgentContentAccessRuntime | undefined;
  readonly projectQualityFacadeResolver: ProjectQualityFacadeResolver;
  readonly resolveModelForPurpose: (
    purpose: QualityUnderstandingPurpose,
  ) => ModelRefConfig | undefined;
}

type QualityUnderstandingPurpose = 'image.understand' | 'audio.understand' | 'video.understand';

export function createQualityCapabilityProvider(
  deps: QualityCapabilityProviderDeps,
): AgentCapabilityProvider {
  return new QualityCapabilityProvider(deps);
}

class QualityCapabilityProvider implements AgentCapabilityProvider {
  readonly id = 'neko-agent-media-quality';
  readonly version = '1.0.0';

  constructor(private readonly deps: QualityCapabilityProviderDeps) {}

  getTools(_context: AgentCapabilityContext): Tool[] {
    return [...createCanonicalQualityCheckTools({ review: (request) => this.review(request) })];
  }

  private async review(request: QualityReviewRequest) {
    const existingEvidence =
      request.target.kind === 'project-artifact'
        ? await collectProjectQualityEvidence(
            request.target,
            this.deps.projectQualityFacadeResolver,
          )
        : request.existingEvidence;
    const runtime = createQualityGateRuntime({
      materializer: createExtensionQualityMaterializer(this.deps.getContentAccessRuntime),
      evaluators: this.createEvaluators(request.target),
    });
    return runtime.review({ ...request, ...(existingEvidence ? { existingEvidence } : {}) });
  }

  private createEvaluators(target: QualityTarget): readonly QualityEvaluator[] {
    if (target.kind !== 'image') return [];
    const model = this.deps.resolveModelForPurpose('image.understand');
    return model
      ? [
          createMultimodalPerceptionEvaluator({
            createService: this.deps.createService,
            chatModel: toChatModel(model),
          }),
        ]
      : [];
  }
}

function createExtensionQualityMaterializer(
  getContentAccessRuntime: () => AgentContentAccessRuntime | undefined,
): QualityTargetMaterializer {
  return {
    materialize: async (input): Promise<MaterializedQualityResource> => {
      if (!input.target.resourceRef) {
        throw new Error(
          'quality-materialization-unavailable: Project targets require an owning ProjectQuality facade.',
        );
      }
      const runtime = getContentAccessRuntime();
      if (!runtime) {
        throw new Error(
          'quality-materialization-unavailable: Agent content access runtime is unavailable.',
        );
      }
      const loaded = await runtime.loadProviderAsset({
        caller: 'quality-review',
        source: input.target.resourceRef,
        preferredTarget: input.representation === 'base64' ? 'bytes' : 'local-path',
        metadata: {
          qualityTargetId: input.target.targetId,
          qualityConsumer: input.consumer,
        },
      });
      if (loaded.status !== 'ready') {
        throw new Error(
          loaded.diagnostics.find((diagnostic) => diagnostic.severity === 'error')?.message ??
            `quality-materialization-failed: ${loaded.status}`,
        );
      }
      if (input.representation === 'base64') {
        if (!loaded.bytes || !loaded.mimeType) {
          throw new Error(
            'quality-materialization-failed: Provider materialization requires bytes and mimeType.',
          );
        }
        return {
          resourceRef: input.target.resourceRef,
          base64: Buffer.from(loaded.bytes).toString('base64'),
          mimeType: loaded.mimeType,
        };
      }
      if (!loaded.uri) {
        throw new Error(
          'quality-materialization-failed: Technical materialization requires a local source.',
        );
      }
      return {
        resourceRef: input.target.resourceRef,
        source: loaded.uri,
        ...(loaded.mimeType ? { mimeType: loaded.mimeType } : {}),
      };
    },
  };
}

function toChatModel(model: ModelRefConfig): MediaQualityChatModelRef {
  return { providerId: model.providerId, modelId: model.modelId };
}
