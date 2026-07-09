import { mergeCreationExecutionMetadata } from '@neko/agent';
import type { ChatModelOption } from '@neko/shared';

type TuiMediaCategory = 'image' | 'video' | 'audio';

type TuiMediaModelDefaults = Partial<Record<TuiMediaCategory, string>>;

interface RuntimeMediaModelRef {
  readonly providerId: string;
  readonly modelId: string;
  readonly providerExpressionProfileId?: string;
}

type RuntimeMediaModelRefs = Partial<Record<TuiMediaCategory, RuntimeMediaModelRef>>;

export function mergeTuiMediaModelMetadata(
  metadata: Record<string, unknown> | undefined,
  defaults: TuiMediaModelDefaults | undefined,
  defaultProviderId: string,
  modelOptions: readonly ChatModelOption[] = [],
): Record<string, unknown> | undefined {
  const mediaModels = buildTuiMediaModelMetadata(defaults, defaultProviderId, modelOptions);
  if (Object.keys(mediaModels).length === 0) {
    return metadata;
  }
  return mergeCreationExecutionMetadata(metadata ?? {}, { mediaModels });
}

export function buildTuiMediaModelMetadata(
  defaults: TuiMediaModelDefaults | undefined,
  defaultProviderId: string,
  modelOptions: readonly ChatModelOption[] = [],
): RuntimeMediaModelRefs {
  const mediaModels: RuntimeMediaModelRefs = {};
  for (const category of ['image', 'video', 'audio'] as const) {
    const ref = parseTuiMediaModelRef(
      defaults?.[category],
      defaultProviderId,
      category,
      modelOptions,
    );
    if (ref) {
      mediaModels[category] = ref;
    }
  }
  return mediaModels;
}

function parseTuiMediaModelRef(
  rawRef: string | undefined,
  defaultProviderId: string,
  category: TuiMediaCategory,
  modelOptions: readonly ChatModelOption[],
): RuntimeMediaModelRef | null {
  const ref = rawRef?.trim();
  if (!ref || ref === 'none') {
    return null;
  }

  const option = modelOptions.find(
    (candidate) =>
      candidate.category === category &&
      (candidate.id === ref ||
        candidate.modelId === ref ||
        `${candidate.providerId}:${candidate.modelId}` === ref ||
        `${candidate.providerId}/${candidate.modelId}` === ref),
  );
  if (option) {
    return {
      providerId: option.providerId,
      modelId: option.modelId,
      ...(option.providerExpressionProfileId
        ? { providerExpressionProfileId: option.providerExpressionProfileId }
        : {}),
    };
  }

  const separator = ref.includes('/') ? '/' : ref.includes(':') ? ':' : null;
  if (!separator) {
    return { providerId: defaultProviderId, modelId: ref };
  }

  const [providerId, modelId] = ref.split(separator, 2);
  if (!providerId || !modelId) {
    throw new Error(`Invalid media model reference: ${ref}`);
  }
  return { providerId, modelId };
}
