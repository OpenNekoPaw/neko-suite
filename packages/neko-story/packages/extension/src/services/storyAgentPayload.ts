import type {
  AgentContextPayload,
  NekoStoryScriptIndex,
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
  const title = createTableLabel(input.scriptPath, scenes.length);
  const contextText = JSON.stringify(
    {
      kind: 'neko-story-table-context',
      scriptPath: input.scriptPath,
      sourceScriptUri: input.sourceScriptUri,
      workflowIntent: input.workflowIntent,
      sceneIds: selectedSceneIds,
      scenes: scenes.map((scene) => ({
        sceneId: scene.sceneId,
        sceneTitle: scene.sceneTitle,
        sceneNumber: scene.sceneNumber,
        location: scene.location,
        timeOfDay: scene.timeOfDay,
        lineRange: { start: scene.line_start, end: scene.line_end },
        summary: scene.actionSummary,
        estimatedDuration: scene.estimatedDuration,
        recommendedShotCount: estimateRecommendedShotCount(scene.estimatedDuration),
        characters: scene.sceneCharacters,
      })),
      readinessRows: readinessRows.map((row) => ({
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
      })),
    },
    null,
    2,
  );

  const data: StoryTableAgentContextData = {
    scriptPath: input.scriptPath,
    sourceScriptUri: input.sourceScriptUri,
    sceneIds: selectedSceneIds,
    scriptIndex: input.scriptIndex,
    readinessRows,
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

function estimateRecommendedShotCount(duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) {
    return 1;
  }
  return Math.max(1, Math.min(12, Math.round(duration / 5)));
}
