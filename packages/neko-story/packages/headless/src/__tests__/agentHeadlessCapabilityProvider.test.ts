import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type {
  AgentCapabilityContext,
  NekoStoryAPI,
  NekoStoryScriptIndex,
  StoryScenePlan,
  StoryShotPlan,
} from '../contracts';
import { TOOL_NAMES_STORY } from '../contracts';
import { createNekoStoryHeadlessCapabilityProvider } from '../agentHeadlessCapabilityProvider';

describe('createNekoStoryHeadlessCapabilityProvider', () => {
  it('declares terminal hosts and excludes VSCode-only apply suggestion', () => {
    const provider = createNekoStoryHeadlessCapabilityProvider(createStoryApi());
    const tools = provider.getTools(createContext());

    expect(provider.hostRequirements).toEqual([
      { host: 'tui' },
      { host: 'cli' },
      { host: 'vscode' },
    ]);
    expect(tools.map((tool) => tool.name)).toEqual([
      TOOL_NAMES_STORY.GET_SCRIPT_INDEX,
      TOOL_NAMES_STORY.SEARCH_SCRIPT_INDEX,
      TOOL_NAMES_STORY.GENERATE_SCENE_PLAN,
      TOOL_NAMES_STORY.GENERATE_SHOT_PLAN,
    ]);
    expect(tools.map((tool) => tool.name)).not.toContain(TOOL_NAMES_STORY.STORY_APPLY_SUGGESTION);
  });

  it('searches indexed screenplay scene metadata without reading VSCode workspace files', async () => {
    const provider = createNekoStoryHeadlessCapabilityProvider(
      createStoryApi({ index: createScriptIndex() }),
    );
    const searchTool = provider
      .getTools(createContext())
      .find((tool) => tool.name === TOOL_NAMES_STORY.SEARCH_SCRIPT_INDEX);

    const result = await searchTool?.execute({
      path: '/project/story.fountain',
      query: 'rain',
      top_k: 1,
    });

    expect(result).toMatchObject({
      success: true,
      data: {
        mode: 'index-keyword',
        results: [
          {
            scene_id: 'scene-rain',
            heading: 'EXT. STREET - NIGHT',
            score: 1,
            line_start: 10,
            line_end: 14,
          },
        ],
      },
    });
  });

  it('projects story scenes as terminal-safe reference candidates', async () => {
    const provider = createNekoStoryHeadlessCapabilityProvider(
      createStoryApi({ allIndices: [createScriptIndex()] }),
    );

    const [contributor] = provider.getReferenceContributors?.(createContext()) ?? [];
    const result = await contributor?.search({ query: 'office', limit: 5 });

    expect(result?.diagnostics).toEqual([]);
    expect(result?.candidates).toEqual([
      {
        id: 'story-scene:scene-office',
        label: 'INT. OFFICE - DAY',
        source: 'story',
        kind: 'story-scene',
        insertText: '@story-scene:scene-office',
        description: 'OFFICE · DAY · ALICE',
        metadata: {
          sceneId: 'scene-office',
          scriptUri: 'file:///project/story.fountain',
          lineStart: 0,
          lineEnd: 6,
          location: 'OFFICE',
          timeOfDay: 'DAY',
          characters: ['ALICE'],
        },
      },
    ]);
    expect(provider.getTools(createContext())).toHaveLength(4);
  });

  it('delegates deterministic plan tools through NekoStoryAPI', async () => {
    const shotPlans: StoryShotPlan[] = [
      {
        shotNumber: 1,
        visualDescription: 'Establish the office.',
        duration: 3,
        shotScale: 'LS',
        cameraAngle: 'eye-level',
        cameraMovement: 'static',
        characters: [{ characterName: 'ALICE' }],
        sceneTags: ['OFFICE', 'DAY'],
      },
    ];
    const scenePlans: StoryScenePlan[] = [
      {
        sceneId: 'scene-office',
        sceneTitle: 'INT. OFFICE - DAY',
        summary: 'Alice studies monitors.',
        recommendedShotCount: 1,
        shotPlans,
      },
    ];
    const api = createStoryApi({
      index: createScriptIndex(),
      scenePlans,
      shotPlans,
    });
    const provider = createNekoStoryHeadlessCapabilityProvider(api);
    const tools = provider.getTools(createContext());
    const scenePlanTool = tools.find((tool) => tool.name === TOOL_NAMES_STORY.GENERATE_SCENE_PLAN);
    const shotPlanTool = tools.find((tool) => tool.name === TOOL_NAMES_STORY.GENERATE_SHOT_PLAN);

    await expect(
      scenePlanTool?.execute({ path: '/project/story.fountain', scene_ids: ['scene-office'] }),
    ).resolves.toMatchObject({
      success: true,
      data: { scenePlans },
    });
    await expect(
      shotPlanTool?.execute({
        path: '/project/story.fountain',
        scene_id: 'scene-office',
        recommended_shot_count: 1,
      }),
    ).resolves.toMatchObject({
      success: true,
      data: { scenePlan: { sceneId: 'scene-office', shotPlans } },
    });
    expect(api.generateScenePlans).toHaveBeenCalledWith('/project/story.fountain', [
      'scene-office',
    ]);
    expect(api.generateShotPlan).toHaveBeenCalledWith('/project/story.fountain', 'scene-office', 1);
  });

  it('localizes Fountain syntax prompt fragments for Chinese prompts', () => {
    const provider = createNekoStoryHeadlessCapabilityProvider(createStoryApi());
    const context: AgentCapabilityContext = { extensionContext: {}, locale: 'zh' };
    const [fragment] = provider.getPromptFragments?.(context) ?? [];
    const localized = fragment?.locales?.['zh']?.content;

    expect(localized).toBeDefined();
    expect(localized).toContain('## Fountain 语法参考（neko-story）');
    expect(localized).toContain('场景标题');
    expect(localized).not.toContain('## Fountain Syntax Reference');
    expect(localized).not.toContain('Use standard Fountain scene headings');
  });

  it('does not import vscode or extension implementation from headless provider source', () => {
    const source = readFileSync(join(__dirname, '../agentHeadlessCapabilityProvider.ts'), 'utf8');

    expect(source).not.toContain("from 'vscode'");
    expect(source).not.toContain('from "vscode"');
    expect(source).not.toContain('vscode.');
    expect(source).not.toContain('/extension/');
    expect(source).not.toContain('packages/extension');
  });
});

function createContext(): AgentCapabilityContext {
  return { extensionContext: {} };
}

function createStoryApi(
  overrides: {
    readonly index?: NekoStoryScriptIndex;
    readonly allIndices?: readonly NekoStoryScriptIndex[];
    readonly scenePlans?: readonly StoryScenePlan[];
    readonly shotPlans?: readonly StoryShotPlan[];
  } = {},
): NekoStoryAPI {
  return {
    parseScript: vi.fn(() => ({ elements: [] })),
    convertToTimeline: vi.fn(() => ({ project: {} as never, diagnostics: [] })),
    getScriptIndex: vi.fn(() => overrides.index),
    getAllScriptIndices: vi.fn(() => overrides.allIndices ?? []),
    getCharacterRegistry: vi.fn(() => undefined),
    resolveCharacter: vi.fn(() => undefined),
    generateScenePlans: vi.fn(() => overrides.scenePlans),
    generateShotPlan: vi.fn(() => overrides.shotPlans),
  };
}

function createScriptIndex(): NekoStoryScriptIndex {
  return {
    uri: 'file:///project/story.fountain',
    total_lines: 20,
    scenes: [
      {
        id: 'scene-office',
        heading: 'INT. OFFICE - DAY',
        sceneId: 'scene-office',
        sceneTitle: 'INT. OFFICE - DAY',
        intExt: 'INT',
        timeOfDay: 'DAY',
        location: 'OFFICE',
        time: 'DAY',
        sceneNumber: null,
        sceneCharacters: ['ALICE'],
        actionSummary: 'Alice studies monitors.',
        estimatedDuration: 8,
        directives: [],
        line_start: 0,
        line_end: 6,
      },
      {
        id: 'scene-rain',
        heading: 'EXT. STREET - NIGHT',
        sceneId: 'scene-rain',
        sceneTitle: 'EXT. STREET - NIGHT',
        intExt: 'EXT',
        timeOfDay: 'NIGHT',
        location: 'STREET',
        time: 'NIGHT',
        sceneNumber: null,
        sceneCharacters: ['BOB'],
        actionSummary: 'Rain hits the asphalt.',
        estimatedDuration: 7,
        directives: [],
        line_start: 10,
        line_end: 14,
      },
    ],
    characters: [
      { name: 'ALICE', first_line: 3, scene_ids: ['scene-office'] },
      { name: 'BOB', first_line: 13, scene_ids: ['scene-rain'] },
    ],
  };
}
