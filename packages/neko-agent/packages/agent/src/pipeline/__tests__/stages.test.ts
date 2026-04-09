import { describe, it, expect, vi } from 'vitest';
import { createReadDocumentStage } from '../stages/read-document';
import { createParseStoryboardStage } from '../stages/parse-storyboard';
import { createImportStoryboardToCanvasStage } from '../stages/import-storyboard-to-canvas';
import { createGeneratePromptsStage } from '../stages/generate-prompts';
import { createBatchGenerateStage } from '../stages/batch-generate';
import { createArrangeOnTimelineStage } from '../stages/arrange-on-timeline';
import type { PipelineContext, StoryboardScene, IParallelStage } from '../types';

// =============================================================================
// readDocument
// =============================================================================

describe('readDocument stage', () => {
  it('should read text file via fileReader', async () => {
    const stage = createReadDocumentStage({
      fileReader: { readFile: async () => 'INT. OFFICE - DAY\n\nAction text.' },
    });

    const result = await stage.execute({ source: 'script.fountain' });
    expect(result.documentText).toBe('INT. OFFICE - DAY\n\nAction text.');
    expect(result.sourceFormat).toBe('fountain');
  });

  it('should use documentReader for PDF', async () => {
    const stage = createReadDocumentStage({
      fileReader: { readFile: async () => '' },
      documentReader: {
        read: async () => ({ text: 'PDF content here', metadata: { title: 'Test' } }),
        supports: () => true,
      },
    });

    const result = await stage.execute({ source: 'doc.pdf' });
    expect(result.documentText).toBe('PDF content here');
    expect(result.sourceFormat).toBe('document');
  });

  it('should treat multiline source as inline text', async () => {
    const stage = createReadDocumentStage({
      fileReader: { readFile: async () => '' },
    });

    const result = await stage.execute({ source: 'Scene 1: A park.\nScene 2: A cafe.' });
    expect(result.documentText).toBe('Scene 1: A park.\nScene 2: A cafe.');
    expect(result.sourceFormat).toBe('freeform');
  });

  it('should throw when no source provided', async () => {
    const stage = createReadDocumentStage({
      fileReader: { readFile: async () => '' },
    });
    await expect(stage.execute({})).rejects.toThrow('No source provided');
  });

  it('should throw for PDF without documentReader', async () => {
    const stage = createReadDocumentStage({
      fileReader: { readFile: async () => '' },
    });
    await expect(stage.execute({ source: 'file.pdf' })).rejects.toThrow('No document reader');
  });
});

// =============================================================================
// parseStoryboard
// =============================================================================

describe('parseStoryboard stage', () => {
  const mockScenes: StoryboardScene[] = [
    {
      index: 0,
      heading: 'INT. OFFICE - DAY',
      description: 'A busy office',
      dialogue: ['Hello'],
      estimatedDuration: 5,
      suggestedPrompt: 'A busy modern office',
    },
  ];

  it('should use storyParser for fountain format', async () => {
    const stage = createParseStoryboardStage({
      storyParser: { parseToScenes: () => mockScenes },
      llmAnalyzer: { extractScenes: vi.fn() },
    });

    const result = await stage.execute({
      documentText: 'INT. OFFICE - DAY',
      sourceFormat: 'fountain',
    });
    expect(result.scenes).toEqual(mockScenes);
  });

  it('should prefer structuredStoryPlanner for indexed fountain format', async () => {
    const plan = {
      scenes: [
        {
          ...mockScenes[0]!,
          sceneId: 'scene-1',
          shotPlans: [{ shotNumber: 1, visualDescription: 'Office wide shot', duration: 5 }],
        },
      ],
      scenePlans: [
        {
          sceneId: 'scene-1',
          sceneTitle: 'INT. OFFICE - DAY',
          summary: 'A busy office',
          recommendedShotCount: 1,
          shotPlans: [{ shotNumber: 1, visualDescription: 'Office wide shot', duration: 5 }],
        },
      ],
    };
    const stage = createParseStoryboardStage({
      structuredStoryPlanner: { plan: vi.fn().mockResolvedValue(plan) },
      storyParser: { parseToScenes: vi.fn(() => mockScenes) },
      llmAnalyzer: { extractScenes: vi.fn() },
    });

    const result = await stage.execute({
      source: '/tmp/script.fountain',
      documentText: 'INT. OFFICE - DAY',
      sourceFormat: 'fountain',
    });

    expect(result.scenes).toEqual(plan.scenes);
    expect(result.scenePlans).toEqual(plan.scenePlans);
  });

  it('should use llmAnalyzer for freeform format', async () => {
    const stage = createParseStoryboardStage({
      llmAnalyzer: { extractScenes: async () => mockScenes },
    });

    const result = await stage.execute({
      documentText: 'A park scene, then a cafe scene',
      sourceFormat: 'freeform',
    });
    expect(result.scenes).toEqual(mockScenes);
  });

  it('should fallback to llmAnalyzer when no storyParser', async () => {
    const extractScenes = vi.fn().mockResolvedValue(mockScenes);
    const stage = createParseStoryboardStage({
      llmAnalyzer: { extractScenes },
    });

    await stage.execute({ documentText: 'fountain text', sourceFormat: 'fountain' });
    expect(extractScenes).toHaveBeenCalled();
  });

  it('should throw when no scenes extracted', async () => {
    const stage = createParseStoryboardStage({
      llmAnalyzer: { extractScenes: async () => [] },
    });

    await expect(
      stage.execute({ documentText: 'empty', sourceFormat: 'freeform' }),
    ).rejects.toThrow('No scenes extracted');
  });

  it('should throw when no text available', async () => {
    const stage = createParseStoryboardStage({
      llmAnalyzer: { extractScenes: vi.fn() },
    });
    await expect(stage.execute({})).rejects.toThrow('No text available');
  });
});

// =============================================================================
// generatePrompts
// =============================================================================

describe('generatePrompts stage', () => {
  it('should optimize prompts for each scene', async () => {
    const stage = createGeneratePromptsStage({
      promptOptimizer: {
        optimizePrompt: async (scene) => `Optimized: ${scene.heading}`,
      },
    });

    const scenes: StoryboardScene[] = [
      {
        index: 0,
        heading: 'Scene A',
        description: '',
        dialogue: [],
        estimatedDuration: 3,
        suggestedPrompt: '',
      },
      {
        index: 1,
        heading: 'Scene B',
        description: '',
        dialogue: [],
        estimatedDuration: 4,
        suggestedPrompt: '',
      },
    ];

    const result = await stage.execute({ scenes });
    expect(result.scenes![0]!.suggestedPrompt).toBe('Optimized: Scene A');
    expect(result.scenes![1]!.suggestedPrompt).toBe('Optimized: Scene B');
  });

  it('should pass globalStyle to optimizer', async () => {
    const optimizePrompt = vi.fn().mockResolvedValue('styled prompt');
    const stage = createGeneratePromptsStage({ promptOptimizer: { optimizePrompt } });

    const scenes: StoryboardScene[] = [
      {
        index: 0,
        heading: 'S',
        description: '',
        dialogue: [],
        estimatedDuration: 3,
        suggestedPrompt: '',
      },
    ];

    await stage.execute({ scenes, globalStyle: 'anime' });
    expect(optimizePrompt).toHaveBeenCalledWith(expect.anything(), 'anime');
  });

  it('should have confirm gate', () => {
    const stage = createGeneratePromptsStage({
      promptOptimizer: { optimizePrompt: async () => '' },
    });
    expect(stage.gate).toBe('confirm');
  });

  it('should throw when no scenes available', async () => {
    const stage = createGeneratePromptsStage({
      promptOptimizer: { optimizePrompt: async () => '' },
    });
    await expect(stage.execute({})).rejects.toThrow('No scenes available');
  });
});

// =============================================================================
// importStoryboardToCanvas
// =============================================================================

describe('importStoryboardToCanvas stage', () => {
  it('should no-op when stage is disabled', async () => {
    const importStoryboard = vi.fn();
    const stage = createImportStoryboardToCanvasStage({
      storyboardCanvasSink: { importStoryboard },
    });

    const ctx: PipelineContext = {
      source: '/tmp/script.fountain',
      sourceFormat: 'fountain',
      scenePlans: [{ sceneId: 'scene-1' }],
    };

    const result = await stage.execute(ctx);
    expect(result).toEqual(ctx);
    expect(importStoryboard).not.toHaveBeenCalled();
  });

  it('should import semantic storyboard when enabled', async () => {
    const canvasStoryboard = {
      mode: 'semantic' as const,
      scenesCreated: 1,
      totalShots: 2,
      scenes: [{ sourceSceneId: 'scene-1', sceneNodeId: 'node-1', shotIds: ['shot-1', 'shot-2'] }],
    };
    const importStoryboard = vi.fn().mockResolvedValue(canvasStoryboard);
    const stage = createImportStoryboardToCanvasStage({
      storyboardCanvasSink: { importStoryboard },
    });

    const result = await stage.execute({
      source: '/tmp/script.fountain',
      sourceFormat: 'fountain',
      scenePlans: [{ sceneId: 'scene-1' }],
      stageParams: {
        importStoryboardToCanvas: { enabled: true },
      },
    });

    expect(importStoryboard).toHaveBeenCalled();
    expect(result.canvasStoryboard).toEqual(canvasStoryboard);
  });
});

// =============================================================================
// batchGenerate
// =============================================================================

describe('batchGenerate stage', () => {
  const scenes: StoryboardScene[] = [
    {
      index: 0,
      heading: 'S0',
      description: '',
      dialogue: [],
      estimatedDuration: 3,
      suggestedPrompt: 'prompt-0',
    },
    {
      index: 1,
      heading: 'S1',
      description: '',
      dialogue: [],
      estimatedDuration: 4,
      suggestedPrompt: 'prompt-1',
    },
  ];

  it('should create parallel tasks for each scene', () => {
    const stage = createBatchGenerateStage({
      mediaGenerator: { generate: async () => ({ path: '/out.mp4' }) },
    }) as IParallelStage;

    const tasks = stage.tasks({ scenes });
    expect(tasks).toHaveLength(2);
    expect(tasks[0]!.id).toBe('scene-0');
    expect(tasks[1]!.id).toBe('scene-1');
  });

  it('should merge successful results', () => {
    const stage = createBatchGenerateStage({
      mediaGenerator: { generate: async () => ({ path: '' }) },
    }) as IParallelStage;

    const ctx: PipelineContext = { scenes };
    const results = [
      { id: 'scene-0', success: true, data: { path: '/a.mp4' } },
      { id: 'scene-1', success: true, data: { path: '/b.mp4' } },
    ];

    const merged = stage.merge(ctx, results);
    expect(merged.generatedPaths).toEqual(['/a.mp4', '/b.mp4']);
    expect(merged.failedScenes).toBeUndefined();
  });

  it('should track failed scenes', () => {
    const stage = createBatchGenerateStage({
      mediaGenerator: { generate: async () => ({ path: '' }) },
    }) as IParallelStage;

    const ctx: PipelineContext = { scenes };
    const results = [
      { id: 'scene-0', success: true, data: { path: '/a.mp4' } },
      { id: 'scene-1', success: false, error: 'API error' },
    ];

    const merged = stage.merge(ctx, results);
    expect(merged.generatedPaths).toEqual(['/a.mp4', '']);
    expect(merged.failedScenes).toEqual([1]);
  });

  it('should return empty tasks when no scenes', () => {
    const stage = createBatchGenerateStage({
      mediaGenerator: { generate: async () => ({ path: '' }) },
    }) as IParallelStage;

    expect(stage.tasks({})).toHaveLength(0);
  });
});

// =============================================================================
// arrangeOnTimeline
// =============================================================================

describe('arrangeOnTimeline stage', () => {
  it('should add elements sequentially', async () => {
    const addedElements: Array<{ source: string; startTime: number }> = [];
    const stage = createArrangeOnTimelineStage({
      timelineArranger: {
        addElement: async (config) => {
          addedElements.push({ source: config.source, startTime: config.startTime });
          return `elem-${addedElements.length}`;
        },
      },
    });

    const scenes: StoryboardScene[] = [
      {
        index: 0,
        heading: '',
        description: '',
        dialogue: [],
        estimatedDuration: 5,
        suggestedPrompt: '',
      },
      {
        index: 1,
        heading: '',
        description: '',
        dialogue: [],
        estimatedDuration: 3,
        suggestedPrompt: '',
      },
    ];

    const result = await stage.execute({
      generatedPaths: ['/a.mp4', '/b.mp4'],
      scenes,
    });

    expect(result.elementIds).toEqual(['elem-1', 'elem-2']);
    expect(addedElements[0]!.startTime).toBe(0);
    expect(addedElements[1]!.startTime).toBe(5); // After first scene duration
    expect(result.totalDuration).toBe(8); // 5 + 3
  });

  it('should skip failed scenes (empty paths)', async () => {
    const addedElements: string[] = [];
    const stage = createArrangeOnTimelineStage({
      timelineArranger: {
        addElement: async (config) => {
          addedElements.push(config.source);
          return `elem-${addedElements.length}`;
        },
      },
    });

    const scenes: StoryboardScene[] = [
      {
        index: 0,
        heading: '',
        description: '',
        dialogue: [],
        estimatedDuration: 4,
        suggestedPrompt: '',
      },
      {
        index: 1,
        heading: '',
        description: '',
        dialogue: [],
        estimatedDuration: 4,
        suggestedPrompt: '',
      },
      {
        index: 2,
        heading: '',
        description: '',
        dialogue: [],
        estimatedDuration: 4,
        suggestedPrompt: '',
      },
    ];

    const result = await stage.execute({
      generatedPaths: ['/a.mp4', '', '/c.mp4'],
      scenes,
    });

    // Only 2 elements added (skipped index 1)
    expect(addedElements).toEqual(['/a.mp4', '/c.mp4']);
    expect(result.elementIds).toHaveLength(2);
  });

  it('should throw when no generated paths', async () => {
    const stage = createArrangeOnTimelineStage({
      timelineArranger: { addElement: async () => '' },
    });
    await expect(stage.execute({})).rejects.toThrow('No generated media paths');
  });
});
