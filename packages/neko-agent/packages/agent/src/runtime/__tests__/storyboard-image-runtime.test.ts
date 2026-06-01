import { describe, expect, it, vi } from 'vitest';
import type { StoryboardTableV1, Tool } from '@neko/shared';
import {
  backfillStoryboardGeneratedMediaRefs,
  createStoryboardImageToolCapabilities,
  executeStoryboardImageStrategyRuntime,
  planStoryboardImageStrategyRuntime,
  storyboardRuntimeCanExecute,
} from '../storyboard-image-runtime';

describe('storyboard image runtime', () => {
  it('plans provider-routed generation without depending on subpackage webviews', () => {
    const plan = planStoryboardImageStrategyRuntime({
      table: storyboardTable({
        imageStrategy: 'generate-new',
        generationPrompt: 'cinematic frame',
      }),
      availableTools: [{ toolName: 'GenerateImage', supportsReferences: true }],
    });

    expect(plan.executableActions).toEqual([
      expect.objectContaining({
        kind: 'generate-image',
        toolName: 'GenerateImage',
        generationPrompt: 'cinematic frame',
      }),
    ]);
    expect(plan.reuseActions).toEqual([]);
    expect(storyboardRuntimeCanExecute(plan)).toBe(true);
  });

  it('degrades when provider execution capability is missing', async () => {
    const result = await executeStoryboardImageStrategyRuntime({
      table: storyboardTable({
        imageStrategy: 'generate-new',
        generationPrompt: 'cinematic frame',
      }),
      availableTools: [{ toolName: 'GenerateImage', supportsReferences: true }],
    });

    expect(result.executions).toEqual([]);
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'warning',
        code: 'missing-capability',
      }),
    ]);
  });

  it('executes routed actions through the injected tool port', async () => {
    const execute = vi.fn().mockResolvedValue({
      success: true,
      data: { status: 'completed' },
      attachments: [{ type: 'image', path: '${WORKSPACE}/shot.png', mimeType: 'image/png' }],
    });

    const result = await executeStoryboardImageStrategyRuntime({
      table: storyboardTable({
        imageStrategy: 'generate-new',
        generationPrompt: 'cinematic frame',
      }),
      availableTools: [{ toolName: 'GenerateImage', supportsReferences: true }],
      toolPort: { execute },
    });

    expect(execute).toHaveBeenCalledWith(
      'GenerateImage',
      expect.objectContaining({
        prompt: 'cinematic frame',
        shotId: 'shot-1',
      }),
      undefined,
    );
    expect(result.executions[0]?.result.success).toBe(true);
  });

  it('discovers tools through get/list when has returns false', () => {
    const capabilities = createStoryboardImageToolCapabilities({
      has: () => false,
      get: (name) =>
        name === 'GenerateImage'
          ? tool('GenerateImage', {
              prompt: { type: 'string' },
              referenceImageUrl: { type: 'string' },
            })
          : undefined,
    });

    expect(capabilities).toEqual([
      {
        toolName: 'GenerateImage',
        supportsReferences: true,
        supportsMasks: false,
      },
    ]);
  });

  it('does not claim GenerateImage reference support without reference-like inputs', () => {
    const capabilities = createStoryboardImageToolCapabilities({
      list: () => [tool('GenerateImage', { prompt: { type: 'string' } })],
    });

    expect(capabilities).toEqual([
      {
        toolName: 'GenerateImage',
        supportsReferences: false,
        supportsMasks: false,
      },
    ]);

    const plan = planStoryboardImageStrategyRuntime({
      table: storyboardTable({
        imageStrategy: 'use-as-reference',
        generationPrompt: 'cinematic frame',
        sourceMediaRefs: [sourceMediaRef('source-1')],
      }),
      toolPort: {
        list: () => [tool('GenerateImage', { prompt: { type: 'string' } })],
      },
    });

    expect(plan.executableActions).toEqual([]);
    expect(plan.blockedActions[0]).toMatchObject({
      reason: 'missing-capability',
      imageStrategy: 'use-as-reference',
    });
  });

  it('backfills generated refs only after completed tool outputs', () => {
    const result = backfillStoryboardGeneratedMediaRefs({
      table: storyboardTable({
        imageStrategy: 'generate-new',
        generationPrompt: 'cinematic frame',
      }),
      completions: [
        {
          sceneId: 'scene-1',
          shotId: 'shot-1',
          toolCallId: 'generate-1',
          success: true,
          outputs: [{ assetIndex: 0, mimeType: 'image/png', label: 'Generated keyframe' }],
        },
      ],
    });

    expect(result.diagnostics).toEqual([]);
    expect(result.table.scenes[0]?.shots[0]?.generatedMediaRefs).toEqual([
      {
        refId: 'tool-result:generate-1:0',
        role: 'generated',
        locator: {
          type: 'tool-result',
          toolCallId: 'generate-1',
          assetIndex: 0,
        },
        label: 'Generated keyframe',
        mimeType: 'image/png',
      },
    ]);
  });

  it('keeps the storyboard visible and does not create fake refs when generation fails', () => {
    const result = backfillStoryboardGeneratedMediaRefs({
      table: storyboardTable({
        imageStrategy: 'generate-new',
        generationPrompt: 'cinematic frame',
      }),
      completions: [
        {
          sceneId: 'scene-1',
          shotId: 'shot-1',
          toolCallId: 'generate-1',
          success: false,
          error: 'Bad Gateway',
        },
      ],
    });

    expect(result.table.scenes[0]?.shots[0]?.generatedMediaRefs).toBeUndefined();
    expect(result.diagnostics).toEqual([
      expect.objectContaining({
        severity: 'warning',
        code: 'generation-failed',
        message: 'Bad Gateway',
      }),
    ]);
  });

  it('keeps generated refs empty when provider capability is absent', async () => {
    const table = storyboardTable({
      imageStrategy: 'generate-new',
      generationPrompt: 'cinematic frame',
    });

    const result = await executeStoryboardImageStrategyRuntime({
      table,
      availableTools: [],
      toolPort: { execute: vi.fn() },
    });

    expect(result.executions).toEqual([]);
    expect(result.plan.blockedActions[0]).toMatchObject({
      reason: 'missing-capability',
      imageStrategy: 'generate-new',
    });
    expect(result.plan.table.scenes[0]?.shots[0]?.generatedMediaRefs).toBeUndefined();
  });
});

function storyboardTable(
  shot: Partial<StoryboardTableV1['scenes'][number]['shots'][number]>,
): StoryboardTableV1 {
  return {
    schemaVersion: 1,
    kind: 'storyboard-table',
    title: 'Storyboard',
    scenes: [
      {
        sceneId: 'scene-1',
        sceneTitle: 'Scene',
        shots: [
          {
            shotId: 'shot-1',
            shotNumber: 1,
            duration: 3,
            visualDescription: 'Rin finds the signal.',
            characterAction: 'Rin looks up.',
            imageStrategy: 'generate-new',
            ...shot,
          },
        ],
      },
    ],
  };
}

function tool(name: string, properties: Tool['parameters']['properties']): Tool {
  return {
    name,
    description: name,
    parameters: {
      type: 'object',
      properties,
    },
    category: 'generation',
    execute: async () => ({ success: true }),
  };
}

function sourceMediaRef(refId: string) {
  return {
    refId,
    role: 'source' as const,
    locator: {
      type: 'tool-result' as const,
      toolCallId: `tool-${refId}`,
      assetIndex: 0,
    },
  };
}
