import type { CameraAngle, CameraMovement, ShotCharacter, ShotScale } from './canvas';
import type { CanvasStoryboardPayload, StoryboardImportMode } from './storyboard-planner';

export const STORYBOARD_TABLE_V1_SCHEMA_VERSION = 1 as const;
export const STORYBOARD_TABLE_V1_KIND = 'storyboard-table' as const;

export const STORYBOARD_TABLE_V1_PROFILES = [
  'script-breakdown',
  'manga-to-video',
  'image-sequence',
  'ad-storyboard',
  'short-video',
  'character-design',
  'manual',
] as const;

export const STORYBOARD_SHOT_IMAGE_STRATEGIES_V1 = [
  'reuse-original',
  'use-as-reference',
  'generate-new',
  'transform-original',
] as const;

export const STORYBOARD_MEDIA_ROLES_V1 = [
  'source',
  'reference',
  'generated',
  'derived',
  'thumbnail',
  'mask',
] as const;

export const STORYBOARD_SOURCE_MEDIA_ROLES_V1 = [
  'source',
  'reference',
  'thumbnail',
  'mask',
] as const;

export const STORYBOARD_GENERATED_MEDIA_ROLES_V1 = [
  'generated',
  'derived',
  'thumbnail',
  'mask',
] as const;

export const STORYBOARD_TABLE_V1_REQUIRED_FIELDS = [
  'schemaVersion',
  'kind',
  'title',
  'scenes',
] as const satisfies readonly (keyof StoryboardTableV1)[];

export const STORYBOARD_SCENE_V1_REQUIRED_FIELDS = [
  'sceneId',
  'sceneTitle',
  'shots',
] as const satisfies readonly (keyof StoryboardSceneRowV1)[];

export const STORYBOARD_SHOT_V1_REQUIRED_FIELDS = [
  'shotNumber',
  'duration',
  'visualDescription',
  'characterAction',
  'imageStrategy',
] as const satisfies readonly (keyof StoryboardShotRowV1)[];

export type StoryboardTableProfileV1 = (typeof STORYBOARD_TABLE_V1_PROFILES)[number];

export type StoryboardShotImageStrategyV1 = (typeof STORYBOARD_SHOT_IMAGE_STRATEGIES_V1)[number];

export type StoryboardMediaRoleV1 = (typeof STORYBOARD_MEDIA_ROLES_V1)[number];

export type StoryboardSourceMediaRoleV1 = (typeof STORYBOARD_SOURCE_MEDIA_ROLES_V1)[number];

export type StoryboardGeneratedMediaRoleV1 = (typeof STORYBOARD_GENERATED_MEDIA_ROLES_V1)[number];

export type StoryboardSerializableValueV1 =
  | string
  | number
  | boolean
  | null
  | readonly StoryboardSerializableValueV1[]
  | { readonly [key: string]: StoryboardSerializableValueV1 };

export type StoryboardSerializableRecordV1 = {
  readonly [key: string]: StoryboardSerializableValueV1;
};

export type StoryboardExtensionNamespaceV1 = `neko.${string}`;

export type StoryboardExtensionMapV1 = Readonly<
  Record<StoryboardExtensionNamespaceV1, StoryboardSerializableValueV1>
>;

export type StoryboardTableSourceTypeV1 = 'story' | 'agent' | 'document' | 'image' | 'manual';

export interface StoryboardTableSourceV1 {
  readonly type: StoryboardTableSourceTypeV1;
  readonly sourceUri?: string;
  readonly sourceSceneId?: string;
  readonly sourceDocumentId?: string;
  readonly label?: string;
}

export interface StoryboardTableV1 {
  readonly schemaVersion: typeof STORYBOARD_TABLE_V1_SCHEMA_VERSION;
  readonly kind: typeof STORYBOARD_TABLE_V1_KIND;
  readonly profile?: StoryboardTableProfileV1;
  readonly source?: StoryboardTableSourceV1;
  readonly title: string;
  readonly scenes: readonly StoryboardSceneRowV1[];
  readonly extensions?: StoryboardExtensionMapV1;
}

export interface StoryboardSceneRowV1 {
  readonly sceneId: string;
  readonly sceneTitle: string;
  readonly sceneNumber?: number;
  readonly location?: string;
  readonly timeOfDay?: string;
  readonly summary?: string;
  readonly shots: readonly StoryboardShotRowV1[];
  readonly extensions?: StoryboardExtensionMapV1;
}

export interface StoryboardShotRowV1 {
  readonly shotId?: string;
  readonly shotNumber: number;
  readonly duration: number;
  readonly visualDescription: string;
  readonly characters?: readonly StoryboardShotCharacterV1[];
  readonly shotScale?: ShotScale;
  readonly cameraMovement?: CameraMovement;
  readonly cameraAngle?: CameraAngle;
  readonly characterAction: string;
  readonly emotion?: readonly string[];
  readonly sceneTags?: readonly string[];
  readonly dialogue?: string;
  readonly voiceOver?: string;
  readonly soundCue?: string;
  readonly generationPrompt?: string;
  readonly visualStyle?: string;
  readonly referenceImagePath?: string;
  readonly vfx?: readonly string[];
  readonly imageStrategy: StoryboardShotImageStrategyV1;
  readonly sourceMediaRefs?: readonly StoryboardMediaRefV1[];
  readonly generatedMediaRefs?: readonly StoryboardMediaRefV1[];
  readonly mediaRefs?: readonly StoryboardMediaRefV1[];
  readonly decisionReason?: string;
  readonly extensions?: StoryboardExtensionMapV1;
}

export type StoryboardShotCharacterRoleV1 = 'primary' | 'secondary' | 'background';

export interface StoryboardShotCharacterV1 {
  readonly characterId?: string;
  readonly name: string;
  readonly role?: StoryboardShotCharacterRoleV1;
  readonly action?: string;
  readonly emotion?: string;
  readonly continuityNotes?: string;
}

export type StoryboardMediaLocatorV1 =
  | {
      readonly type: 'tool-result';
      readonly toolCallId: string;
      readonly assetIndex: number;
      readonly taskId?: string;
    }
  | {
      readonly type: 'asset';
      readonly assetId: string;
      readonly assetVersion?: string;
      readonly uri?: string;
    }
  | {
      readonly type: 'workspace-path';
      readonly path: string;
    }
  | {
      readonly type: 'canvas-node';
      readonly canvasNodeId: string;
      readonly outputId?: string;
    }
  | {
      readonly type: 'story-source';
      readonly storyId: string;
      readonly sceneId?: string;
      readonly frameIndex?: number;
    };

export interface StoryboardMediaRefV1 {
  readonly refId: string;
  readonly role: StoryboardMediaRoleV1;
  readonly locator: StoryboardMediaLocatorV1;
  readonly label?: string;
  readonly mimeType?: string;
  readonly metadata?: StoryboardSerializableRecordV1;
}

export type StoryboardTableV1RequiredField = (typeof STORYBOARD_TABLE_V1_REQUIRED_FIELDS)[number];

export type StoryboardSceneV1RequiredField = (typeof STORYBOARD_SCENE_V1_REQUIRED_FIELDS)[number];

export type StoryboardShotV1RequiredField = (typeof STORYBOARD_SHOT_V1_REQUIRED_FIELDS)[number];

export type StoryboardValidationDiagnosticSeverityV1 =
  | 'error'
  | 'warning'
  | 'suggestion'
  | 'profileHint';

export type StoryboardValidationDiagnosticCodeV1 =
  | 'invalid-root'
  | 'invalid-schema-version'
  | 'invalid-kind'
  | 'invalid-profile'
  | 'missing-required-field'
  | 'invalid-required-field'
  | 'empty-scenes'
  | 'empty-shots'
  | 'invalid-shot-duration'
  | 'invalid-shot-number'
  | 'invalid-image-strategy'
  | 'invalid-media-ref'
  | 'unsafe-media-ref'
  | 'media-ref-role-mismatch'
  | 'ambiguous-legacy-media-ref'
  | 'invalid-extension-namespace'
  | 'non-serializable-extension'
  | 'missing-profile-field'
  | 'image-strategy-missing-source'
  | 'image-strategy-missing-prompt'
  | 'missing-capability'
  | 'generation-denied'
  | 'generation-confirmation-required'
  | 'generation-failed'
  | 'missing-backfill-output'
  | 'backfill-target-not-found';

export type StoryboardValidationDiagnosticPathSegmentV1 = string | number;

export interface StoryboardValidationDiagnosticV1 {
  readonly severity: StoryboardValidationDiagnosticSeverityV1;
  readonly code: StoryboardValidationDiagnosticCodeV1;
  readonly path: readonly StoryboardValidationDiagnosticPathSegmentV1[];
  readonly message: string;
  readonly expected?: string;
  readonly actual?: StoryboardSerializableValueV1;
  readonly details?: StoryboardSerializableRecordV1;
}

export interface StoryboardValidationResultV1 {
  readonly ok: boolean;
  readonly diagnostics: readonly StoryboardValidationDiagnosticV1[];
}

export interface ProjectStoryboardTableV1ToCanvasOptions {
  readonly mode?: StoryboardImportMode;
  readonly sourceScriptUri?: string;
  readonly defaultShotScale?: ShotScale;
}

export interface StoryboardCutStoryboardShotBaseV1 {
  readonly id: string;
  readonly shotNumber: number;
  readonly duration: number;
  readonly dialogue?: string;
  readonly voiceOver?: string;
  readonly soundCue?: string;
  readonly label: string;
}

export type StoryboardCutStoryboardShotV1 =
  | (StoryboardCutStoryboardShotBaseV1 & {
      readonly imagePath: string;
      readonly imageDataUrl?: string;
    })
  | (StoryboardCutStoryboardShotBaseV1 & {
      readonly imagePath?: string;
      readonly imageDataUrl: string;
    });

export interface StoryboardCutStoryboardPayloadV1 {
  readonly projectName: string;
  readonly shots: readonly StoryboardCutStoryboardShotV1[];
}

export interface StoryboardMediaResolverContextV1 {
  readonly table: StoryboardTableV1;
  readonly scene: StoryboardSceneRowV1;
  readonly shot: StoryboardShotRowV1;
  readonly mediaRef: StoryboardMediaRefV1;
}

export interface ProjectStoryboardTableV1ToCutOptions {
  readonly projectName?: string;
  readonly resolveImagePath?: (context: StoryboardMediaResolverContextV1) => string | undefined;
  readonly resolveImageDataUrl?: (context: StoryboardMediaResolverContextV1) => string | undefined;
}

export type StoryboardImageGenerationPolicyV1 = 'allow' | 'deny' | 'confirm';

export interface StoryboardImageStrategyOverrideScopeV1 {
  readonly sceneIds?: readonly string[];
  readonly shotIds?: readonly string[];
}

export interface StoryboardImageStrategyOverrideV1 {
  readonly generationPolicy: StoryboardImageGenerationPolicyV1;
  readonly allowedStrategies?: readonly StoryboardShotImageStrategyV1[];
  readonly scope?: StoryboardImageStrategyOverrideScopeV1;
  readonly source: 'chat-instruction' | 'webview-confirmation' | 'workspace-setting';
  readonly reason?: string;
}

export type StoryboardImageToolNameV1 =
  | 'GenerateImage'
  | 'TransformImage'
  | 'ResolveMediaRef'
  | (string & {});

export interface StoryboardImageToolCapabilityV1 {
  readonly toolName: StoryboardImageToolNameV1;
  readonly supportsReferences: boolean;
  readonly supportsMasks?: boolean;
}

export interface StoryboardImageStrategyInterpreterInputV1 {
  readonly table: StoryboardTableV1;
  readonly userOverride?: StoryboardImageStrategyOverrideV1;
  readonly availableTools: readonly StoryboardImageToolCapabilityV1[];
}

export type StoryboardImageStrategyActionKindV1 =
  | 'reuse-original'
  | 'generate-image'
  | 'transform-image';

export interface StoryboardImageStrategyActionV1 {
  readonly kind: StoryboardImageStrategyActionKindV1;
  readonly sceneId: string;
  readonly shotId: string;
  readonly shotNumber: number;
  readonly imageStrategy: StoryboardShotImageStrategyV1;
  readonly toolName?: StoryboardImageToolNameV1;
  readonly generationPrompt?: string;
  readonly sourceMediaRefs?: readonly StoryboardMediaRefV1[];
}

export interface StoryboardImageStrategyBlockedActionV1 {
  readonly sceneId: string;
  readonly shotId: string;
  readonly shotNumber: number;
  readonly imageStrategy: StoryboardShotImageStrategyV1;
  readonly reason:
    | 'missing-source'
    | 'missing-prompt'
    | 'missing-capability'
    | 'generation-denied'
    | 'confirmation-required'
    | 'strategy-not-allowed';
  readonly diagnostics: readonly StoryboardValidationDiagnosticV1[];
}

export interface StoryboardImageStrategyInterpreterResultV1 {
  readonly actions: readonly StoryboardImageStrategyActionV1[];
  readonly blockedActions: readonly StoryboardImageStrategyBlockedActionV1[];
  readonly diagnostics: readonly StoryboardValidationDiagnosticV1[];
}

export interface LegacyStoryboardMediaRefV1 {
  readonly toolCallId: string;
  readonly assetIndex?: number;
  readonly caption?: string;
  readonly role?: string;
}

export interface LegacyStoryboardSectionV1 {
  readonly heading?: string;
  readonly content?: string;
  readonly mediaRefs?: readonly LegacyStoryboardMediaRefV1[];
  readonly layout?: 'inline' | 'grid' | 'table-row';
}

export interface NormalizeStoryboardTableV1Input {
  readonly value: unknown;
  readonly fallbackTitle?: string;
}

export interface NormalizeStoryboardTableV1Result {
  readonly table?: StoryboardTableV1;
  readonly diagnostics: readonly StoryboardValidationDiagnosticV1[];
}

const MAX_STORYBOARD_DIAGNOSTICS = 64;
const MAX_LEGACY_SECTIONS = 200;
const MAX_LEGACY_MEDIA_REFS = 12;

export function validateStoryboardTableV1(value: unknown): StoryboardValidationResultV1 {
  const normalized = normalizeStoryboardTableV1({ value });
  const diagnostics = normalized.table
    ? [...normalized.diagnostics, ...validateNormalizedStoryboardTableV1(normalized.table)]
    : normalized.diagnostics;

  return {
    ok: !hasBlockingStoryboardDiagnostics(diagnostics),
    diagnostics: limitStoryboardDiagnostics(diagnostics),
  };
}

export function normalizeStoryboardTableV1(
  input: NormalizeStoryboardTableV1Input,
): NormalizeStoryboardTableV1Result {
  const diagnostics: StoryboardValidationDiagnosticV1[] = [];
  const root = readStoryboardRecord(input.value);
  if (!root) {
    return {
      diagnostics: [
        storyboardDiagnostic('error', 'invalid-root', [], 'Storyboard table must be an object.'),
      ],
    };
  }

  if (root['schemaVersion'] === 1 || root['scenes'] !== undefined) {
    const table = normalizeSemanticStoryboardTable(root, diagnostics);
    return {
      ...(table ? { table } : {}),
      diagnostics: limitStoryboardDiagnostics(diagnostics),
    };
  }

  const legacy = normalizeLegacyStoryboardSections(root, input.fallbackTitle, diagnostics);
  return {
    ...(legacy ? { table: legacy } : {}),
    diagnostics: limitStoryboardDiagnostics(diagnostics),
  };
}

export function hasBlockingStoryboardDiagnostics(
  diagnostics: readonly StoryboardValidationDiagnosticV1[],
): boolean {
  return diagnostics.some((diagnostic) => diagnostic.severity === 'error');
}

export function splitStoryboardMediaRefsByRoleV1(
  mediaRefs: readonly StoryboardMediaRefV1[] | undefined,
  path: readonly StoryboardValidationDiagnosticPathSegmentV1[] = [],
): {
  readonly sourceMediaRefs: readonly StoryboardMediaRefV1[];
  readonly generatedMediaRefs: readonly StoryboardMediaRefV1[];
  readonly diagnostics: readonly StoryboardValidationDiagnosticV1[];
} {
  const sourceMediaRefs: StoryboardMediaRefV1[] = [];
  const generatedMediaRefs: StoryboardMediaRefV1[] = [];
  const diagnostics: StoryboardValidationDiagnosticV1[] = [];

  for (const [index, mediaRef] of (mediaRefs ?? []).entries()) {
    const refPath = [...path, index];
    if (isSourceStoryboardMediaRole(mediaRef.role)) {
      sourceMediaRefs.push(mediaRef);
      continue;
    }
    if (isGeneratedStoryboardMediaRole(mediaRef.role)) {
      generatedMediaRefs.push(mediaRef);
      continue;
    }
    diagnostics.push(
      storyboardDiagnostic(
        'warning',
        'ambiguous-legacy-media-ref',
        refPath,
        `Media ref ${mediaRef.refId} has ambiguous role ${mediaRef.role}.`,
        {
          expected: 'source/reference/generated/derived/thumbnail/mask',
          actual: mediaRef.role,
        },
      ),
    );
  }

  return { sourceMediaRefs, generatedMediaRefs, diagnostics };
}

export function projectStoryboardTableV1ToCanvasPayload(
  table: StoryboardTableV1,
  options: ProjectStoryboardTableV1ToCanvasOptions = {},
): CanvasStoryboardPayload {
  return {
    mode: options.mode ?? 'semantic',
    sourceScriptUri:
      options.sourceScriptUri ??
      table.source?.sourceUri ??
      `agent://storyboard-table/v${table.schemaVersion}`,
    scenes: table.scenes.map((scene, sceneIndex) => ({
      sceneId: scene.sceneId,
      sceneTitle: scene.sceneTitle,
      sceneNumber: scene.sceneNumber ?? sceneIndex + 1,
      ...(scene.location ? { location: scene.location } : {}),
      ...(scene.timeOfDay ? { timeOfDay: scene.timeOfDay } : {}),
      shotPlans: scene.shots.map((shot) => ({
        shotNumber: shot.shotNumber,
        duration: shot.duration,
        visualDescription: shot.visualDescription,
        characters: projectStoryboardCharactersToCanvas(shot.characters),
        shotScale: shot.shotScale ?? options.defaultShotScale ?? 'MS',
        ...(shot.cameraMovement ? { cameraMovement: shot.cameraMovement } : {}),
        ...(shot.cameraAngle ? { cameraAngle: shot.cameraAngle } : {}),
        characterAction: shot.characterAction,
        emotion: shot.emotion ?? [],
        sceneTags: shot.sceneTags ?? [],
        ...(shot.dialogue ? { dialogue: shot.dialogue } : {}),
        ...(shot.voiceOver ? { voiceOver: shot.voiceOver } : {}),
        ...(shot.soundCue ? { soundCue: shot.soundCue } : {}),
        ...(shot.generationPrompt ? { generationPrompt: shot.generationPrompt } : {}),
        ...(shot.visualStyle ? { visualStyle: shot.visualStyle } : {}),
        ...(shot.referenceImagePath ? { referenceImagePath: shot.referenceImagePath } : {}),
        ...(shot.vfx ? { vfx: shot.vfx } : {}),
      })),
    })),
  };
}

export function projectStoryboardTableV1ToCutPayload(
  table: StoryboardTableV1,
  options: ProjectStoryboardTableV1ToCutOptions = {},
): StoryboardCutStoryboardPayloadV1 | null {
  const shots: StoryboardCutStoryboardShotV1[] = [];
  for (const scene of table.scenes) {
    for (const shot of scene.shots) {
      const mediaRef = selectStoryboardShotImageRef(shot);
      if (!mediaRef) continue;

      const context = { table, scene, shot, mediaRef };
      const imagePath =
        options.resolveImagePath?.(context) ?? resolveStoryboardWorkspacePath(mediaRef);
      const imageDataUrl = options.resolveImageDataUrl?.(context);
      if (!imagePath && !imageDataUrl) continue;

      shots.push({
        id: shot.shotId ?? `${scene.sceneId}-shot-${shot.shotNumber}`,
        shotNumber: shot.shotNumber,
        duration: shot.duration,
        ...(shot.dialogue ? { dialogue: shot.dialogue } : {}),
        ...(shot.voiceOver ? { voiceOver: shot.voiceOver } : {}),
        ...(shot.soundCue ? { soundCue: shot.soundCue } : {}),
        label: `#${String(shot.shotNumber).padStart(3, '0')} ${scene.sceneTitle}`.trim(),
        ...(imagePath ? { imagePath } : {}),
        ...(imageDataUrl ? { imageDataUrl } : {}),
      } as StoryboardCutStoryboardShotV1);
    }
  }

  return shots.length > 0 ? { projectName: options.projectName ?? table.title, shots } : null;
}

export function interpretStoryboardImageStrategiesV1(
  input: StoryboardImageStrategyInterpreterInputV1,
): StoryboardImageStrategyInterpreterResultV1 {
  const actions: StoryboardImageStrategyActionV1[] = [];
  const blockedActions: StoryboardImageStrategyBlockedActionV1[] = [];
  const diagnostics: StoryboardValidationDiagnosticV1[] = [];
  const generationTool = findStoryboardImageTool(input.availableTools, 'GenerateImage');
  const transformTool = findStoryboardImageTool(input.availableTools, 'TransformImage');

  for (const scene of input.table.scenes) {
    for (const shot of scene.shots) {
      const shotId = shot.shotId ?? `${scene.sceneId}-shot-${shot.shotNumber}`;
      const base = {
        sceneId: scene.sceneId,
        shotId,
        shotNumber: shot.shotNumber,
        imageStrategy: shot.imageStrategy,
      } as const;
      const override = isOverrideInScope(input.userOverride, scene.sceneId, shotId)
        ? input.userOverride
        : undefined;
      const strategyBlocked = validateOverrideForShot(override, shot, base);
      if (strategyBlocked) {
        blockedActions.push(strategyBlocked);
        diagnostics.push(...strategyBlocked.diagnostics);
        continue;
      }

      switch (shot.imageStrategy) {
        case 'reuse-original': {
          if ((shot.sourceMediaRefs ?? []).length === 0) {
            pushBlockedAction(blockedActions, diagnostics, base, 'missing-source', {
              code: 'image-strategy-missing-source',
              path: ['scenes', scene.sceneId, 'shots', shotId, 'sourceMediaRefs'],
              message: 'reuse-original requires sourceMediaRefs.',
            });
            continue;
          }
          actions.push({
            ...base,
            kind: 'reuse-original',
            sourceMediaRefs: shot.sourceMediaRefs,
          });
          break;
        }
        case 'use-as-reference': {
          if ((shot.sourceMediaRefs ?? []).length === 0) {
            pushBlockedAction(blockedActions, diagnostics, base, 'missing-source', {
              code: 'image-strategy-missing-source',
              path: ['scenes', scene.sceneId, 'shots', shotId, 'sourceMediaRefs'],
              message: 'use-as-reference requires sourceMediaRefs.',
            });
            continue;
          }
          if (!generationTool?.supportsReferences) {
            pushBlockedAction(blockedActions, diagnostics, base, 'missing-capability', {
              code: 'missing-capability',
              path: ['availableTools'],
              message: 'use-as-reference requires GenerateImage with reference support.',
            });
            continue;
          }
          actions.push({
            ...base,
            kind: 'generate-image',
            toolName: generationTool.toolName,
            ...(shot.generationPrompt ? { generationPrompt: shot.generationPrompt } : {}),
            sourceMediaRefs: shot.sourceMediaRefs,
          });
          break;
        }
        case 'generate-new': {
          if (!shot.generationPrompt?.trim()) {
            pushBlockedAction(blockedActions, diagnostics, base, 'missing-prompt', {
              code: 'image-strategy-missing-prompt',
              path: ['scenes', scene.sceneId, 'shots', shotId, 'generationPrompt'],
              message: 'generate-new requires generationPrompt.',
            });
            continue;
          }
          if (!generationTool) {
            pushBlockedAction(blockedActions, diagnostics, base, 'missing-capability', {
              code: 'missing-capability',
              path: ['availableTools'],
              message: 'generate-new requires GenerateImage capability.',
            });
            continue;
          }
          actions.push({
            ...base,
            kind: 'generate-image',
            toolName: generationTool.toolName,
            generationPrompt: shot.generationPrompt,
          });
          break;
        }
        case 'transform-original': {
          if ((shot.sourceMediaRefs ?? []).length === 0) {
            pushBlockedAction(blockedActions, diagnostics, base, 'missing-source', {
              code: 'image-strategy-missing-source',
              path: ['scenes', scene.sceneId, 'shots', shotId, 'sourceMediaRefs'],
              message: 'transform-original requires sourceMediaRefs.',
            });
            continue;
          }
          if (!transformTool) {
            pushBlockedAction(blockedActions, diagnostics, base, 'missing-capability', {
              code: 'missing-capability',
              path: ['availableTools'],
              message: 'transform-original requires TransformImage capability.',
            });
            continue;
          }
          actions.push({
            ...base,
            kind: 'transform-image',
            toolName: transformTool.toolName,
            ...(shot.generationPrompt ? { generationPrompt: shot.generationPrompt } : {}),
            sourceMediaRefs: shot.sourceMediaRefs,
          });
          break;
        }
      }
    }
  }

  return { actions, blockedActions, diagnostics };
}

function normalizeSemanticStoryboardTable(
  root: Record<string, unknown>,
  diagnostics: StoryboardValidationDiagnosticV1[],
): StoryboardTableV1 | undefined {
  const schemaVersion = root['schemaVersion'];
  const kind = root['kind'];
  const title = readTrimmedString(root['title']);
  const profile = normalizeProfile(root['profile'], diagnostics);
  const source = normalizeStoryboardTableSource(root['source'], diagnostics);
  const extensions = normalizeExtensions(root['extensions'], ['extensions'], diagnostics);
  const scenes = normalizeSceneRows(root['scenes'], diagnostics);

  if (schemaVersion !== 1) {
    diagnostics.push(
      storyboardDiagnostic(
        'error',
        'invalid-schema-version',
        ['schemaVersion'],
        'Storyboard table schemaVersion must be 1.',
        { expected: '1', actual: serializableDiagnosticValue(schemaVersion) },
      ),
    );
  }

  if (kind !== 'storyboard-table') {
    diagnostics.push(
      storyboardDiagnostic(
        'error',
        'invalid-kind',
        ['kind'],
        'Storyboard table kind must be storyboard-table.',
        { expected: 'storyboard-table', actual: serializableDiagnosticValue(kind) },
      ),
    );
  }

  if (!title) {
    diagnostics.push(missingRequiredDiagnostic(['title'], 'title'));
  }

  if (!Array.isArray(root['scenes'])) {
    diagnostics.push(missingRequiredDiagnostic(['scenes'], 'scenes'));
  } else if (scenes.length === 0) {
    diagnostics.push(
      storyboardDiagnostic('error', 'empty-scenes', ['scenes'], 'Storyboard table needs scenes.'),
    );
  }

  if (schemaVersion !== 1 || kind !== 'storyboard-table' || !title || scenes.length === 0) {
    return undefined;
  }

  return {
    schemaVersion: 1,
    kind: 'storyboard-table',
    ...(profile ? { profile } : {}),
    ...(source ? { source } : {}),
    title,
    scenes,
    ...(extensions ? { extensions } : {}),
  };
}

function normalizeSceneRows(
  value: unknown,
  diagnostics: StoryboardValidationDiagnosticV1[],
): readonly StoryboardSceneRowV1[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((scene, sceneIndex) => {
    const normalized = normalizeSceneRow(scene, sceneIndex, diagnostics);
    return normalized ? [normalized] : [];
  });
}

function normalizeSceneRow(
  value: unknown,
  sceneIndex: number,
  diagnostics: StoryboardValidationDiagnosticV1[],
): StoryboardSceneRowV1 | undefined {
  const path = ['scenes', sceneIndex] as const;
  const record = readStoryboardRecord(value);
  if (!record) {
    diagnostics.push(
      storyboardDiagnostic('error', 'invalid-required-field', path, 'Scene must be an object.'),
    );
    return undefined;
  }

  const sceneId = readTrimmedString(record['sceneId']);
  const sceneTitle = readTrimmedString(record['sceneTitle']);
  const sceneNumber = readOptionalPositiveNumber(record['sceneNumber']);
  const location = readTrimmedString(record['location']);
  const timeOfDay = readTrimmedString(record['timeOfDay']);
  const summary = readTrimmedString(record['summary']);
  const shots = normalizeShotRows(record['shots'], sceneIndex, diagnostics);
  const extensions = normalizeExtensions(
    record['extensions'],
    [...path, 'extensions'],
    diagnostics,
  );

  if (!sceneId) {
    diagnostics.push(missingRequiredDiagnostic([...path, 'sceneId'], 'sceneId'));
  }
  if (!sceneTitle) {
    diagnostics.push(missingRequiredDiagnostic([...path, 'sceneTitle'], 'sceneTitle'));
  }
  if (!Array.isArray(record['shots'])) {
    diagnostics.push(missingRequiredDiagnostic([...path, 'shots'], 'shots'));
  } else if (shots.length === 0) {
    diagnostics.push(
      storyboardDiagnostic('error', 'empty-shots', [...path, 'shots'], 'Scene needs shots.'),
    );
  }

  if (!sceneId || !sceneTitle || shots.length === 0) {
    return undefined;
  }

  return {
    sceneId,
    sceneTitle,
    ...(sceneNumber !== undefined ? { sceneNumber } : {}),
    ...(location ? { location } : {}),
    ...(timeOfDay ? { timeOfDay } : {}),
    ...(summary ? { summary } : {}),
    shots,
    ...(extensions ? { extensions } : {}),
  };
}

function normalizeShotRows(
  value: unknown,
  sceneIndex: number,
  diagnostics: StoryboardValidationDiagnosticV1[],
): readonly StoryboardShotRowV1[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((shot, shotIndex) => {
    const normalized = normalizeShotRow(shot, sceneIndex, shotIndex, diagnostics);
    return normalized ? [normalized] : [];
  });
}

function normalizeShotRow(
  value: unknown,
  sceneIndex: number,
  shotIndex: number,
  diagnostics: StoryboardValidationDiagnosticV1[],
): StoryboardShotRowV1 | undefined {
  const path = ['scenes', sceneIndex, 'shots', shotIndex] as const;
  const record = readStoryboardRecord(value);
  if (!record) {
    diagnostics.push(
      storyboardDiagnostic('error', 'invalid-required-field', path, 'Shot must be an object.'),
    );
    return undefined;
  }

  const shotId = readTrimmedString(record['shotId']);
  const shotNumber = readOptionalPositiveNumber(record['shotNumber']);
  const duration = readOptionalPositiveNumber(record['duration']);
  const visualDescription = readTrimmedString(record['visualDescription']);
  const characterAction = readTrimmedString(record['characterAction']);
  const imageStrategy = normalizeImageStrategy(record['imageStrategy']);
  const sourceMediaRefs = normalizeMediaRefs(
    record['sourceMediaRefs'],
    [...path, 'sourceMediaRefs'],
    diagnostics,
  );
  const generatedMediaRefs = normalizeMediaRefs(
    record['generatedMediaRefs'],
    [...path, 'generatedMediaRefs'],
    diagnostics,
  );
  const mediaRefs = normalizeMediaRefs(record['mediaRefs'], [...path, 'mediaRefs'], diagnostics);
  const splitRefs =
    sourceMediaRefs.length === 0 && generatedMediaRefs.length === 0 && mediaRefs.length > 0
      ? splitStoryboardMediaRefsByRoleV1(mediaRefs, [...path, 'mediaRefs'])
      : undefined;
  if (splitRefs) {
    diagnostics.push(...splitRefs.diagnostics);
  }
  const normalizedSourceRefs =
    sourceMediaRefs.length > 0 ? sourceMediaRefs : (splitRefs?.sourceMediaRefs ?? []);
  const normalizedGeneratedRefs =
    generatedMediaRefs.length > 0 ? generatedMediaRefs : (splitRefs?.generatedMediaRefs ?? []);
  const normalizedMediaRefs = dedupeStoryboardMediaRefs([
    ...mediaRefs,
    ...normalizedSourceRefs,
    ...normalizedGeneratedRefs,
  ]);
  const characters = normalizeCharacters(
    record['characters'],
    [...path, 'characters'],
    diagnostics,
  );
  const emotion = normalizeStringArray(record['emotion']);
  const sceneTags = normalizeStringArray(record['sceneTags']);
  const vfx = normalizeStringArray(record['vfx']);
  const extensions = normalizeExtensions(
    record['extensions'],
    [...path, 'extensions'],
    diagnostics,
  );
  const shotScale = normalizeShotScale(record['shotScale']);
  const cameraMovement = normalizeCameraMovement(record['cameraMovement']);
  const cameraAngle = normalizeCameraAngle(record['cameraAngle']);
  const dialogue = readTrimmedString(record['dialogue']);
  const voiceOver = readTrimmedString(record['voiceOver']);
  const soundCue = readTrimmedString(record['soundCue']);
  const generationPrompt = readTrimmedString(record['generationPrompt']);
  const visualStyle = readTrimmedString(record['visualStyle']);
  const referenceImagePath = readTrimmedString(record['referenceImagePath']);
  const decisionReason = readTrimmedString(record['decisionReason']);

  if (shotNumber === undefined) {
    diagnostics.push(missingRequiredDiagnostic([...path, 'shotNumber'], 'shotNumber'));
  }
  if (duration === undefined) {
    diagnostics.push(missingRequiredDiagnostic([...path, 'duration'], 'duration'));
  }
  if (!visualDescription) {
    diagnostics.push(
      missingRequiredDiagnostic([...path, 'visualDescription'], 'visualDescription'),
    );
  }
  if (!characterAction) {
    diagnostics.push(missingRequiredDiagnostic([...path, 'characterAction'], 'characterAction'));
  }
  if (!imageStrategy) {
    diagnostics.push(
      storyboardDiagnostic(
        'error',
        'invalid-image-strategy',
        [...path, 'imageStrategy'],
        'Shot imageStrategy must be a supported storyboard image strategy.',
        {
          expected: STORYBOARD_SHOT_IMAGE_STRATEGIES_V1.join(', '),
          actual: serializableDiagnosticValue(record['imageStrategy']),
        },
      ),
    );
  }

  if (
    shotNumber === undefined ||
    duration === undefined ||
    !visualDescription ||
    !characterAction ||
    !imageStrategy
  ) {
    return undefined;
  }

  return {
    ...(shotId ? { shotId } : {}),
    shotNumber,
    duration,
    visualDescription,
    ...(characters.length > 0 ? { characters } : {}),
    ...(shotScale ? { shotScale } : {}),
    ...(cameraMovement ? { cameraMovement } : {}),
    ...(cameraAngle ? { cameraAngle } : {}),
    characterAction,
    ...(emotion.length > 0 ? { emotion } : {}),
    ...(sceneTags.length > 0 ? { sceneTags } : {}),
    ...(dialogue ? { dialogue } : {}),
    ...(voiceOver ? { voiceOver } : {}),
    ...(soundCue ? { soundCue } : {}),
    ...(generationPrompt ? { generationPrompt } : {}),
    ...(visualStyle ? { visualStyle } : {}),
    ...(referenceImagePath ? { referenceImagePath } : {}),
    ...(vfx.length > 0 ? { vfx } : {}),
    imageStrategy,
    ...(normalizedSourceRefs.length > 0 ? { sourceMediaRefs: normalizedSourceRefs } : {}),
    ...(normalizedGeneratedRefs.length > 0 ? { generatedMediaRefs: normalizedGeneratedRefs } : {}),
    ...(normalizedMediaRefs.length > 0 ? { mediaRefs: normalizedMediaRefs } : {}),
    ...(decisionReason ? { decisionReason } : {}),
    ...(extensions ? { extensions } : {}),
  };
}

function validateNormalizedStoryboardTableV1(
  table: StoryboardTableV1,
): readonly StoryboardValidationDiagnosticV1[] {
  const diagnostics: StoryboardValidationDiagnosticV1[] = [];
  if (table.profile) {
    diagnostics.push(...validateProfileHints(table));
  }

  for (const [sceneIndex, scene] of table.scenes.entries()) {
    for (const [shotIndex, shot] of scene.shots.entries()) {
      const path = ['scenes', sceneIndex, 'shots', shotIndex] as const;
      validateShotStrategy(shot, path, diagnostics);
      validateLayeredMediaRefs(
        shot.sourceMediaRefs,
        'source',
        [...path, 'sourceMediaRefs'],
        diagnostics,
      );
      validateLayeredMediaRefs(
        shot.generatedMediaRefs,
        'generated',
        [...path, 'generatedMediaRefs'],
        diagnostics,
      );
      validateMediaRefs(shot.sourceMediaRefs, [...path, 'sourceMediaRefs'], diagnostics);
      validateMediaRefs(shot.generatedMediaRefs, [...path, 'generatedMediaRefs'], diagnostics);
      validateMediaRefs(shot.mediaRefs, [...path, 'mediaRefs'], diagnostics);
    }
  }

  return diagnostics;
}

function validateShotStrategy(
  shot: StoryboardShotRowV1,
  path: readonly StoryboardValidationDiagnosticPathSegmentV1[],
  diagnostics: StoryboardValidationDiagnosticV1[],
): void {
  const sourceRefs = shot.sourceMediaRefs ?? [];
  if (
    (shot.imageStrategy === 'reuse-original' ||
      shot.imageStrategy === 'use-as-reference' ||
      shot.imageStrategy === 'transform-original') &&
    sourceRefs.length === 0
  ) {
    diagnostics.push(
      storyboardDiagnostic(
        'error',
        'image-strategy-missing-source',
        [...path, 'sourceMediaRefs'],
        `${shot.imageStrategy} requires sourceMediaRefs.`,
      ),
    );
  }

  if (shot.imageStrategy === 'generate-new' && !shot.generationPrompt?.trim()) {
    diagnostics.push(
      storyboardDiagnostic(
        'error',
        'image-strategy-missing-prompt',
        [...path, 'generationPrompt'],
        'generate-new requires generationPrompt.',
      ),
    );
  }
}

function validateLayeredMediaRefs(
  refs: readonly StoryboardMediaRefV1[] | undefined,
  layer: 'source' | 'generated',
  path: readonly StoryboardValidationDiagnosticPathSegmentV1[],
  diagnostics: StoryboardValidationDiagnosticV1[],
): void {
  for (const [index, ref] of (refs ?? []).entries()) {
    const allowed =
      layer === 'source'
        ? isSourceStoryboardMediaRole(ref.role)
        : isGeneratedStoryboardMediaRole(ref.role);
    if (!allowed) {
      diagnostics.push(
        storyboardDiagnostic(
          'error',
          'media-ref-role-mismatch',
          [...path, index, 'role'],
          `${layer}MediaRefs contains incompatible role ${ref.role}.`,
          {
            expected:
              layer === 'source'
                ? STORYBOARD_SOURCE_MEDIA_ROLES_V1.join(', ')
                : STORYBOARD_GENERATED_MEDIA_ROLES_V1.join(', '),
            actual: ref.role,
          },
        ),
      );
    }
  }
}

function validateMediaRefs(
  refs: readonly StoryboardMediaRefV1[] | undefined,
  path: readonly StoryboardValidationDiagnosticPathSegmentV1[],
  diagnostics: StoryboardValidationDiagnosticV1[],
): void {
  for (const [index, ref] of (refs ?? []).entries()) {
    validateMediaLocator(ref.locator, [...path, index, 'locator'], diagnostics);
  }
}

function validateMediaLocator(
  locator: StoryboardMediaLocatorV1,
  path: readonly StoryboardValidationDiagnosticPathSegmentV1[],
  diagnostics: StoryboardValidationDiagnosticV1[],
): void {
  switch (locator.type) {
    case 'tool-result':
      if (
        !locator.toolCallId.trim() ||
        !Number.isInteger(locator.assetIndex) ||
        locator.assetIndex < 0
      ) {
        diagnostics.push(
          storyboardDiagnostic('error', 'invalid-media-ref', path, 'Invalid tool-result locator.'),
        );
      }
      return;
    case 'asset':
      if (!locator.assetId.trim() || (locator.uri !== undefined && isUnsafeMediaUri(locator.uri))) {
        diagnostics.push(
          storyboardDiagnostic(
            'error',
            'unsafe-media-ref',
            path,
            'Invalid or unsafe asset locator.',
          ),
        );
      }
      return;
    case 'workspace-path':
      if (!locator.path.trim() || isUnsafeWorkspacePath(locator.path)) {
        diagnostics.push(
          storyboardDiagnostic(
            'error',
            'unsafe-media-ref',
            path,
            'Workspace media path must be relative or use ${VAR}/path.',
          ),
        );
      }
      return;
    case 'canvas-node':
      if (!locator.canvasNodeId.trim()) {
        diagnostics.push(
          storyboardDiagnostic(
            'error',
            'invalid-media-ref',
            path,
            'canvas-node locator needs canvasNodeId.',
          ),
        );
      }
      return;
    case 'story-source':
      if (!locator.storyId.trim()) {
        diagnostics.push(
          storyboardDiagnostic(
            'error',
            'invalid-media-ref',
            path,
            'story-source locator needs storyId.',
          ),
        );
      }
      return;
  }
}

function projectStoryboardCharactersToCanvas(
  characters: readonly StoryboardShotCharacterV1[] | undefined,
): readonly ShotCharacter[] {
  return (characters ?? []).map((character) => ({
    ...(character.characterId ? { characterId: character.characterId } : {}),
    characterName: character.name,
    ...(character.emotion ? { emotion: character.emotion } : {}),
  }));
}

function selectStoryboardShotImageRef(shot: StoryboardShotRowV1): StoryboardMediaRefV1 | undefined {
  const preferred = [
    ...(shot.generatedMediaRefs ?? []),
    ...(shot.sourceMediaRefs ?? []),
    ...(shot.mediaRefs ?? []),
  ];
  return preferred.find(
    (ref) => ref.mimeType?.startsWith('image/') || ref.locator.type === 'workspace-path',
  );
}

function resolveStoryboardWorkspacePath(mediaRef: StoryboardMediaRefV1): string | undefined {
  if (mediaRef.locator.type === 'workspace-path') return mediaRef.locator.path;
  if (mediaRef.locator.type === 'asset') return mediaRef.locator.uri;
  return undefined;
}

function findStoryboardImageTool(
  tools: readonly StoryboardImageToolCapabilityV1[],
  toolName: 'GenerateImage' | 'TransformImage',
): StoryboardImageToolCapabilityV1 | undefined {
  return tools.find((tool) => tool.toolName === toolName);
}

function isOverrideInScope(
  override: StoryboardImageStrategyOverrideV1 | undefined,
  sceneId: string,
  shotId: string,
): boolean {
  if (!override) return false;
  if (!override.scope) return true;
  const sceneScoped = override.scope.sceneIds?.includes(sceneId) ?? false;
  const shotScoped = override.scope.shotIds?.includes(shotId) ?? false;
  return sceneScoped || shotScoped;
}

function validateOverrideForShot(
  override: StoryboardImageStrategyOverrideV1 | undefined,
  shot: StoryboardShotRowV1,
  base: Omit<StoryboardImageStrategyBlockedActionV1, 'reason' | 'diagnostics'>,
): StoryboardImageStrategyBlockedActionV1 | undefined {
  if (!override) return undefined;
  if (override.allowedStrategies && !override.allowedStrategies.includes(shot.imageStrategy)) {
    return createBlockedAction(base, 'strategy-not-allowed', {
      code: 'generation-denied',
      path: ['userOverride', 'allowedStrategies'],
      message: `Storyboard image strategy ${shot.imageStrategy} is not allowed by user override.`,
    });
  }
  if (shot.imageStrategy === 'reuse-original') return undefined;
  if (override.generationPolicy === 'deny') {
    return createBlockedAction(base, 'generation-denied', {
      code: 'generation-denied',
      path: ['userOverride', 'generationPolicy'],
      message: 'User override denies image generation or transformation.',
    });
  }
  if (override.generationPolicy === 'confirm') {
    return createBlockedAction(base, 'confirmation-required', {
      code: 'generation-confirmation-required',
      path: ['userOverride', 'generationPolicy'],
      message: 'User override requires confirmation before image generation or transformation.',
    });
  }
  return undefined;
}

function pushBlockedAction(
  blockedActions: StoryboardImageStrategyBlockedActionV1[],
  diagnostics: StoryboardValidationDiagnosticV1[],
  base: Omit<StoryboardImageStrategyBlockedActionV1, 'reason' | 'diagnostics'>,
  reason: StoryboardImageStrategyBlockedActionV1['reason'],
  diagnostic: {
    readonly code: StoryboardValidationDiagnosticCodeV1;
    readonly path: readonly StoryboardValidationDiagnosticPathSegmentV1[];
    readonly message: string;
  },
): void {
  const blocked = createBlockedAction(base, reason, diagnostic);
  blockedActions.push(blocked);
  diagnostics.push(...blocked.diagnostics);
}

function createBlockedAction(
  base: Omit<StoryboardImageStrategyBlockedActionV1, 'reason' | 'diagnostics'>,
  reason: StoryboardImageStrategyBlockedActionV1['reason'],
  diagnostic: {
    readonly code: StoryboardValidationDiagnosticCodeV1;
    readonly path: readonly StoryboardValidationDiagnosticPathSegmentV1[];
    readonly message: string;
  },
): StoryboardImageStrategyBlockedActionV1 {
  return {
    ...base,
    reason,
    diagnostics: [
      storyboardDiagnostic(
        reason === 'missing-source' || reason === 'missing-prompt' ? 'error' : 'warning',
        diagnostic.code,
        diagnostic.path,
        diagnostic.message,
      ),
    ],
  };
}

function validateProfileHints(
  table: StoryboardTableV1,
): readonly StoryboardValidationDiagnosticV1[] {
  const diagnostics: StoryboardValidationDiagnosticV1[] = [];
  for (const [sceneIndex, scene] of table.scenes.entries()) {
    for (const [shotIndex, shot] of scene.shots.entries()) {
      const path = ['scenes', sceneIndex, 'shots', shotIndex] as const;
      if (table.profile === 'script-breakdown' && !shot.cameraAngle) {
        diagnostics.push(
          storyboardDiagnostic(
            'profileHint',
            'missing-profile-field',
            [...path, 'cameraAngle'],
            'script-breakdown profile recommends cameraAngle.',
          ),
        );
      }
      if (table.profile === 'manga-to-video' && (shot.sourceMediaRefs ?? []).length === 0) {
        diagnostics.push(
          storyboardDiagnostic(
            'profileHint',
            'missing-profile-field',
            [...path, 'sourceMediaRefs'],
            'manga-to-video profile recommends sourceMediaRefs.',
          ),
        );
      }
    }
  }
  return diagnostics;
}

function normalizeLegacyStoryboardSections(
  root: Record<string, unknown>,
  fallbackTitle: string | undefined,
  diagnostics: StoryboardValidationDiagnosticV1[],
): StoryboardTableV1 | undefined {
  if (root['template'] !== 'storyboard-table' || !Array.isArray(root['sections'])) {
    diagnostics.push(
      storyboardDiagnostic(
        'error',
        'invalid-root',
        [],
        'Legacy storyboard compatibility normalization needs template storyboard-table and sections.',
      ),
    );
    return undefined;
  }

  const title = readTrimmedString(root['title']) ?? fallbackTitle?.trim() ?? 'Storyboard';
  const sections = root['sections'].slice(0, MAX_LEGACY_SECTIONS);
  const shots = sections.flatMap((section, index) => {
    const normalized = normalizeLegacySectionToShot(section, index, diagnostics);
    return normalized ? [normalized] : [];
  });
  if (shots.length === 0) {
    diagnostics.push(
      storyboardDiagnostic(
        'error',
        'empty-shots',
        ['sections'],
        'Legacy storyboard needs renderable sections.',
      ),
    );
    return undefined;
  }

  return {
    schemaVersion: 1,
    kind: 'storyboard-table',
    profile: 'manual',
    source: { type: 'agent' },
    title,
    scenes: [
      {
        sceneId: 'legacy-scene-1',
        sceneTitle: title,
        sceneNumber: 1,
        shots,
      },
    ],
  };
}

function normalizeLegacySectionToShot(
  value: unknown,
  index: number,
  diagnostics: StoryboardValidationDiagnosticV1[],
): StoryboardShotRowV1 | undefined {
  const record = readStoryboardRecord(value);
  if (!record) return undefined;
  const heading = readTrimmedString(record['heading']);
  const content = readTrimmedString(record['content']);
  const mediaRefs = Array.isArray(record['mediaRefs'])
    ? record['mediaRefs'].slice(0, MAX_LEGACY_MEDIA_REFS).flatMap((mediaRef, mediaIndex) => {
        const normalized = normalizeLegacyMediaRef(mediaRef, index, mediaIndex, diagnostics);
        return normalized ? [normalized] : [];
      })
    : [];
  const splitRefs = splitStoryboardMediaRefsByRoleV1(mediaRefs, ['sections', index, 'mediaRefs']);
  diagnostics.push(...splitRefs.diagnostics);
  const visualDescription = content ?? heading;
  if (!visualDescription && mediaRefs.length === 0) return undefined;

  const shot: StoryboardShotRowV1 = {
    shotId: `legacy-shot-${index + 1}`,
    shotNumber: index + 1,
    duration: 3,
    visualDescription: visualDescription ?? `Storyboard shot ${index + 1}`,
    characterAction: visualDescription ?? '',
    imageStrategy: splitRefs.sourceMediaRefs.length > 0 ? 'reuse-original' : 'generate-new',
    ...(heading ? { sceneTags: [heading] } : {}),
    ...(splitRefs.sourceMediaRefs.length > 0 ? { sourceMediaRefs: splitRefs.sourceMediaRefs } : {}),
    ...(splitRefs.generatedMediaRefs.length > 0
      ? { generatedMediaRefs: splitRefs.generatedMediaRefs }
      : {}),
    ...(mediaRefs.length > 0 ? { mediaRefs } : {}),
  };

  return shot.imageStrategy === 'generate-new' && !shot.generationPrompt
    ? { ...shot, generationPrompt: shot.visualDescription }
    : shot;
}

function normalizeLegacyMediaRef(
  value: unknown,
  sectionIndex: number,
  mediaIndex: number,
  diagnostics: StoryboardValidationDiagnosticV1[],
): StoryboardMediaRefV1 | undefined {
  const record = readStoryboardRecord(value);
  const path = ['sections', sectionIndex, 'mediaRefs', mediaIndex] as const;
  if (!record) return undefined;
  const toolCallId = readTrimmedString(record['toolCallId']);
  if (!toolCallId) {
    diagnostics.push(
      storyboardDiagnostic(
        'warning',
        'invalid-media-ref',
        path,
        'Legacy media ref needs toolCallId.',
      ),
    );
    return undefined;
  }
  const assetIndex = readNonNegativeInteger(record['assetIndex']) ?? 0;
  const role = normalizeLegacyMediaRole(readTrimmedString(record['role']));
  return {
    refId: `legacy:${toolCallId}:${assetIndex}`,
    role,
    locator: {
      type: 'tool-result',
      toolCallId,
      assetIndex,
    },
    ...(readTrimmedString(record['caption'])
      ? { label: readTrimmedString(record['caption']) }
      : {}),
  };
}

function normalizeMediaRefs(
  value: unknown,
  path: readonly StoryboardValidationDiagnosticPathSegmentV1[],
  diagnostics: StoryboardValidationDiagnosticV1[],
): readonly StoryboardMediaRefV1[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((ref, index) => {
    const normalized = normalizeMediaRef(ref, [...path, index], diagnostics);
    return normalized ? [normalized] : [];
  });
}

function normalizeMediaRef(
  value: unknown,
  path: readonly StoryboardValidationDiagnosticPathSegmentV1[],
  diagnostics: StoryboardValidationDiagnosticV1[],
): StoryboardMediaRefV1 | undefined {
  const record = readStoryboardRecord(value);
  if (!record) {
    diagnostics.push(
      storyboardDiagnostic('error', 'invalid-media-ref', path, 'Media ref must be an object.'),
    );
    return undefined;
  }

  const refId = readTrimmedString(record['refId']);
  const role = normalizeMediaRole(record['role']);
  const locator = normalizeMediaLocator(record['locator'], [...path, 'locator'], diagnostics);
  const label = readTrimmedString(record['label']) ?? readTrimmedString(record['caption']);
  const mimeType = readTrimmedString(record['mimeType']);
  const metadata = normalizeSerializableRecord(record['metadata']);

  if (!refId) {
    diagnostics.push(
      storyboardDiagnostic(
        'error',
        'invalid-media-ref',
        [...path, 'refId'],
        'Media ref needs refId.',
      ),
    );
  }
  if (!role) {
    diagnostics.push(
      storyboardDiagnostic(
        'error',
        'invalid-media-ref',
        [...path, 'role'],
        'Media ref needs a supported role.',
        {
          expected: STORYBOARD_MEDIA_ROLES_V1.join(', '),
          actual: serializableDiagnosticValue(record['role']),
        },
      ),
    );
  }
  if (!locator) {
    diagnostics.push(
      storyboardDiagnostic(
        'error',
        'invalid-media-ref',
        [...path, 'locator'],
        'Media ref needs locator.',
      ),
    );
  }

  if (!refId || !role || !locator) return undefined;

  return {
    refId,
    role,
    locator,
    ...(label ? { label } : {}),
    ...(mimeType ? { mimeType } : {}),
    ...(metadata ? { metadata } : {}),
  };
}

function normalizeMediaLocator(
  value: unknown,
  path: readonly StoryboardValidationDiagnosticPathSegmentV1[],
  diagnostics: StoryboardValidationDiagnosticV1[],
): StoryboardMediaLocatorV1 | undefined {
  const record = readStoryboardRecord(value);
  if (!record) return undefined;
  const type = record['type'];
  switch (type) {
    case 'tool-result': {
      const toolCallId = readTrimmedString(record['toolCallId']);
      const assetIndex = readNonNegativeInteger(record['assetIndex']);
      if (!toolCallId || assetIndex === undefined) return undefined;
      return {
        type,
        toolCallId,
        assetIndex,
        ...(readTrimmedString(record['taskId'])
          ? { taskId: readTrimmedString(record['taskId']) }
          : {}),
      };
    }
    case 'asset': {
      const assetId = readTrimmedString(record['assetId']);
      if (!assetId) return undefined;
      return {
        type,
        assetId,
        ...(readTrimmedString(record['assetVersion'])
          ? { assetVersion: readTrimmedString(record['assetVersion']) }
          : {}),
        ...(readTrimmedString(record['uri']) ? { uri: readTrimmedString(record['uri']) } : {}),
      };
    }
    case 'workspace-path': {
      const pathValue = readTrimmedString(record['path']);
      return pathValue ? { type, path: pathValue } : undefined;
    }
    case 'canvas-node': {
      const canvasNodeId = readTrimmedString(record['canvasNodeId']);
      return canvasNodeId
        ? {
            type,
            canvasNodeId,
            ...(readTrimmedString(record['outputId'])
              ? { outputId: readTrimmedString(record['outputId']) }
              : {}),
          }
        : undefined;
    }
    case 'story-source': {
      const storyId = readTrimmedString(record['storyId']);
      const frameIndex = readNonNegativeInteger(record['frameIndex']);
      return storyId
        ? {
            type,
            storyId,
            ...(readTrimmedString(record['sceneId'])
              ? { sceneId: readTrimmedString(record['sceneId']) }
              : {}),
            ...(frameIndex !== undefined ? { frameIndex } : {}),
          }
        : undefined;
    }
    default:
      diagnostics.push(
        storyboardDiagnostic(
          'error',
          'invalid-media-ref',
          path,
          'Media locator has unsupported type.',
          { actual: serializableDiagnosticValue(type) },
        ),
      );
      return undefined;
  }
}

function normalizeCharacters(
  value: unknown,
  path: readonly StoryboardValidationDiagnosticPathSegmentV1[],
  diagnostics: StoryboardValidationDiagnosticV1[],
): readonly StoryboardShotCharacterV1[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((character, index) => {
    const record = readStoryboardRecord(character);
    if (!record) return [];
    const name = readTrimmedString(record['name']) ?? readTrimmedString(record['characterName']);
    if (!name) {
      diagnostics.push(
        storyboardDiagnostic(
          'warning',
          'invalid-required-field',
          [...path, index, 'name'],
          'Character entry needs name.',
        ),
      );
      return [];
    }
    const role = normalizeCharacterRole(record['role']);
    return [
      {
        ...(readTrimmedString(record['characterId'])
          ? { characterId: readTrimmedString(record['characterId']) }
          : {}),
        name,
        ...(role ? { role } : {}),
        ...(readTrimmedString(record['action'])
          ? { action: readTrimmedString(record['action']) }
          : {}),
        ...(readTrimmedString(record['emotion'])
          ? { emotion: readTrimmedString(record['emotion']) }
          : {}),
        ...(readTrimmedString(record['continuityNotes'])
          ? { continuityNotes: readTrimmedString(record['continuityNotes']) }
          : {}),
      },
    ];
  });
}

function normalizeStoryboardTableSource(
  value: unknown,
  diagnostics: StoryboardValidationDiagnosticV1[],
): StoryboardTableSourceV1 | undefined {
  const record = readStoryboardRecord(value);
  if (!record) return undefined;
  const type = record['type'];
  if (
    type !== 'story' &&
    type !== 'agent' &&
    type !== 'document' &&
    type !== 'image' &&
    type !== 'manual'
  ) {
    diagnostics.push(
      storyboardDiagnostic(
        'warning',
        'invalid-required-field',
        ['source', 'type'],
        'Unknown source type.',
      ),
    );
    return undefined;
  }
  return {
    type,
    ...(readTrimmedString(record['sourceUri'])
      ? { sourceUri: readTrimmedString(record['sourceUri']) }
      : {}),
    ...(readTrimmedString(record['sourceSceneId'])
      ? { sourceSceneId: readTrimmedString(record['sourceSceneId']) }
      : {}),
    ...(readTrimmedString(record['sourceDocumentId'])
      ? { sourceDocumentId: readTrimmedString(record['sourceDocumentId']) }
      : {}),
    ...(readTrimmedString(record['label']) ? { label: readTrimmedString(record['label']) } : {}),
  };
}

function normalizeExtensions(
  value: unknown,
  path: readonly StoryboardValidationDiagnosticPathSegmentV1[],
  diagnostics: StoryboardValidationDiagnosticV1[],
): StoryboardExtensionMapV1 | undefined {
  const record = readStoryboardRecord(value);
  if (!record) return undefined;

  const entries: [StoryboardExtensionNamespaceV1, StoryboardSerializableValueV1][] = [];
  for (const [key, extensionValue] of Object.entries(record)) {
    if (!key.startsWith('neko.')) {
      diagnostics.push(
        storyboardDiagnostic(
          'error',
          'invalid-extension-namespace',
          [...path, key],
          'Storyboard extension keys must use the neko.* namespace.',
        ),
      );
      continue;
    }
    if (!isStoryboardSerializableValue(extensionValue)) {
      diagnostics.push(
        storyboardDiagnostic(
          'error',
          'non-serializable-extension',
          [...path, key],
          'Storyboard extension values must be JSON-serializable.',
        ),
      );
      continue;
    }
    entries.push([key as StoryboardExtensionNamespaceV1, extensionValue]);
  }

  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function normalizeSerializableRecord(value: unknown): StoryboardSerializableRecordV1 | undefined {
  const record = readStoryboardRecord(value);
  if (!record || !isStoryboardSerializableRecord(record)) return undefined;
  return record;
}

function isStoryboardSerializableRecord(value: unknown): value is StoryboardSerializableRecordV1 {
  return readStoryboardRecord(value) !== undefined && isStoryboardSerializableValue(value);
}

function normalizeProfile(
  value: unknown,
  diagnostics: StoryboardValidationDiagnosticV1[],
): StoryboardTableProfileV1 | undefined {
  if (value === undefined) return undefined;
  if (isStoryboardTableProfile(value)) return value;
  diagnostics.push(
    storyboardDiagnostic(
      'warning',
      'invalid-profile',
      ['profile'],
      'Storyboard profile is not a built-in v1 profile.',
      {
        expected: STORYBOARD_TABLE_V1_PROFILES.join(', '),
        actual: serializableDiagnosticValue(value),
      },
    ),
  );
  return undefined;
}

function normalizeImageStrategy(value: unknown): StoryboardShotImageStrategyV1 | undefined {
  return isStoryboardImageStrategy(value) ? value : undefined;
}

function normalizeMediaRole(value: unknown): StoryboardMediaRoleV1 | undefined {
  return isStoryboardMediaRole(value) ? value : undefined;
}

function normalizeLegacyMediaRole(value: string | undefined): StoryboardMediaRoleV1 {
  switch (value) {
    case 'source':
    case 'original':
    case 'input':
      return 'source';
    case 'reference':
    case 'ref':
      return 'reference';
    case 'generated':
    case 'result':
    case 'shot':
      return 'generated';
    case 'derived':
    case 'colorized':
    case 'transformed':
      return 'derived';
    case 'thumbnail':
      return 'thumbnail';
    case 'mask':
      return 'mask';
    default:
      return 'reference';
  }
}

function normalizeCharacterRole(value: unknown): StoryboardShotCharacterRoleV1 | undefined {
  return value === 'primary' || value === 'secondary' || value === 'background' ? value : undefined;
}

function normalizeShotScale(value: unknown): ShotScale | undefined {
  return value === 'ECU' ||
    value === 'CU' ||
    value === 'MCU' ||
    value === 'MS' ||
    value === 'MLS' ||
    value === 'LS' ||
    value === 'VLS' ||
    value === 'ELS' ||
    value === 'OTS' ||
    value === 'POV'
    ? value
    : undefined;
}

function normalizeCameraMovement(value: unknown): CameraMovement | undefined {
  return value === 'static' ||
    value === 'pan' ||
    value === 'tilt' ||
    value === 'zoom-in' ||
    value === 'zoom-out' ||
    value === 'dolly' ||
    value === 'dolly-in' ||
    value === 'dolly-out' ||
    value === 'handheld' ||
    value === 'crane'
    ? value
    : undefined;
}

function normalizeCameraAngle(value: unknown): CameraAngle | undefined {
  return value === 'eye-level' ||
    value === 'high-angle' ||
    value === 'low-angle' ||
    value === 'bird-eye' ||
    value === 'dutch'
    ? value
    : undefined;
}

function isStoryboardTableProfile(value: unknown): value is StoryboardTableProfileV1 {
  return (
    typeof value === 'string' && (STORYBOARD_TABLE_V1_PROFILES as readonly string[]).includes(value)
  );
}

function isStoryboardImageStrategy(value: unknown): value is StoryboardShotImageStrategyV1 {
  return (
    typeof value === 'string' &&
    (STORYBOARD_SHOT_IMAGE_STRATEGIES_V1 as readonly string[]).includes(value)
  );
}

function isStoryboardMediaRole(value: unknown): value is StoryboardMediaRoleV1 {
  return (
    typeof value === 'string' && (STORYBOARD_MEDIA_ROLES_V1 as readonly string[]).includes(value)
  );
}

function isSourceStoryboardMediaRole(
  value: StoryboardMediaRoleV1,
): value is StoryboardSourceMediaRoleV1 {
  return (STORYBOARD_SOURCE_MEDIA_ROLES_V1 as readonly string[]).includes(value);
}

function isGeneratedStoryboardMediaRole(
  value: StoryboardMediaRoleV1,
): value is StoryboardGeneratedMediaRoleV1 {
  return (STORYBOARD_GENERATED_MEDIA_ROLES_V1 as readonly string[]).includes(value);
}

function isUnsafeMediaUri(value: string): boolean {
  return (
    value.startsWith('data:') ||
    value.startsWith('blob:') ||
    /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(value) ||
    value.startsWith('file://') ||
    isAbsoluteLocalPath(value)
  );
}

function isUnsafeWorkspacePath(value: string): boolean {
  return (
    value.startsWith('data:') ||
    value.startsWith('blob:') ||
    /^https?:\/\//i.test(value) ||
    value.startsWith('file://') ||
    isAbsoluteLocalPath(value)
  );
}

function isAbsoluteLocalPath(value: string): boolean {
  return value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value);
}

function isStoryboardSerializableValue(
  value: unknown,
  seen: ReadonlySet<object> = new Set(),
  depth = 0,
): value is StoryboardSerializableValueV1 {
  if (depth > 32) return false;
  if (value === null) return true;
  if (typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'undefined' || typeof value === 'function' || typeof value === 'symbol') {
    return false;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) return false;
    const nextSeen = new Set(seen).add(value);
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.prototype.hasOwnProperty.call(value, index)) return false;
      if (!isStoryboardSerializableValue(value[index], nextSeen, depth + 1)) return false;
    }
    return true;
  }
  const record = readStoryboardRecord(value);
  if (!record || seen.has(record)) return false;
  const nextSeen = new Set(seen).add(record);
  return Object.values(record).every((item) =>
    isStoryboardSerializableValue(item, nextSeen, depth + 1),
  );
}

function dedupeStoryboardMediaRefs(
  mediaRefs: readonly StoryboardMediaRefV1[],
): readonly StoryboardMediaRefV1[] {
  const seen = new Set<string>();
  const result: StoryboardMediaRefV1[] = [];
  for (const ref of mediaRefs) {
    if (seen.has(ref.refId)) continue;
    seen.add(ref.refId);
    result.push(ref);
  }
  return result;
}

function readStoryboardRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readTrimmedString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function readOptionalPositiveNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;
}

function readNonNegativeInteger(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined;
}

function normalizeStringArray(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    const normalized = readTrimmedString(item);
    return normalized ? [normalized] : [];
  });
}

function missingRequiredDiagnostic(
  path: readonly StoryboardValidationDiagnosticPathSegmentV1[],
  field: string,
): StoryboardValidationDiagnosticV1 {
  return storyboardDiagnostic(
    'error',
    'missing-required-field',
    path,
    `Missing required storyboard field ${field}.`,
    { expected: field },
  );
}

function storyboardDiagnostic(
  severity: StoryboardValidationDiagnosticSeverityV1,
  code: StoryboardValidationDiagnosticCodeV1,
  path: readonly StoryboardValidationDiagnosticPathSegmentV1[],
  message: string,
  options: {
    readonly expected?: string;
    readonly actual?: StoryboardSerializableValueV1;
    readonly details?: StoryboardSerializableRecordV1;
  } = {},
): StoryboardValidationDiagnosticV1 {
  return {
    severity,
    code,
    path,
    message,
    ...(options.expected ? { expected: options.expected } : {}),
    ...(options.actual !== undefined ? { actual: options.actual } : {}),
    ...(options.details ? { details: options.details } : {}),
  };
}

function limitStoryboardDiagnostics(
  diagnostics: readonly StoryboardValidationDiagnosticV1[],
): readonly StoryboardValidationDiagnosticV1[] {
  return diagnostics.slice(0, MAX_STORYBOARD_DIAGNOSTICS);
}

function serializableDiagnosticValue(value: unknown): StoryboardSerializableValueV1 {
  return isStoryboardSerializableValue(value) ? value : String(value);
}
