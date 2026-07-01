import { mergeIdcExecutionMetadata } from '@neko/agent';

type TuiMediaCategory = 'image' | 'video' | 'audio';

type TuiMediaModelDefaults = Partial<Record<TuiMediaCategory, string>>;

interface RuntimeMediaModelRef {
  readonly providerId: string;
  readonly modelId: string;
}

type RuntimeMediaModelRefs = Partial<Record<TuiMediaCategory, RuntimeMediaModelRef>>;

export function mergeTuiMediaModelMetadata(
  metadata: Record<string, unknown> | undefined,
  defaults: TuiMediaModelDefaults | undefined,
  defaultProviderId: string,
): Record<string, unknown> | undefined {
  const mediaModels = buildTuiMediaModelMetadata(defaults, defaultProviderId);
  if (Object.keys(mediaModels).length === 0) {
    return metadata;
  }
  return mergeIdcExecutionMetadata(metadata, { mediaModels });
}

export function buildTuiMediaModelMetadata(
  defaults: TuiMediaModelDefaults | undefined,
  defaultProviderId: string,
): RuntimeMediaModelRefs {
  const mediaModels: RuntimeMediaModelRefs = {};
  for (const category of ['image', 'video', 'audio'] as const) {
    const ref = parseTuiMediaModelRef(defaults?.[category], defaultProviderId);
    if (ref) {
      mediaModels[category] = ref;
    }
  }
  return mediaModels;
}

function parseTuiMediaModelRef(
  rawRef: string | undefined,
  defaultProviderId: string,
): RuntimeMediaModelRef | null {
  const ref = rawRef?.trim();
  if (!ref || ref === 'none') {
    return null;
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
