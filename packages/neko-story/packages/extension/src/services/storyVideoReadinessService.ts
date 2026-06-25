import type { FountainDocument } from '@neko-story/types';
import type {
  CanvasSceneExecutionSummary,
  CanvasStoryboardExecutionSummary,
  CharacterRecord,
  CharacterRegistryFile,
  NekoStoryScriptIndex,
  StoryCharacterMatchSource,
  StoryCharacterVisualReadiness,
  StoryCharacterVisualStatus,
  StoryCreatorStatus,
  StoryLocalizedTextParams,
  StoryMissingInput,
  StorySceneVideoReadiness,
  StorySceneVideoReadinessStatus,
  StoryVideoReadinessAction,
} from '@neko/shared';
import { normalizeCharacterLookupKey } from '@neko/shared';
import type { StorySceneState } from './storySceneStateStore';

export interface StoryVideoReadinessBuildInput {
  readonly document: FountainDocument;
  readonly scriptIndex: NekoStoryScriptIndex;
  readonly sceneStates: Readonly<Record<string, StorySceneState>>;
  readonly characterRegistry?: CharacterRegistryFile;
  readonly thumbnailResolver?: (
    name: string,
    record: CharacterRecord | undefined,
  ) => Promise<string | undefined>;
  readonly canvasSummary?: CanvasStoryboardExecutionSummary;
}

interface RegistryNameEntry {
  readonly record: CharacterRecord;
  readonly name: string;
  readonly mentionMatcher?: (text: string) => boolean;
}

interface SceneCharacterDraft {
  readonly name: string;
  readonly matchSource: StoryCharacterMatchSource;
  readonly record?: CharacterRecord;
}

interface ThumbnailResult {
  readonly uri?: string;
  readonly unavailable: boolean;
}

interface LocalizedFallbackText {
  readonly key: string;
  readonly params?: StoryLocalizedTextParams;
  readonly fallback: string;
}

export async function buildStorySceneVideoReadinessRows(
  input: StoryVideoReadinessBuildInput,
): Promise<readonly StorySceneVideoReadiness[]> {
  const registryLookup = buildRegistryLookup(input.characterRegistry);
  const narrativeMentions = collectNarrativeMentions(
    input.document,
    input.scriptIndex,
    registryLookup,
  );
  const canvasSummaryByScene = indexCanvasSummaryByScene(input.canvasSummary);

  const rows: StorySceneVideoReadiness[] = [];

  for (const scene of input.scriptIndex.scenes) {
    const state = input.sceneStates[scene.sceneId] ?? {
      sceneId: scene.sceneId,
      agentStatus: 'not-requested',
      canvasStatus: 'not-sent',
    };
    const canvasSummary = canvasSummaryByScene.get(scene.sceneId);
    const characterDrafts = mergeSceneCharacters(
      scene.sceneCharacters,
      narrativeMentions.get(scene.sceneId) ?? [],
      registryLookup,
    );
    const characters = await Promise.all(
      characterDrafts.map((draft) =>
        resolveCharacterVisualReadiness(draft, input.thumbnailResolver),
      ),
    );
    const missingInputs = computeMissingInputs(scene, state, characters, canvasSummary);
    const creatorStatus = deriveCreatorStatus(state, canvasSummary);
    const readinessStatus = deriveReadinessStatus(state, creatorStatus, missingInputs);

    rows.push({
      sceneId: scene.sceneId,
      sourceScriptUri: input.scriptIndex.uri,
      sceneTitle: scene.sceneTitle,
      sceneNumber: scene.sceneNumber,
      summary: scene.actionSummary,
      location: scene.location || undefined,
      estimatedDuration: scene.estimatedDuration,
      recommendedShotCount: estimateRecommendedShotCount(scene.estimatedDuration),
      characters,
      missingInputs,
      readinessStatus,
      creatorStatus,
      agentStatus: state.agentStatus,
      canvasStatus: canvasSummary?.status ?? state.canvasStatus,
      timelineStatus: state.timelineStatus,
      canvasSummary,
      allowedActions: deriveAllowedActions(readinessStatus, creatorStatus, state, canvasSummary),
    });
  }

  return rows;
}

function deriveCreatorStatus(
  state: StorySceneState,
  canvasSummary?: CanvasSceneExecutionSummary,
): StoryCreatorStatus {
  const { agentStatus, canvasStatus, generationStatus } = state;

  if (agentStatus === 'skipped' || canvasStatus === 'skipped') return 'skipped';

  if (
    agentStatus === 'failed' ||
    generationStatus === 'partial-fail' ||
    canvasSummary?.status === 'failed' ||
    agentStatus === 'review' ||
    agentStatus === 'prompt-review' ||
    agentStatus === 'pilot-review'
  ) {
    return 'attention';
  }

  if (
    canvasSummary?.status === 'done' ||
    ((agentStatus === 'timeline-arranged' || agentStatus === 'sent') &&
      (canvasStatus === 'sent' || canvasStatus === 'opened'))
  ) {
    return 'done';
  }

  if (
    agentStatus === 'parsing' ||
    agentStatus === 'generating' ||
    generationStatus === 'generating' ||
    canvasStatus === 'queued' ||
    canvasStatus === 'sent' ||
    canvasSummary?.status === 'in-progress' ||
    canvasSummary?.status === 'partial'
  ) {
    return 'processing';
  }

  if (agentStatus === 'ready') return 'processing';

  return 'pending';
}

function buildRegistryLookup(
  registry: CharacterRegistryFile | undefined,
): ReadonlyMap<string, RegistryNameEntry> {
  const lookup = new Map<string, RegistryNameEntry>();

  for (const record of registry?.characters ?? []) {
    for (const name of collectRecordNames(record)) {
      const key = normalizeCharacterLookupKey(name);
      if (!key || lookup.has(key)) {
        continue;
      }
      lookup.set(key, { record, name, mentionMatcher: createConservativeMentionMatcher(name) });
    }
  }

  return lookup;
}

function collectRecordNames(record: CharacterRecord): readonly string[] {
  const names = [
    record.canonicalName,
    record.displayName,
    ...record.aliases,
    ...(record.bindings?.scriptNames ?? []),
  ];
  const seen = new Set<string>();
  const result: string[] = [];

  for (const name of names) {
    if (typeof name !== 'string' || name.trim().length === 0) {
      continue;
    }

    const key = normalizeCharacterLookupKey(name);
    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(name);
  }

  return result;
}

function collectNarrativeMentions(
  document: FountainDocument,
  scriptIndex: NekoStoryScriptIndex,
  registryLookup: ReadonlyMap<string, RegistryNameEntry>,
): ReadonlyMap<string, readonly SceneCharacterDraft[]> {
  const mentions = new Map<string, readonly SceneCharacterDraft[]>();
  if (registryLookup.size === 0) {
    return mentions;
  }

  for (const scene of scriptIndex.scenes) {
    const sceneText = collectNarrativeText(document, scene.line_start, scene.line_end);
    if (!sceneText) {
      continue;
    }

    const drafts: SceneCharacterDraft[] = [];
    for (const entry of registryLookup.values()) {
      if (!entry.mentionMatcher || !entry.mentionMatcher(sceneText)) {
        continue;
      }
      drafts.push({
        name: entry.record.displayName ?? entry.record.canonicalName,
        matchSource: 'registry-mention',
        record: entry.record,
      });
    }

    if (drafts.length > 0) {
      mentions.set(scene.sceneId, dedupeDrafts(drafts));
    }
  }

  return mentions;
}

function collectNarrativeText(
  document: FountainDocument,
  startLine: number,
  endLine: number,
): string {
  const parts: string[] = [];

  for (const element of document.elements) {
    if (element.range.end.line < startLine || element.range.start.line > endLine) {
      continue;
    }

    if (
      element.type !== 'action' &&
      element.type !== 'synopsis' &&
      element.type !== 'note' &&
      element.type !== 'centered'
    ) {
      continue;
    }

    const text = readElementText(element);
    if (text) {
      parts.push(text);
    }
  }

  return parts.join('\n');
}

function readElementText(element: FountainDocument['elements'][number]): string {
  if ('text' in element && typeof element.text === 'string') {
    return element.text;
  }
  return element.raw;
}

function createConservativeMentionMatcher(name: string): ((text: string) => boolean) | undefined {
  const token = name.trim();
  if (!token) {
    return undefined;
  }

  if (isAsciiWordToken(token)) {
    if (token.replace(/\s+/g, '').length < 2) {
      return undefined;
    }
    const pattern = new RegExp(
      `(^|[^\\p{L}\\p{N}_])${escapeRegExp(token)}(?=$|[^\\p{L}\\p{N}_])`,
      'iu',
    );
    return (text) => pattern.test(text);
  }

  if (token.length < 2) {
    return undefined;
  }
  return (text) => text.includes(token);
}

function isAsciiWordToken(value: string): boolean {
  return /^[A-Za-z0-9_ ]+$/.test(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function mergeSceneCharacters(
  structuredNames: readonly string[],
  narrativeDrafts: readonly SceneCharacterDraft[],
  registryLookup: ReadonlyMap<string, RegistryNameEntry>,
): readonly SceneCharacterDraft[] {
  const drafts: SceneCharacterDraft[] = [];

  for (const name of structuredNames) {
    const normalized = normalizeCharacterLookupKey(name);
    const match = registryLookup.get(normalized);
    drafts.push({
      name,
      matchSource: 'dialogue-character',
      record: match?.record,
    });
  }

  drafts.push(...narrativeDrafts);
  return dedupeDrafts(drafts);
}

function dedupeDrafts(drafts: readonly SceneCharacterDraft[]): readonly SceneCharacterDraft[] {
  const byKey = new Map<string, SceneCharacterDraft>();

  for (const draft of drafts) {
    const key = draft.record?.id ?? normalizeCharacterLookupKey(draft.name);
    if (!key || byKey.has(key)) {
      continue;
    }
    byKey.set(key, draft);
  }

  return [...byKey.values()];
}

async function resolveCharacterVisualReadiness(
  draft: SceneCharacterDraft,
  thumbnailResolver:
    | ((name: string, record: CharacterRecord | undefined) => Promise<string | undefined>)
    | undefined,
): Promise<StoryCharacterVisualReadiness> {
  const thumbnail = await resolveThumbnail(draft, thumbnailResolver);
  const assetEntityIds = collectStringIds([
    draft.record?.defaults?.assetEntityId,
    ...(draft.record?.bindings?.assetEntityIds ?? []),
  ]);
  const generatedAssetIds = collectStringIds(draft.record?.bindings?.generatedAssetIds ?? []);
  const galleryNodeIds = collectStringIds(draft.record?.bindings?.galleryNodeIds ?? []);
  const status = resolveVisualStatus(draft, {
    hasThumbnail: Boolean(thumbnail.uri),
    thumbnailUnavailable: thumbnail.unavailable,
    hasAssetEntity: assetEntityIds.length > 0,
    hasGeneratedAsset: generatedAssetIds.length > 0,
    hasGalleryNode: galleryNodeIds.length > 0,
  });
  const missingReason = buildMissingReason(status, thumbnail.unavailable);

  return {
    name: draft.name,
    characterId: draft.record?.id,
    matchSource: draft.matchSource,
    status,
    thumbnailUri: thumbnail.uri,
    assetEntityIds: assetEntityIds.length > 0 ? assetEntityIds : undefined,
    generatedAssetIds: generatedAssetIds.length > 0 ? generatedAssetIds : undefined,
    galleryNodeIds: galleryNodeIds.length > 0 ? galleryNodeIds : undefined,
    missingReason: missingReason?.fallback,
    missingReasonKey: missingReason?.key,
    missingReasonParams: missingReason?.params,
  };
}

async function resolveThumbnail(
  draft: SceneCharacterDraft,
  thumbnailResolver:
    | ((name: string, record: CharacterRecord | undefined) => Promise<string | undefined>)
    | undefined,
): Promise<ThumbnailResult> {
  if (!thumbnailResolver) {
    return { unavailable: false };
  }

  try {
    const uri = await thumbnailResolver(draft.name, draft.record);
    return { uri, unavailable: false };
  } catch {
    return { unavailable: true };
  }
}

function collectStringIds(values: readonly (string | undefined)[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    if (typeof value !== 'string' || value.trim().length === 0 || seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }

  return result;
}

function resolveVisualStatus(
  draft: SceneCharacterDraft,
  evidence: {
    readonly hasThumbnail: boolean;
    readonly thumbnailUnavailable: boolean;
    readonly hasAssetEntity: boolean;
    readonly hasGeneratedAsset: boolean;
    readonly hasGalleryNode: boolean;
  },
): StoryCharacterVisualStatus {
  if (!draft.record) {
    return evidence.thumbnailUnavailable ? 'unknown' : 'unresolved';
  }

  if (draft.record.status === 'deprecated') {
    return 'stale';
  }

  if (evidence.hasAssetEntity || evidence.hasGalleryNode || evidence.hasThumbnail) {
    return 'bound';
  }

  if (evidence.hasGeneratedAsset) {
    return 'generated';
  }

  return evidence.thumbnailUnavailable ? 'unknown' : 'missing';
}

function buildMissingReason(
  status: StoryCharacterVisualStatus,
  thumbnailUnavailable: boolean,
): LocalizedFallbackText | undefined {
  if (thumbnailUnavailable && status === 'unknown') {
    return {
      key: 'table.character.missingReason.assetsUnavailable',
      fallback: 'Asset service is unavailable, so the character visual cannot be confirmed yet',
    };
  }
  if (status === 'missing') {
    return {
      key: 'table.character.missingReason.missingVisual',
      fallback: 'No usable character visual is available',
    };
  }
  if (status === 'unresolved') {
    return {
      key: 'table.character.missingReason.unresolvedCharacter',
      fallback: 'Script character is not bound to characters.json',
    };
  }
  if (status === 'stale') {
    return {
      key: 'table.character.missingReason.staleVisual',
      fallback: 'Character record is outdated; confirm whether the visual is still valid',
    };
  }
  return undefined;
}

function computeMissingInputs(
  scene: NekoStoryScriptIndex['scenes'][number],
  state: StorySceneState,
  characters: readonly StoryCharacterVisualReadiness[],
  canvasSummary: CanvasSceneExecutionSummary | undefined,
): readonly StoryMissingInput[] {
  const missing: StoryMissingInput[] = [];

  for (const character of characters) {
    if (character.status === 'unresolved') {
      missing.push({
        kind: 'unresolved-character',
        label: `${character.name} is not bound to a character identity`,
        labelKey: 'table.missingInput.unresolvedCharacter',
        labelParams: { name: character.name },
        severity: 'blocking',
        characterName: character.name,
      });
      continue;
    }

    if (character.status === 'missing') {
      missing.push({
        kind: 'character-visual',
        label: `${character.name} is missing a character visual`,
        labelKey: 'table.missingInput.characterVisual',
        labelParams: { name: character.name },
        severity: 'blocking',
        characterName: character.name,
        characterId: character.characterId,
      });
      continue;
    }

    if (character.status === 'unknown') {
      missing.push({
        kind: 'character-visual',
        label: `${character.name} character visual status is unknown`,
        labelKey: 'table.missingInput.characterVisualUnknown',
        labelParams: { name: character.name },
        severity: 'warning',
        characterName: character.name,
        characterId: character.characterId,
      });
    }
  }

  if (!scene.location || scene.location.trim().length === 0) {
    missing.push({
      kind: 'location',
      label: 'Scene location is missing',
      labelKey: 'table.missingInput.location',
      severity: 'warning',
    });
  }

  if (!Number.isFinite(scene.estimatedDuration) || scene.estimatedDuration <= 0) {
    missing.push({
      kind: 'duration',
      label: 'Reliable scene duration is missing',
      labelKey: 'table.missingInput.duration',
      severity: 'warning',
    });
  }

  const hasCanvasState =
    state.canvasStatus === 'sent' ||
    state.canvasStatus === 'opened' ||
    Boolean(canvasSummary && canvasSummary.status !== 'not-found');
  if (!hasCanvasState) {
    missing.push({
      kind: 'canvas-handoff',
      label: 'Not sent to Canvas yet',
      labelKey: 'table.missingInput.canvasHandoff',
      severity: 'info',
    });
  }

  return missing;
}

function deriveReadinessStatus(
  state: StorySceneState,
  creatorStatus: StoryCreatorStatus,
  missingInputs: readonly StoryMissingInput[],
): StorySceneVideoReadinessStatus {
  if (creatorStatus === 'skipped') return 'skipped';
  if (creatorStatus === 'attention' && state.agentStatus === 'failed') return 'failed';
  if (missingInputs.some((input) => input.severity === 'blocking')) return 'needs-input';
  if (creatorStatus === 'done') return 'done';
  if (creatorStatus === 'processing') return 'in-progress';
  return 'ready';
}

function deriveAllowedActions(
  readinessStatus: StorySceneVideoReadinessStatus,
  creatorStatus: StoryCreatorStatus,
  state: StorySceneState,
  canvasSummary: CanvasSceneExecutionSummary | undefined,
): readonly StoryVideoReadinessAction[] {
  if (readinessStatus === 'skipped' || creatorStatus === 'skipped') {
    return ['toggleSkip'];
  }

  const actions: StoryVideoReadinessAction[] = ['analyze'];

  if (readinessStatus === 'ready') {
    actions.push('startVideoCreation', 'sendToCanvas');
  } else if (readinessStatus === 'failed') {
    actions.push('retryFailed');
  } else if (readinessStatus === 'done') {
    actions.push('startVideoCreation');
  }

  if (
    state.canvasStatus === 'sent' ||
    state.canvasStatus === 'opened' ||
    (canvasSummary && canvasSummary.status !== 'not-found')
  ) {
    actions.push('openCanvas');
  }

  actions.push('toggleSkip');
  return Array.from(new Set(actions));
}

function estimateRecommendedShotCount(duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) {
    return 1;
  }
  // Initial scene-level heuristic until explicit beat planning is available.
  return Math.max(1, Math.min(12, Math.round(duration / 5)));
}

function indexCanvasSummaryByScene(
  summary: CanvasStoryboardExecutionSummary | undefined,
): ReadonlyMap<string, CanvasSceneExecutionSummary> {
  const index = new Map<string, CanvasSceneExecutionSummary>();

  for (const scene of summary?.scenes ?? []) {
    if (scene.sceneId) {
      index.set(scene.sceneId, scene);
    }
  }

  return index;
}
