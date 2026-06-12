import type {
  AgentContextPayload,
  NekoStoryScriptIndex,
  StoryMissingInput,
  StorySceneVideoReadiness,
  StoryTableAgentContextData,
} from '@neko/shared';

export interface BuildStoryTableAgentPayloadInput {
  readonly scriptPath: string;
  readonly sourceScriptUri: string;
  readonly scriptIndex: NekoStoryScriptIndex;
  readonly sceneIds?: readonly string[];
  readonly readinessRows?: readonly StorySceneVideoReadiness[];
  readonly workflowIntent: NonNullable<StoryTableAgentContextData['workflowIntent']>;
  readonly intent: string;
}

interface AgentSceneContext {
  readonly sceneId: string;
  readonly sceneTitle: string;
  readonly sceneNumber?: string | null;
  readonly location: string;
  readonly timeOfDay: string | null;
  readonly lineRange: { readonly start: number; readonly end: number };
  readonly summary: string;
  readonly characters: readonly string[];
}

interface AgentScriptIndexContext {
  readonly uri: string;
  readonly total_lines: number;
  readonly scenes: readonly AgentSceneContext[];
  readonly characters: NekoStoryScriptIndex['characters'];
}

interface AgentReadinessContext {
  readonly sceneId: string;
  readonly readinessStatus: StorySceneVideoReadiness['readinessStatus'];
  readonly creatorStatus: StorySceneVideoReadiness['creatorStatus'];
  readonly missingInputs: readonly StoryMissingInput[];
  readonly characters: readonly {
    readonly name: string;
    readonly characterId?: string;
    readonly status: string;
    readonly assetEntityIds?: readonly string[];
    readonly generatedAssetIds?: readonly string[];
  }[];
  readonly canvasSummary?: {
    readonly sceneNodeId: string;
    readonly shotCount: number;
    readonly generatedShotCount: number;
    readonly failedShotCount: number;
    readonly status: string;
  };
}

export function buildStoryTableAgentPayload(
  input: BuildStoryTableAgentPayloadInput,
): AgentContextPayload | null {
  const selectedSceneIds = resolveSceneIds(input.scriptIndex, input.sceneIds);
  if (selectedSceneIds.length === 0) {
    return null;
  }

  const scenes = input.scriptIndex.scenes.filter((scene) =>
    selectedSceneIds.includes(scene.sceneId),
  );
  const readinessRows = (input.readinessRows ?? []).filter((row) =>
    selectedSceneIds.includes(row.sceneId),
  );
  const sceneContexts = scenes.map(toAgentSceneContext);
  const scriptIndexContext: AgentScriptIndexContext = {
    uri: input.scriptIndex.uri,
    total_lines: input.scriptIndex.total_lines,
    scenes: sceneContexts,
    characters: input.scriptIndex.characters,
  };
  const readinessContexts = readinessRows.map(toAgentReadinessContext);
  const title = createTableLabel(input.scriptPath, scenes.length);
  const contextText = JSON.stringify(
    {
      kind: 'neko-story-table-context',
      scriptPath: input.scriptPath,
      sourceScriptUri: input.sourceScriptUri,
      workflowIntent: input.workflowIntent,
      sceneIds: selectedSceneIds,
      scenes: sceneContexts,
      readinessRows: readinessContexts,
    },
    null,
    2,
  );

  const data: StoryTableAgentContextData = {
    scriptPath: input.scriptPath,
    sourceScriptUri: input.sourceScriptUri,
    sceneIds: selectedSceneIds,
    scriptIndex: scriptIndexContext,
    selectedText: contextText,
    workflowIntent: input.workflowIntent,
  };

  return {
    type: 'story-selection',
    id: `story:${input.scriptPath}:table:${selectedSceneIds.join(',')}`,
    label: title,
    summary: `Story table: ${selectedSceneIds.length} scenes from ${input.scriptPath}`,
    data,
    intent: input.intent,
  };
}

function resolveSceneIds(
  scriptIndex: NekoStoryScriptIndex,
  sceneIds: readonly string[] | undefined,
): readonly string[] {
  const validSceneIds = new Set(scriptIndex.scenes.map((scene) => scene.sceneId));
  const requested =
    sceneIds && sceneIds.length > 0 ? sceneIds : scriptIndex.scenes.map((s) => s.sceneId);
  return requested.filter((sceneId) => validSceneIds.has(sceneId));
}

function createTableLabel(scriptPath: string, sceneCount: number): string {
  const basename = scriptPath.split(/[\\/]/).pop() ?? scriptPath;
  return `${basename} - ${sceneCount} scenes`;
}

function toAgentSceneContext(scene: NekoStoryScriptIndex['scenes'][number]): AgentSceneContext {
  return {
    sceneId: scene.sceneId,
    sceneTitle: scene.sceneTitle,
    sceneNumber: scene.sceneNumber,
    location: scene.location,
    timeOfDay: scene.timeOfDay,
    lineRange: { start: scene.line_start, end: scene.line_end },
    summary: scene.actionSummary,
    characters: scene.sceneCharacters,
  };
}

function toAgentReadinessContext(row: StorySceneVideoReadiness): AgentReadinessContext {
  return {
    sceneId: row.sceneId,
    readinessStatus: row.readinessStatus,
    creatorStatus: row.creatorStatus,
    missingInputs: row.missingInputs,
    characters: row.characters.map((character) => ({
      name: character.name,
      characterId: character.characterId,
      status: character.status,
      assetEntityIds: character.assetEntityIds,
      generatedAssetIds: character.generatedAssetIds,
    })),
    canvasSummary: row.canvasSummary
      ? {
          sceneNodeId: row.canvasSummary.sceneNodeId,
          shotCount: row.canvasSummary.shotCount,
          generatedShotCount: row.canvasSummary.generatedShotCount,
          failedShotCount: row.canvasSummary.failedShotCount,
          status: row.canvasSummary.status,
        }
      : undefined,
  };
}
