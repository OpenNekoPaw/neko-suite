/**
 * VSCode-free Neko Story Agent capability provider.
 *
 * Exposes indexed screenplay query/planning tools and textual scene references
 * to CLI/TUI hosts. Editor-bound actions stay in the VSCode extension wrapper.
 */

import type {
  AgentCapabilityContext,
  AgentCapabilityProvider,
  AgentReferenceContributor,
  AgentReferenceSearchRequest,
  AgentReferenceSearchResult,
  NekoStoryAPI,
  NekoStoryScriptIndex,
  StoryScenePlan,
  StoryShotPlan,
  Tool,
  ToolParameters,
} from './contracts';
import { TOOL_NAMES_STORY } from './contracts';

export function createNekoStoryHeadlessCapabilityProvider(
  api: NekoStoryAPI,
): AgentCapabilityProvider {
  return new NekoStoryHeadlessCapabilityProvider(api);
}

class NekoStoryHeadlessCapabilityProvider implements AgentCapabilityProvider {
  readonly id = 'neko-story';
  readonly version = '1.0.0';
  readonly hostRequirements = [{ host: 'tui' }, { host: 'cli' }, { host: 'vscode' }] as const;
  readonly requirements = { contentAccess: true } as const;

  constructor(private readonly api: NekoStoryAPI) {}

  getTools(_context: AgentCapabilityContext): Tool[] {
    return [
      {
        name: TOOL_NAMES_STORY.GET_SCRIPT_INDEX,
        description:
          'Get a structured index of a Fountain screenplay file. Returns scenes with stable semantic IDs and 0-based line_start/line_end.',
        category: 'document',
        isReadOnly: true,
        isConcurrencySafe: true,
        safetyKind: 'read-only-query',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'File path or URI string of the indexed .fountain screenplay file.',
            },
          },
          required: ['path'],
        } satisfies ToolParameters,
        execute: async (args) => {
          try {
            const path = optionalString(args.path);
            if (!path) {
              return { success: false, error: 'path is required' };
            }
            const index = this.api.getScriptIndex(path);
            if (!index) {
              return {
                success: false,
                error: 'Script not indexed yet. Open or index the .fountain file first.',
              };
            }
            return { success: true, data: index };
          } catch (err) {
            return { success: false, error: `Failed to get script index: ${String(err)}` };
          }
        },
      },
      {
        name: TOOL_NAMES_STORY.SEARCH_SCRIPT_INDEX,
        description:
          'Search scenes in an indexed Fountain screenplay by keywords over scene headings, metadata, characters, directives, and summaries.',
        category: 'document',
        isReadOnly: true,
        isConcurrencySafe: true,
        safetyKind: 'read-only-query',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'File path or URI string of the indexed .fountain screenplay file.',
            },
            query: {
              type: 'string',
              description: 'Natural language or keyword description of the scenes to find.',
            },
            top_k: {
              type: 'number',
              description: 'Maximum number of results to return. Defaults to 5, maximum 20.',
            },
          },
          required: ['path', 'query'],
        } satisfies ToolParameters,
        execute: async (args) => {
          try {
            const path = optionalString(args.path);
            const query = optionalString(args.query);
            if (!path) {
              return { success: false, error: 'path is required' };
            }
            if (!query) {
              return { success: false, error: 'query is required' };
            }
            const index = this.api.getScriptIndex(path);
            if (!index) {
              return {
                success: false,
                error: 'Script not indexed yet. Open or index the .fountain file first.',
              };
            }
            return {
              success: true,
              data: {
                results: searchScenes(index, query, clampLimit(args.top_k, 5, 20)),
                mode: 'index-keyword',
              },
            };
          } catch (err) {
            return { success: false, error: `Search failed: ${String(err)}` };
          }
        },
      },
      {
        name: TOOL_NAMES_STORY.GENERATE_SCENE_PLAN,
        description:
          'Generate deterministic ScenePlan objects for one or more indexed screenplay scenes.',
        category: 'document',
        isReadOnly: true,
        isConcurrencySafe: true,
        safetyKind: 'read-only-query',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'File path or URI string of the indexed .fountain screenplay file.',
            },
            scene_ids: {
              type: 'array',
              description:
                'Optional array of sceneId values. When omitted, generates plans for all indexed scenes.',
            },
          },
          required: ['path'],
        } satisfies ToolParameters,
        execute: async (args) => {
          try {
            const path = optionalString(args.path);
            if (!path) {
              return { success: false, error: 'path is required' };
            }
            const sceneIds = Array.isArray(args.scene_ids)
              ? args.scene_ids.filter(isString)
              : undefined;
            const scenePlans = this.api.generateScenePlans(path, sceneIds);
            if (!scenePlans) {
              return {
                success: false,
                error: 'Script not indexed yet. Open or index the .fountain file first.',
              };
            }
            return {
              success: true,
              data: { script_path: path, scenePlans },
            };
          } catch (err) {
            return { success: false, error: `Failed to generate scene plan: ${String(err)}` };
          }
        },
      },
      {
        name: TOOL_NAMES_STORY.GENERATE_SHOT_PLAN,
        description:
          'Generate deterministic ShotPlan entries for a single indexed screenplay scene.',
        category: 'document',
        isReadOnly: true,
        isConcurrencySafe: true,
        safetyKind: 'read-only-query',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'File path or URI string of the indexed .fountain screenplay file.',
            },
            scene_id: {
              type: 'string',
              description: 'Target sceneId to generate shot plans for.',
            },
            recommended_shot_count: {
              type: 'number',
              description: 'Optional explicit shot count override.',
            },
          },
          required: ['path', 'scene_id'],
        } satisfies ToolParameters,
        execute: async (args) => {
          try {
            const path = optionalString(args.path);
            const sceneId = optionalString(args.scene_id);
            if (!path) {
              return { success: false, error: 'path is required' };
            }
            if (!sceneId) {
              return { success: false, error: 'scene_id is required' };
            }
            const index = this.api.getScriptIndex(path);
            const scene = index?.scenes.find((candidate) => candidate.sceneId === sceneId);
            if (!scene) {
              return { success: false, error: `Scene not found in ScriptIndex: ${sceneId}` };
            }
            const shotPlans = this.api.generateShotPlan(
              path,
              sceneId,
              optionalNumber(args.recommended_shot_count),
            );
            if (!shotPlans) {
              return { success: false, error: `Failed to generate shot plan: ${sceneId}` };
            }
            const scenePlan: StoryScenePlan = createScenePlan(scene, shotPlans);
            return {
              success: true,
              data: { script_path: path, scenePlan },
            };
          } catch (err) {
            return { success: false, error: `Failed to generate shot plan: ${String(err)}` };
          }
        },
      },
    ];
  }

  getPromptFragments(_context: AgentCapabilityContext) {
    return [
      {
        id: 'neko-story:fountain-syntax',
        content: FOUNTAIN_SYNTAX_PROMPT,
        priority: 70,
      },
    ];
  }

  getReferenceContributors(_context: AgentCapabilityContext): readonly AgentReferenceContributor[] {
    return [new NekoStoryReferenceContributor(this.api)];
  }
}

class NekoStoryReferenceContributor implements AgentReferenceContributor {
  readonly id = 'neko-story';
  readonly displayName = 'Story';

  constructor(private readonly api: NekoStoryAPI) {}

  async search(request: AgentReferenceSearchRequest): Promise<AgentReferenceSearchResult> {
    try {
      const indexedScenes = collectKnownScenes(this.api, request);
      const candidates = indexedScenes
        .filter((entry) => sceneMatches(entry.index, entry.scene, request.query))
        .slice(0, clampLimit(request.limit, 20, 100))
        .map(({ index, scene }) => ({
          id: `story-scene:${scene.sceneId}`,
          label: scene.sceneTitle,
          source: 'story',
          kind: 'story-scene' as const,
          insertText: `@story-scene:${scene.sceneId}`,
          description: formatSceneDescription(scene),
          metadata: buildSceneReferenceMetadata(index, scene),
        }));
      return { candidates, diagnostics: [] };
    } catch (err) {
      return {
        candidates: [],
        diagnostics: [
          {
            level: 'warn',
            providerId: 'neko-story',
            contributionKind: 'referenceContributor',
            contributionName: this.id,
            code: 'capability.reference.unavailable',
            reason: 'story-query-failed',
            message: `Failed to search story scenes: ${String(err)}`,
            host: 'tui',
          },
        ],
      };
    }
  }
}

function collectKnownScenes(api: NekoStoryAPI, request: AgentReferenceSearchRequest) {
  const indexes = new Map<string, NekoStoryScriptIndex>();
  for (const index of api.getAllScriptIndices?.() ?? []) {
    indexes.set(index.uri, index);
  }
  for (const candidatePath of [request.workspaceRoot, request.query]) {
    const index = candidatePath ? api.getScriptIndex(candidatePath) : undefined;
    if (index) {
      indexes.set(index.uri, index);
    }
  }
  return [...indexes.values()].flatMap((index) => index.scenes.map((scene) => ({ index, scene })));
}

function searchScenes(index: NekoStoryScriptIndex, query: string, limit: number) {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) {
    return [];
  }
  return index.scenes
    .map((scene) => ({
      scene,
      score: scoreScene(index, scene, queryTokens),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map(({ scene, score }) => ({
      scene_id: scene.sceneId,
      score: Number(score.toFixed(3)),
      line_start: scene.line_start,
      line_end: scene.line_end,
      heading: scene.heading,
    }));
}

function scoreScene(
  index: NekoStoryScriptIndex,
  scene: NekoStoryScriptIndex['scenes'][number],
  queryTokens: readonly string[],
): number {
  const haystack = buildSceneSearchText(index, scene);
  let score = 0;
  for (const token of queryTokens) {
    if (haystack.includes(token)) {
      score += scene.heading.toLowerCase().includes(token) ? 2 : 1;
    }
  }
  return score / queryTokens.length;
}

function sceneMatches(
  index: NekoStoryScriptIndex,
  scene: NekoStoryScriptIndex['scenes'][number],
  query: string,
): boolean {
  const tokens = tokenize(query);
  return tokens.length === 0 || scoreScene(index, scene, tokens) > 0;
}

function buildSceneSearchText(
  index: NekoStoryScriptIndex,
  scene: NekoStoryScriptIndex['scenes'][number],
): string {
  const characterNames = [
    ...scene.sceneCharacters,
    ...index.characters
      .filter((character) => character.scene_ids.includes(scene.sceneId))
      .map((character) => character.name),
  ];
  return [
    scene.sceneId,
    scene.heading,
    scene.sceneTitle,
    scene.location,
    scene.timeOfDay,
    scene.actionSummary,
    ...characterNames,
    ...scene.directives.flatMap((directive) => [
      directive.category,
      directive.key,
      directive.value,
    ]),
  ]
    .filter(isString)
    .join('\n')
    .toLowerCase();
}

function createScenePlan(
  scene: NekoStoryScriptIndex['scenes'][number],
  shotPlans: readonly StoryShotPlan[],
): StoryScenePlan {
  return {
    sceneId: scene.sceneId,
    sceneTitle: scene.sceneTitle,
    summary: scene.actionSummary,
    recommendedShotCount: shotPlans.length,
    shotPlans,
  };
}

function formatSceneDescription(scene: NekoStoryScriptIndex['scenes'][number]): string {
  return [scene.location, scene.timeOfDay, scene.sceneCharacters.join(', ')]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join(' · ');
}

function buildSceneReferenceMetadata(
  index: NekoStoryScriptIndex,
  scene: NekoStoryScriptIndex['scenes'][number],
) {
  return {
    sceneId: scene.sceneId,
    scriptUri: index.uri,
    lineStart: scene.line_start,
    lineEnd: scene.line_end,
    ...(scene.location ? { location: scene.location } : {}),
    ...(scene.timeOfDay ? { timeOfDay: scene.timeOfDay } : {}),
    characters: scene.sceneCharacters,
  };
}

function tokenize(value: string): string[] {
  return value
    .toLowerCase()
    .split(/\W+/)
    .filter((token) => token.length > 1);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function clampLimit(value: unknown, defaultValue: number, maxValue: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return defaultValue;
  }
  return Math.min(Math.max(Math.floor(value), 1), maxValue);
}

const FOUNTAIN_SYNTAX_PROMPT = [
  '## Fountain Syntax Reference (neko-story)',
  '',
  'Use standard Fountain scene headings such as `INT. OFFICE - DAY` or `EXT. STREET - NIGHT`.',
  'Use uppercase character names before dialogue. Use parentheticals sparingly.',
  'Use `[[KEY: value]]` notes for structured creative directives such as MOOD, SHOT, ANGLE, MOVEMENT, PROMPT, STYLE, REF, IMAGE, VIDEO, AUDIO, VFX, SFX, MUSIC, and DURATION.',
  'Reference scenes by stable `sceneId` values from GetScriptIndex/SearchScriptIndex when planning or requesting follow-up work.',
].join('\n');
