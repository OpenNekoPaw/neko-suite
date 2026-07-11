import {
  STORYBOARD_CANONICAL_CONTRACT_VERSION,
  STORYBOARD_TABLE_KIND,
  STORYBOARD_TABLE_SCHEMA_VERSION,
  validateCanonicalStoryboardTable,
  validateDurableResourceRef,
  type DocumentArchiveResourceRef,
  type NekoStoryScriptIndex,
  type ResourceRef,
  type StoryScenePlan,
  type StoryShotPlan,
  type StoryboardMediaRef,
  type StoryboardSceneRow,
  type StoryboardShotRow,
  type StoryboardSourceProfileId,
  type StoryboardSourceTrace,
  type StoryboardTable,
} from '@neko/shared';

export type StoryboardNormalizationDiagnosticCode =
  | 'invalid-source'
  | 'invalid-resource-ref'
  | 'missing-story-planner'
  | 'missing-document-extractor'
  | 'missing-comic-perception'
  | 'unsupported-document-route'
  | 'invalid-refinement'
  | 'invalid-canonical-storyboard';

export interface StoryboardNormalizationDiagnostic {
  readonly severity: 'error' | 'warning';
  readonly code: StoryboardNormalizationDiagnosticCode;
  readonly message: string;
  readonly path?: readonly (string | number)[];
}

export interface StoryboardPlanningContext {
  readonly title: string;
  readonly sourceProfile: 'from-prompt' | 'from-text';
  readonly sourceRef: ResourceRef;
}

export interface StoryboardScriptPlanningContext {
  readonly title: string;
  readonly scriptIndex: NekoStoryScriptIndex;
  readonly lines: readonly string[];
  readonly sourceRef: ResourceRef;
}

export interface StoryboardStoryPlanningPort {
  planText(text: string, context: StoryboardPlanningContext): Promise<readonly StoryScenePlan[]>;
  planScript(context: StoryboardScriptPlanningContext): Promise<readonly StoryScenePlan[]>;
}

export type StoryboardDocumentRoute = 'text' | 'visual' | 'comic' | 'mixed';

export interface StoryboardExtractedDocument {
  readonly route: StoryboardDocumentRoute;
  readonly title?: string;
  readonly text?: string;
  readonly images?: readonly ResourceRef[];
  readonly comicSource?: StoryboardComicSource;
}

export interface StoryboardDocumentExtractionPort {
  extract(source: DocumentArchiveResourceRef): Promise<StoryboardExtractedDocument>;
}

export interface StoryboardComicBubble {
  readonly bubbleId: string;
  readonly text: string;
  readonly speaker?: string;
  readonly order: number;
  readonly region?: StoryboardSourceTrace['sourceRegion'];
}

export interface StoryboardComicPanel {
  readonly panelId: string;
  readonly page: number;
  readonly order: number;
  readonly imageRef: ResourceRef;
  readonly region?: StoryboardSourceTrace['sourceRegion'];
  readonly visualDescription: string;
  readonly characterAction?: string;
  readonly bubbles?: readonly StoryboardComicBubble[];
  readonly continuityNotes?: string;
  readonly duration?: number;
}

export interface StoryboardComicSource {
  readonly title?: string;
  readonly layout?: 'paged' | 'vertical-webtoon';
  readonly documentRef?: DocumentArchiveResourceRef;
  readonly resourceRef?: ResourceRef;
}

export interface StoryboardComicPerceptionPort {
  analyze(source: StoryboardComicSource): Promise<readonly StoryboardComicPanel[]>;
}

interface StoryboardTextSourceBase {
  readonly title: string;
  readonly text: string;
  readonly sourceRef: ResourceRef;
}

export interface StoryboardPromptSource extends StoryboardTextSourceBase {
  readonly profile: 'from-prompt';
}

export interface StoryboardProseSource extends StoryboardTextSourceBase {
  readonly profile: 'from-text';
}

export interface StoryboardScriptSource {
  readonly profile: 'from-script';
  readonly title: string;
  readonly scriptIndex: NekoStoryScriptIndex;
  readonly lines: readonly string[];
  readonly sourceRef: ResourceRef;
}

export interface StoryboardDocumentSource {
  readonly profile: 'from-document';
  readonly title?: string;
  readonly sourceDocumentRef: DocumentArchiveResourceRef;
}

export interface StoryboardComicNormalizationSource extends StoryboardComicSource {
  readonly profile: 'from-comic';
  readonly title: string;
}

export interface StoryboardImageSequenceSource {
  readonly profile: 'from-image-sequence';
  readonly title: string;
  readonly images: readonly ResourceRef[];
  readonly durationPerImage?: number;
}

export type StoryboardRefinementOperation =
  | {
      readonly kind: 'split-shot';
      readonly sceneId: string;
      readonly shotId: string;
      readonly shots: readonly StoryboardShotRow[];
    }
  | {
      readonly kind: 'merge-shots';
      readonly sceneId: string;
      readonly shotIds: readonly string[];
      readonly shot: StoryboardShotRow;
    }
  | {
      readonly kind: 'reorder-shots';
      readonly sceneId: string;
      readonly shotIds: readonly string[];
    }
  | {
      readonly kind: 'rewrite-shot';
      readonly sceneId: string;
      readonly shotId: string;
      readonly patch: Partial<Omit<StoryboardShotRow, 'shotId' | 'shotNumber'>>;
    }
  | {
      readonly kind: 'replace-reference';
      readonly sceneId: string;
      readonly shotId: string;
      readonly sourceMediaRefs: readonly StoryboardMediaRef[];
    };

export interface StoryboardExistingSource {
  readonly profile: 'from-existing-storyboard';
  readonly title?: string;
  readonly storyboard: StoryboardTable;
  readonly operations: readonly StoryboardRefinementOperation[];
}

export type StoryboardNormalizationSource =
  | StoryboardPromptSource
  | StoryboardProseSource
  | StoryboardScriptSource
  | StoryboardDocumentSource
  | StoryboardComicNormalizationSource
  | StoryboardImageSequenceSource
  | StoryboardExistingSource;

export interface StoryboardNormalizationPorts {
  readonly storyPlanner?: StoryboardStoryPlanningPort;
  readonly documentExtractor?: StoryboardDocumentExtractionPort;
  readonly comicPerception?: StoryboardComicPerceptionPort;
  readonly now?: () => string;
}

export interface StoryboardNormalizationResult {
  readonly table?: StoryboardTable;
  readonly routedProfile: StoryboardSourceProfileId;
  readonly documentRoute?: StoryboardDocumentRoute;
  readonly diagnostics: readonly StoryboardNormalizationDiagnostic[];
}

export async function normalizeStoryboardSource(
  source: StoryboardNormalizationSource,
  ports: StoryboardNormalizationPorts = {},
): Promise<StoryboardNormalizationResult> {
  switch (source.profile) {
    case 'from-prompt':
    case 'from-text':
      return normalizeTextSource(source, ports);
    case 'from-script':
      return normalizeScriptSource(source, ports);
    case 'from-document':
      return normalizeDocumentSource(source, ports);
    case 'from-comic':
      return normalizeComicSource(source, ports);
    case 'from-image-sequence':
      return normalizeImageSequence(source, ports);
    case 'from-existing-storyboard':
      return normalizeExistingStoryboard(source, ports);
  }
}

async function normalizeTextSource(
  source: StoryboardPromptSource | StoryboardProseSource,
  ports: StoryboardNormalizationPorts,
): Promise<StoryboardNormalizationResult> {
  const resourceDiagnostic = durableSourceDiagnostic(source.sourceRef, ['sourceRef']);
  if (resourceDiagnostic) return failed(source.profile, resourceDiagnostic);
  if (!source.text.trim())
    return failed(source.profile, invalidSource('Text source cannot be empty.'));
  if (!ports.storyPlanner) {
    return failed(source.profile, {
      severity: 'error',
      code: 'missing-story-planner',
      message: 'Storyboard text normalization requires the owning Story planning capability.',
    });
  }

  const plans = await ports.storyPlanner.planText(source.text, {
    title: source.title,
    sourceProfile: source.profile,
    sourceRef: source.sourceRef,
  });
  return finalize(
    createTableFromPlans(source.title, source.profile, plans, source.sourceRef, ports.now),
    source.profile,
  );
}

async function normalizeScriptSource(
  source: StoryboardScriptSource,
  ports: StoryboardNormalizationPorts,
): Promise<StoryboardNormalizationResult> {
  const resourceDiagnostic = durableSourceDiagnostic(source.sourceRef, ['sourceRef']);
  if (resourceDiagnostic) return failed(source.profile, resourceDiagnostic);
  if (!ports.storyPlanner) {
    return failed(source.profile, {
      severity: 'error',
      code: 'missing-story-planner',
      message: 'Screenplay normalization requires the owning Story planning capability.',
    });
  }

  const plans = await ports.storyPlanner.planScript({
    title: source.title,
    scriptIndex: source.scriptIndex,
    lines: source.lines,
    sourceRef: source.sourceRef,
  });
  const planByScene = new Map(plans.map((plan) => [plan.sceneId, plan]));
  let nextShotNumber = 1;
  const scenes = source.scriptIndex.scenes.map((scene, index): StoryboardSceneRow => {
    const plan = planByScene.get(scene.sceneId);
    const sceneTrace = createTrace(source.profile, source.sourceRef, `scene-${scene.sceneId}`, {
      sourceSceneId: scene.sceneId,
      sourceRegion: { startOffset: scene.line_start, endOffset: scene.line_end },
    });
    const shots = mapPlansToShots(plan?.shotPlans ?? [], sceneTrace, nextShotNumber);
    nextShotNumber += shots.length;
    return {
      sceneId: scene.sceneId,
      sceneTitle: plan?.sceneTitle ?? scene.sceneTitle,
      sceneNumber: parseSceneNumber(scene.sceneNumber, index + 1),
      ...(scene.location ? { location: scene.location } : {}),
      ...(scene.timeOfDay ? { timeOfDay: scene.timeOfDay } : {}),
      ...(plan?.summary || scene.actionSummary
        ? { summary: plan?.summary ?? scene.actionSummary }
        : {}),
      sourceTrace: [sceneTrace],
      shots:
        shots.length > 0
          ? shots
          : [
              defaultShot(nextShotNumber++, scene.actionSummary || scene.sceneTitle, sceneTrace, {
                dialogue: extractDialogue(source.lines, scene.line_start, scene.line_end),
              }),
            ],
    };
  });

  return finalize(
    createCanonicalTable({
      title: source.title,
      profile: source.profile,
      scenes,
      sourceRef: source.sourceRef,
      sourceType: 'story',
      sourceUri: source.scriptIndex.uri,
      now: ports.now,
    }),
    source.profile,
  );
}

async function normalizeDocumentSource(
  source: StoryboardDocumentSource,
  ports: StoryboardNormalizationPorts,
): Promise<StoryboardNormalizationResult> {
  if (!ports.documentExtractor) {
    return failed(source.profile, {
      severity: 'error',
      code: 'missing-document-extractor',
      message: 'Document normalization requires the owning Content extraction capability.',
    });
  }
  const extracted = await ports.documentExtractor.extract(source.sourceDocumentRef);
  const title = source.title ?? extracted.title ?? 'Document Storyboard';

  if (extracted.route === 'comic') {
    if (!extracted.comicSource) {
      return failed(
        'from-comic',
        invalidSource('Comic document extraction did not return a comic source.'),
      );
    }
    const result = await normalizeComicSource(
      { ...extracted.comicSource, profile: 'from-comic', title },
      ports,
    );
    return { ...result, documentRoute: extracted.route };
  }

  if (extracted.route === 'visual') {
    const result = normalizeDocumentVisuals(
      title,
      source.sourceDocumentRef,
      extracted.images ?? [],
      ports,
    );
    return { ...result, documentRoute: extracted.route };
  }

  if (extracted.route === 'text') {
    const result = await normalizeDocumentText(
      title,
      source.sourceDocumentRef,
      extracted.text,
      [],
      ports,
    );
    return { ...result, documentRoute: extracted.route };
  }

  if (extracted.route === 'mixed') {
    const result = await normalizeDocumentText(
      title,
      source.sourceDocumentRef,
      extracted.text,
      extracted.images ?? [],
      ports,
    );
    return { ...result, documentRoute: extracted.route };
  }

  return failed(source.profile, {
    severity: 'error',
    code: 'unsupported-document-route',
    message: `Unsupported document route: ${String(extracted.route)}.`,
  });
}

async function normalizeDocumentText(
  title: string,
  documentRef: DocumentArchiveResourceRef,
  text: string | undefined,
  images: readonly ResourceRef[],
  ports: StoryboardNormalizationPorts,
): Promise<StoryboardNormalizationResult> {
  if (!text?.trim())
    return failed('from-document', invalidSource('Extracted document text is empty.'));
  if (!ports.storyPlanner) {
    return failed('from-document', {
      severity: 'error',
      code: 'missing-story-planner',
      message: 'Text-bearing document normalization requires the owning Story planning capability.',
    });
  }
  const syntheticRef = createDocumentPlanningRef(documentRef, text);
  const plans = await ports.storyPlanner.planText(text, {
    title,
    sourceProfile: 'from-text',
    sourceRef: syntheticRef,
  });
  const table = createTableFromPlans(title, 'from-document', plans, documentRef, ports.now, images);
  return finalize(table, 'from-document');
}

function normalizeDocumentVisuals(
  title: string,
  documentRef: DocumentArchiveResourceRef,
  images: readonly ResourceRef[],
  ports: StoryboardNormalizationPorts,
): StoryboardNormalizationResult {
  const invalidIndex = images.findIndex((image) => !validateDurableResourceRef(image).ok);
  if (invalidIndex >= 0) {
    const diagnostic = durableSourceDiagnostic(images[invalidIndex], ['images', invalidIndex]);
    if (diagnostic) return failed('from-document', diagnostic);
  }
  if (images.length === 0)
    return failed('from-document', invalidSource('Visual document contains no extracted images.'));
  const documentTrace = createDocumentTrace('from-document', documentRef, 'document');
  const shots = images.map((image, index) =>
    imageShot(image, index + 1, documentTrace, `Document image ${index + 1}`),
  );
  return finalize(
    createCanonicalTable({
      title,
      profile: 'from-document',
      sourceDocumentRef: documentRef,
      sourceType: 'document',
      scenes: [
        { sceneId: 'document-visuals', sceneTitle: title, sourceTrace: [documentTrace], shots },
      ],
      now: ports.now,
    }),
    'from-document',
  );
}

async function normalizeComicSource(
  source: StoryboardComicNormalizationSource,
  ports: StoryboardNormalizationPorts,
): Promise<StoryboardNormalizationResult> {
  if (!source.documentRef && !source.resourceRef) {
    return failed(
      source.profile,
      invalidSource('Comic source requires a stable document or resource reference.'),
    );
  }
  if (source.resourceRef) {
    const diagnostic = durableSourceDiagnostic(source.resourceRef, ['resourceRef']);
    if (diagnostic) return failed(source.profile, diagnostic);
  }
  if (!ports.comicPerception) {
    return failed(source.profile, {
      severity: 'error',
      code: 'missing-comic-perception',
      message: 'Comic normalization requires the specialized comic perception capability.',
    });
  }
  const panels = [...(await ports.comicPerception.analyze(source))].sort(
    (left, right) => left.page - right.page || left.order - right.order,
  );
  if (panels.length === 0)
    return failed(source.profile, invalidSource('Comic analysis returned no panels.'));
  const invalidPanel = panels.findIndex((panel) => !validateDurableResourceRef(panel.imageRef).ok);
  if (invalidPanel >= 0) {
    const diagnostic = durableSourceDiagnostic(panels[invalidPanel]?.imageRef, [
      'panels',
      invalidPanel,
      'imageRef',
    ]);
    if (diagnostic) return failed(source.profile, diagnostic);
  }

  let shotNumber = 1;
  const grouped = new Map<number, StoryboardComicPanel[]>();
  for (const panel of panels) grouped.set(panel.page, [...(grouped.get(panel.page) ?? []), panel]);
  const scenes = [...grouped.entries()].map(([page, pagePanels]): StoryboardSceneRow => ({
    sceneId: `comic-page-${page}`,
    sceneTitle: `Page ${page}`,
    sourceTrace: [comicTrace(source, `page-${page}`, { page })],
    shots: pagePanels.map((panel) => {
      const trace = comicTrace(source, `panel-${panel.panelId}`, {
        ...(panel.region ?? {}),
        page: panel.page,
      });
      const dialogue = [...(panel.bubbles ?? [])]
        .sort((left, right) => left.order - right.order)
        .map((bubble) => (bubble.speaker ? `${bubble.speaker}: ${bubble.text}` : bubble.text))
        .join('\n');
      return {
        shotId: panel.panelId,
        shotNumber: shotNumber++,
        duration: panel.duration ?? 3,
        visualDescription: panel.visualDescription,
        characterAction: panel.characterAction ?? panel.visualDescription,
        imageStrategy: 'use-as-reference',
        ...(dialogue ? { dialogue } : {}),
        sourceMediaRefs: [mediaRef(panel.imageRef, `comic-panel-${panel.panelId}`)],
        sourceTrace: [trace],
        extensions: {
          'neko.comic': {
            layout: source.layout ?? 'paged',
            panelOrder: panel.order,
            continuityNotes: panel.continuityNotes ?? '',
            bubbles: (panel.bubbles ?? []).map((bubble) => ({
              bubbleId: bubble.bubbleId,
              order: bubble.order,
              text: bubble.text,
              speaker: bubble.speaker ?? '',
              region: bubble.region ? { ...bubble.region } : null,
            })),
          },
        },
      };
    }),
  }));

  return finalize(
    createCanonicalTable({
      title: source.title,
      profile: 'from-comic',
      scenes,
      sourceRef: source.resourceRef,
      sourceDocumentRef: source.documentRef,
      sourceType: 'document',
      now: ports.now,
    }),
    'from-comic',
  );
}

function normalizeImageSequence(
  source: StoryboardImageSequenceSource,
  ports: StoryboardNormalizationPorts,
): StoryboardNormalizationResult {
  if (source.images.length === 0)
    return failed(source.profile, invalidSource('Image sequence cannot be empty.'));
  const invalidIndex = source.images.findIndex((image) => !validateDurableResourceRef(image).ok);
  if (invalidIndex >= 0) {
    const diagnostic = durableSourceDiagnostic(source.images[invalidIndex], [
      'images',
      invalidIndex,
    ]);
    if (diagnostic) return failed(source.profile, diagnostic);
  }
  const firstImage = source.images[0];
  if (!firstImage) return failed(source.profile, invalidSource('Image sequence cannot be empty.'));
  const rootTrace = createTrace(source.profile, firstImage, 'image-sequence');
  const shots = source.images.map((image, index) =>
    imageShot(
      image,
      index + 1,
      createTrace(source.profile, image, `image-${index + 1}`),
      `Image ${index + 1}`,
      source.durationPerImage,
    ),
  );
  return finalize(
    createCanonicalTable({
      title: source.title,
      profile: source.profile,
      sourceRef: source.images[0],
      sourceType: 'image',
      scenes: [
        { sceneId: 'image-sequence', sceneTitle: source.title, sourceTrace: [rootTrace], shots },
      ],
      now: ports.now,
    }),
    source.profile,
  );
}

function normalizeExistingStoryboard(
  source: StoryboardExistingSource,
  ports: StoryboardNormalizationPorts,
): StoryboardNormalizationResult {
  const validation = validateCanonicalStoryboardTable(source.storyboard);
  if (!validation.ok || !source.storyboard.revision) {
    return failed(source.profile, {
      severity: 'error',
      code: 'invalid-canonical-storyboard',
      message: 'Existing Storyboard refinement requires a valid canonical Storyboard revision.',
    });
  }
  if (source.operations.length === 0) {
    return failed(source.profile, {
      severity: 'error',
      code: 'invalid-refinement',
      message: 'Existing Storyboard refinement requires at least one edit operation.',
    });
  }

  let scenes = source.storyboard.scenes.map(cloneScene);
  for (const operation of source.operations) {
    const result = applyRefinement(scenes, operation);
    if (!result.scenes) {
      return failed(
        source.profile,
        result.diagnostic ??
          invalidRefinement('Storyboard refinement failed without a diagnostic.'),
      );
    }
    scenes = result.scenes;
  }
  scenes = renumberShots(scenes);
  const now = ports.now?.() ?? new Date().toISOString();
  const base = {
    ...source.storyboard,
    title: source.title ?? source.storyboard.title,
    sourceProfile: 'from-existing-storyboard' as const,
    scenes,
    projections: [],
    sourceTrace: source.storyboard.sourceTrace?.map((trace) => ({
      ...trace,
      sourceProfile: 'from-existing-storyboard' as const,
      sourceRevisionId: source.storyboard.revision?.revisionId,
    })),
  };
  const digest = storyboardDigest(base);
  const table: StoryboardTable = {
    ...base,
    revision: {
      revisionId: `storyboard-${digest}`,
      sequence: source.storyboard.revision.sequence + 1,
      parentRevisionId: source.storyboard.revision.revisionId,
      contentDigest: digest,
      createdAt: now,
    },
  };
  return finalize(table, source.profile);
}

function createTableFromPlans(
  title: string,
  profile: StoryboardSourceProfileId,
  plans: readonly StoryScenePlan[],
  source: ResourceRef | DocumentArchiveResourceRef,
  now: StoryboardNormalizationPorts['now'],
  images: readonly ResourceRef[] = [],
): StoryboardTable {
  let nextShotNumber = 1;
  const scenes = plans.map((plan, index): StoryboardSceneRow => {
    const trace = isResource(source)
      ? createTrace(profile, source, `scene-${plan.sceneId}`, { sourceSceneId: plan.sceneId })
      : createDocumentTrace(profile, source, `scene-${plan.sceneId}`);
    const shots = mapPlansToShots(plan.shotPlans ?? [], trace, nextShotNumber, images);
    nextShotNumber += shots.length;
    return {
      sceneId: plan.sceneId,
      sceneTitle: plan.sceneTitle ?? `Scene ${index + 1}`,
      sceneNumber: index + 1,
      ...(plan.summary ? { summary: plan.summary } : {}),
      sourceTrace: [trace],
      shots:
        shots.length > 0
          ? shots
          : [defaultShot(nextShotNumber++, plan.summary ?? plan.sceneTitle ?? title, trace)],
    };
  });
  return createCanonicalTable({
    title,
    profile,
    scenes,
    ...(isResource(source) ? { sourceRef: source } : { sourceDocumentRef: source }),
    sourceType: profile === 'from-document' ? 'document' : 'agent',
    now,
  });
}

function mapPlansToShots(
  plans: readonly StoryShotPlan[],
  trace: StoryboardSourceTrace,
  startNumber: number,
  images: readonly ResourceRef[] = [],
): StoryboardShotRow[] {
  return plans.map((plan, index): StoryboardShotRow => {
    const shotNumber = startNumber + index;
    const image = images[index];
    return {
      shotId: plan.shotId ?? `${trace.traceId}-shot-${shotNumber}`,
      shotNumber,
      duration: plan.duration ?? 3,
      visualDescription: plan.visualDescription?.trim() || `Shot ${shotNumber}`,
      characterAction:
        plan.characterAction?.trim() ||
        plan.visualDescription?.trim() ||
        'Establish the story beat.',
      imageStrategy: image
        ? 'use-as-reference'
        : plan.referenceResourceRef
          ? 'use-as-reference'
          : 'generate-new',
      ...(plan.characters
        ? {
            characters: plan.characters.map((character) => ({
              ...(character.characterId ? { characterId: character.characterId } : {}),
              ...(character.entityRef ? { entityRef: character.entityRef } : {}),
              ...(character.candidateId ? { candidateId: character.candidateId } : {}),
              name: character.characterName,
              ...(character.action ? { action: character.action } : {}),
              ...(character.emotion ? { emotion: character.emotion } : {}),
              ...(character.continuityNotes ? { continuityNotes: character.continuityNotes } : {}),
              ...(character.appearanceNotes ? { appearanceNotes: character.appearanceNotes } : {}),
            })),
          }
        : {}),
      ...(plan.shotScale ? { shotScale: plan.shotScale } : {}),
      ...(plan.cameraMovement ? { cameraMovement: plan.cameraMovement } : {}),
      ...(plan.cameraAngle ? { cameraAngle: plan.cameraAngle } : {}),
      ...(plan.emotion ? { emotion: plan.emotion } : {}),
      ...(plan.sceneTags ? { sceneTags: plan.sceneTags } : {}),
      ...(plan.dialogue ? { dialogue: plan.dialogue } : {}),
      ...(plan.voiceOver ? { voiceOver: plan.voiceOver } : {}),
      ...(plan.soundCue ? { soundCue: plan.soundCue } : {}),
      ...(plan.textCues ? { textCues: plan.textCues } : {}),
      ...(plan.voiceCues ? { voiceCues: plan.voiceCues } : {}),
      ...(image || plan.referenceResourceRef
        ? plan.generationPrompt
          ? { generationPrompt: plan.generationPrompt }
          : {}
        : {
            generationPrompt:
              plan.generationPrompt ?? plan.visualDescription ?? `Storyboard shot ${shotNumber}`,
          }),
      ...(plan.visualStyle ? { visualStyle: plan.visualStyle } : {}),
      ...(plan.vfx ? { vfx: plan.vfx } : {}),
      ...createPlannedSourceMediaRefs(image, plan.referenceResourceRef, shotNumber),
      sourceTrace: [trace],
    };
  });
}

function createPlannedSourceMediaRefs(
  image: ResourceRef | undefined,
  reference: ResourceRef | undefined,
  shotNumber: number,
): Pick<StoryboardShotRow, 'sourceMediaRefs'> {
  const source = image ?? reference;
  return source ? { sourceMediaRefs: [mediaRef(source, `source-${shotNumber}`)] } : {};
}

function createCanonicalTable(input: {
  readonly title: string;
  readonly profile: StoryboardSourceProfileId;
  readonly scenes: readonly StoryboardSceneRow[];
  readonly sourceRef?: ResourceRef;
  readonly sourceDocumentRef?: DocumentArchiveResourceRef;
  readonly sourceType: 'story' | 'agent' | 'document' | 'image' | 'manual';
  readonly sourceUri?: string;
  readonly now?: () => string;
}): StoryboardTable {
  const createdAt = input.now?.() ?? new Date().toISOString();
  const sourceTrace = input.sourceRef
    ? [createTrace(input.profile, input.sourceRef, 'root')]
    : input.sourceDocumentRef
      ? [createDocumentTrace(input.profile, input.sourceDocumentRef, 'root')]
      : [];
  const intent = {
    title: input.title,
    sourceProfile: input.profile,
    sourceTrace,
    scenes: input.scenes,
  };
  const digest = storyboardDigest(intent);
  return {
    schemaVersion: STORYBOARD_TABLE_SCHEMA_VERSION,
    kind: STORYBOARD_TABLE_KIND,
    contractVersion: STORYBOARD_CANONICAL_CONTRACT_VERSION,
    title: input.title,
    sourceProfile: input.profile,
    sourceTrace,
    source: {
      type: input.sourceType,
      ...(input.sourceUri ? { sourceUri: input.sourceUri } : {}),
      label: input.title,
    },
    revision: {
      revisionId: `storyboard-${digest}`,
      sequence: 1,
      contentDigest: digest,
      createdAt,
    },
    scenes: input.scenes,
    projections: [],
  };
}

function createTrace(
  profile: StoryboardSourceProfileId,
  sourceRef: ResourceRef,
  suffix: string,
  extra: Partial<Omit<StoryboardSourceTrace, 'traceId' | 'sourceProfile' | 'sourceRef'>> = {},
): StoryboardSourceTrace {
  return {
    traceId: `${sourceRef.id}:${suffix}`,
    sourceProfile: profile,
    sourceRef,
    ...extra,
  };
}

function createDocumentTrace(
  profile: StoryboardSourceProfileId,
  sourceDocumentRef: DocumentArchiveResourceRef,
  suffix: string,
): StoryboardSourceTrace {
  return {
    traceId: `document:${storyboardDigest(sourceDocumentRef)}:${suffix}`,
    sourceProfile: profile,
    sourceDocumentRef,
  };
}

function comicTrace(
  source: StoryboardComicSource,
  suffix: string,
  region?: StoryboardSourceTrace['sourceRegion'],
): StoryboardSourceTrace {
  if (source.resourceRef) {
    return createTrace(
      'from-comic',
      source.resourceRef,
      suffix,
      region ? { sourceRegion: region } : {},
    );
  }
  const documentRef = source.documentRef;
  if (!documentRef) {
    throw new Error('Comic source trace requires a documentRef or resourceRef.');
  }
  return {
    ...createDocumentTrace('from-comic', documentRef, suffix),
    ...(region ? { sourceRegion: region } : {}),
  };
}

function imageShot(
  image: ResourceRef,
  shotNumber: number,
  trace: StoryboardSourceTrace,
  label: string,
  duration = 3,
): StoryboardShotRow {
  return {
    shotId: `image-${image.id}-${shotNumber}`,
    shotNumber,
    duration,
    visualDescription: label,
    characterAction: 'Hold or animate the source image according to the production plan.',
    imageStrategy: 'reuse-original',
    sourceMediaRefs: [mediaRef(image, `image-${shotNumber}`)],
    sourceTrace: [trace],
  };
}

function mediaRef(resourceRef: ResourceRef, refId: string): StoryboardMediaRef {
  return {
    refId,
    role: 'source',
    locator: { type: 'asset', assetId: resourceRef.id },
    resourceRef,
  };
}

function defaultShot(
  shotNumber: number,
  description: string,
  trace: StoryboardSourceTrace,
  extra: Pick<StoryboardShotRow, 'dialogue'> = {},
): StoryboardShotRow {
  return {
    shotId: `${trace.traceId}-shot-${shotNumber}`,
    shotNumber,
    duration: 3,
    visualDescription: description || `Shot ${shotNumber}`,
    characterAction: description || 'Establish the story beat.',
    imageStrategy: 'generate-new',
    generationPrompt: description || `Storyboard shot ${shotNumber}`,
    sourceTrace: [trace],
    ...extra,
  };
}

function applyRefinement(
  scenes: readonly StoryboardSceneRow[],
  operation: StoryboardRefinementOperation,
): {
  readonly scenes?: StoryboardSceneRow[];
  readonly diagnostic?: StoryboardNormalizationDiagnostic;
} {
  const sceneIndex = scenes.findIndex((scene) => scene.sceneId === operation.sceneId);
  if (sceneIndex < 0)
    return { diagnostic: invalidRefinement(`Unknown scene: ${operation.sceneId}.`) };
  const scene = scenes[sceneIndex];
  if (!scene) return { diagnostic: invalidRefinement(`Unknown scene: ${operation.sceneId}.`) };
  let shots = [...scene.shots];

  if (operation.kind === 'split-shot') {
    const index = shots.findIndex((shot) => shot.shotId === operation.shotId);
    if (index < 0 || operation.shots.length < 2)
      return {
        diagnostic: invalidRefinement(
          'Shot split requires an existing shot and at least two replacements.',
        ),
      };
    shots.splice(index, 1, ...operation.shots);
  } else if (operation.kind === 'merge-shots') {
    const indexes = operation.shotIds.map((shotId) =>
      shots.findIndex((shot) => shot.shotId === shotId),
    );
    if (indexes.some((index) => index < 0) || indexes.length < 2)
      return { diagnostic: invalidRefinement('Shot merge requires at least two existing shots.') };
    const first = Math.min(...indexes);
    shots = shots.filter((_, index) => !indexes.includes(index));
    shots.splice(first, 0, operation.shot);
  } else if (operation.kind === 'reorder-shots') {
    if (
      operation.shotIds.length !== shots.length ||
      new Set(operation.shotIds).size !== shots.length
    )
      return {
        diagnostic: invalidRefinement('Shot reorder must contain every shot exactly once.'),
      };
    const byId = new Map(shots.map((shot) => [shot.shotId, shot]));
    const reordered: StoryboardShotRow[] = [];
    for (const shotId of operation.shotIds) {
      const shot = byId.get(shotId);
      if (!shot)
        return { diagnostic: invalidRefinement('Shot reorder references an unknown shot.') };
      reordered.push(shot);
    }
    shots = reordered;
  } else {
    const index = shots.findIndex((shot) => shot.shotId === operation.shotId);
    if (index < 0) return { diagnostic: invalidRefinement(`Unknown shot: ${operation.shotId}.`) };
    const current = shots[index];
    if (!current) return { diagnostic: invalidRefinement(`Unknown shot: ${operation.shotId}.`) };
    shots[index] =
      operation.kind === 'rewrite-shot'
        ? { ...current, ...operation.patch, shotId: current.shotId, shotNumber: current.shotNumber }
        : { ...current, sourceMediaRefs: operation.sourceMediaRefs };
  }

  const next = [...scenes];
  next[sceneIndex] = { ...scene, shots };
  return { scenes: next };
}

function renumberShots(scenes: readonly StoryboardSceneRow[]): StoryboardSceneRow[] {
  let shotNumber = 1;
  return scenes.map((scene) => ({
    ...scene,
    shots: scene.shots.map((shot) => ({ ...shot, shotNumber: shotNumber++ })),
  }));
}

function cloneScene(scene: StoryboardSceneRow): StoryboardSceneRow {
  return { ...scene, shots: scene.shots.map((shot) => ({ ...shot })) };
}

function finalize(
  table: StoryboardTable,
  routedProfile: StoryboardSourceProfileId,
): StoryboardNormalizationResult {
  const validation = validateCanonicalStoryboardTable(table);
  if (!validation.ok) {
    return {
      routedProfile,
      diagnostics: validation.diagnostics
        .filter((diagnostic) => diagnostic.severity === 'error')
        .map((diagnostic) => ({
          severity: 'error' as const,
          code: 'invalid-canonical-storyboard' as const,
          message: diagnostic.message,
          path: diagnostic.path,
        })),
    };
  }
  return { table, routedProfile, diagnostics: [] };
}

function failed(
  routedProfile: StoryboardSourceProfileId,
  diagnostic: StoryboardNormalizationDiagnostic,
): StoryboardNormalizationResult {
  return { routedProfile, diagnostics: [diagnostic] };
}

function durableSourceDiagnostic(
  source: unknown,
  path: readonly (string | number)[],
): StoryboardNormalizationDiagnostic | undefined {
  const result = validateDurableResourceRef(source, path);
  if (result.ok) return undefined;
  return {
    severity: 'error',
    code: 'invalid-resource-ref',
    message: result.diagnostics[0]?.message ?? 'Source requires a durable ResourceRef.',
    path: result.diagnostics[0]?.path ?? path,
  };
}

function invalidSource(message: string): StoryboardNormalizationDiagnostic {
  return { severity: 'error', code: 'invalid-source', message };
}

function invalidRefinement(message: string): StoryboardNormalizationDiagnostic {
  return { severity: 'error', code: 'invalid-refinement', message };
}

function isResource(value: ResourceRef | DocumentArchiveResourceRef): value is ResourceRef {
  return 'id' in value;
}

function parseSceneNumber(value: string | null, fallback: number): number {
  const parsed = value ? Number.parseInt(value, 10) : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function extractDialogue(lines: readonly string[], start: number, end: number): string | undefined {
  const dialogue = lines
    .slice(start, end + 1)
    .filter((line) => /^\s{2,}\S/.test(line) || /^@?[A-Z][A-Z0-9 _-]+$/.test(line.trim()))
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
  return dialogue || undefined;
}

function createDocumentPlanningRef(
  documentRef: DocumentArchiveResourceRef,
  text: string,
): ResourceRef {
  const digest = storyboardDigest({ documentRef, text });
  return {
    id: `document-text-${digest}`,
    scope: 'project',
    provider: 'neko-content',
    kind: 'document',
    source: {
      kind: 'document',
      document: documentRef.source,
      identity: { hash: digest },
    },
    locator: {
      kind: 'document',
      ...(documentRef.entryPath ? { entryPath: documentRef.entryPath } : {}),
      ...(documentRef.locator ? { locator: documentRef.locator } : {}),
    },
    fingerprint: { strategy: 'hash', value: digest },
  };
}

function storyboardDigest(value: unknown): string {
  const text = stableSerialize(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined';
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
  const record = value as Readonly<Record<string, unknown>>;
  return `{${Object.keys(record)
    .sort()
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
    .join(',')}}`;
}
