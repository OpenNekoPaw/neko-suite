import type {
  PerceptionCard,
  PerceptualAssetRef,
  ToolResultBackfillDiagnostic,
  ToolResultWithMeta,
} from '@neko/shared';
import type { IPerceptionPipeline, MediaUnderstandingModelOverrides } from '../perception';

export interface ReadImagePerceptionBackfillInput {
  readonly results: ToolResultWithMeta[];
  readonly perceptionPipeline?: IPerceptionPipeline;
  readonly metadata?: Record<string, unknown>;
  readonly chatModel?: MediaUnderstandingModelOverrides['image'];
}

export async function backfillReadImagePerceptionResults(
  input: ReadImagePerceptionBackfillInput,
): Promise<void> {
  const pipeline = input.perceptionPipeline;
  if (!pipeline) return;

  const understandingModels = readMediaUnderstandingModels(input.metadata);
  if (!shouldBackfillImagePerception(input.chatModel, understandingModels)) return;

  for (const result of input.results) {
    if (result.name !== 'ReadImage' || !result.success) continue;
    const cards = result.perceptionCards ?? [];
    const backfilledCards: PerceptionCard[] = [];
    const targets = collectReadImagePerceptionTargets(result);
    for (const target of targets) {
      try {
        const perceived = await pipeline.perceive({
          asset: { assetId: target.assetId, ref: target.ref },
          sourceToolCallId: result.callId,
          focus: 'visual',
          ...(understandingModels ? { understandingModels } : {}),
          policy: {
            timing: 'on-demand',
            layers: [0, 1],
            reason: 'ReadImage result requires configured image perception model',
          },
        });
        backfilledCards.push(perceived.card);
      } catch (error) {
        result.backfillDiagnostics = [
          ...(result.backfillDiagnostics ?? []),
          createBackfillDiagnostic(result.callId, error),
        ];
        break;
      }
    }
    if (backfilledCards.length > 0) {
      result.perceptionCards = [...cards, ...backfilledCards];
    }
  }
}

function shouldBackfillImagePerception(
  chatModel: MediaUnderstandingModelOverrides['image'] | undefined,
  understandingModels: MediaUnderstandingModelOverrides | undefined,
): boolean {
  const imageUnderstandingModel = understandingModels?.image;
  if (!imageUnderstandingModel) return false;
  if (!chatModel) return true;
  return (
    chatModel.providerId !== imageUnderstandingModel.providerId ||
    chatModel.modelId !== imageUnderstandingModel.modelId
  );
}

function createBackfillDiagnostic(callId: string, error: unknown): ToolResultBackfillDiagnostic {
  return {
    path: callId,
    reason: 'invalid-existing-result',
    incoming: {
      source: 'read-image-perception-backfill',
      error: error instanceof Error ? error.message : String(error),
    },
  };
}

interface ReadImagePerceptionTarget {
  readonly assetId: string;
  readonly ref: PerceptualAssetRef;
}

function collectReadImagePerceptionTargets(
  result: ToolResultWithMeta,
): readonly ReadImagePerceptionTarget[] {
  const targets: ReadImagePerceptionTarget[] = [];
  const seen = new Set<string>();

  for (const card of result.perceptionCards ?? []) {
    if (card.modality !== 'image' || card.layerStatus.layer1 === 'complete') continue;
    const ref = card.perceptual?.thumbnailRef ?? card.perceptual?.keyframeRefs?.[0];
    if (!ref) continue;
    pushUniqueTarget(targets, seen, { assetId: card.assetId, ref });
  }

  for (const image of readResultImages(result.data)) {
    const ref = createPerceptualAssetRefFromReadImage(image);
    if (!ref) continue;
    pushUniqueTarget(targets, seen, { assetId: ref.assetId, ref });
  }

  return targets;
}

function pushUniqueTarget(
  targets: ReadImagePerceptionTarget[],
  seen: Set<string>,
  target: ReadImagePerceptionTarget,
): void {
  const key = `${target.assetId}\u0000${target.ref.uri}`;
  if (seen.has(key)) return;
  seen.add(key);
  targets.push(target);
}

function readResultImages(data: unknown): readonly Record<string, unknown>[] {
  if (!isRecord(data) || !Array.isArray(data['images'])) return [];
  return data['images'].filter(isRecord);
}

function createPerceptualAssetRefFromReadImage(
  image: Record<string, unknown>,
): PerceptualAssetRef | undefined {
  const mimeType = typeof image['mimeType'] === 'string' ? image['mimeType'].trim() : '';
  if (!mimeType.startsWith('image/')) return undefined;

  const uri = readImageUri(image);
  if (!uri) return undefined;

  const assetId = readImageAssetId(image) ?? `read-image-${stableRefId(uri)}`;
  return {
    assetId,
    uri,
    mimeType,
    ...(typeof image['label'] === 'string' ? { label: image['label'] } : {}),
    ...(isRecord(image['resourceRef']) ? { resourceRef: image['resourceRef'] } : {}),
  };
}

function readImageUri(image: Record<string, unknown>): string | undefined {
  const directUrl = typeof image['url'] === 'string' ? image['url'].trim() : '';
  if (directUrl) return directUrl;
  const directPath = typeof image['path'] === 'string' ? image['path'].trim() : '';
  if (directPath) return directPath;

  const resourceRef = image['resourceRef'];
  if (!isRecord(resourceRef)) return undefined;
  const source = resourceRef['source'];
  if (isRecord(source)) {
    const filePath = typeof source['filePath'] === 'string' ? source['filePath'].trim() : '';
    if (filePath) return filePath;
    const path = typeof source['path'] === 'string' ? source['path'].trim() : '';
    if (path) return path;
  }
  const id = typeof resourceRef['id'] === 'string' ? resourceRef['id'].trim() : '';
  return id ? `resource:${id}` : undefined;
}

function readImageAssetId(image: Record<string, unknown>): string | undefined {
  const resourceRef = image['resourceRef'];
  if (!isRecord(resourceRef)) return undefined;
  const locator = resourceRef['locator'];
  if (isRecord(locator)) {
    const assetId = typeof locator['assetId'] === 'string' ? locator['assetId'].trim() : '';
    if (assetId) return assetId;
  }
  const id = typeof resourceRef['id'] === 'string' ? resourceRef['id'].trim() : '';
  return id || undefined;
}

function stableRefId(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(36);
}

function readMediaUnderstandingModels(
  metadata: Record<string, unknown> | undefined,
): MediaUnderstandingModelOverrides | undefined {
  if (!metadata) return undefined;
  const raw = metadata['understandingModels'];
  if (!isRecord(raw)) return undefined;
  const image = readMediaUnderstandingModel(raw['image']);
  const audio = readMediaUnderstandingModel(raw['audio']);
  const video = readMediaUnderstandingModel(raw['video']);
  if (!image && !audio && !video) return undefined;
  return {
    ...(image ? { image } : {}),
    ...(audio ? { audio } : {}),
    ...(video ? { video } : {}),
  };
}

function readMediaUnderstandingModel(
  value: unknown,
): { readonly providerId: string; readonly modelId: string } | undefined {
  if (!isRecord(value)) return undefined;
  const providerId = typeof value['providerId'] === 'string' ? value['providerId'].trim() : '';
  const modelId = typeof value['modelId'] === 'string' ? value['modelId'].trim() : '';
  if (!providerId || !modelId) return undefined;
  return { providerId, modelId };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
