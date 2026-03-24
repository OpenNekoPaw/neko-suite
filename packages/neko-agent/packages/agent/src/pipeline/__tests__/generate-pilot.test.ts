/**
 * GeneratePilot stage unit tests
 */

import { describe, it, expect, vi } from 'vitest';
import { createGeneratePilotStage } from '../stages/generate-pilot';
import type { PipelineContext, StoryboardScene } from '../types';

function createScene(index: number): StoryboardScene {
  return {
    index,
    heading: `Scene ${index}`,
    description: `Description for scene ${index}`,
    dialogue: [],
    estimatedDuration: 4,
    suggestedPrompt: `A beautiful scene ${index}, cinematic lighting`,
  };
}

function createCtx(overrides?: Partial<PipelineContext>): PipelineContext {
  return {
    source: '/test.fountain',
    scenes: [createScene(0), createScene(1), createScene(2)],
    ...overrides,
  };
}

describe('generatePilot stage', () => {
  it('should have correct metadata', () => {
    const stage = createGeneratePilotStage({
      mediaGenerator: { generate: vi.fn() },
    });

    expect(stage.name).toBe('generatePilot');
    expect(stage.type).toBe('linear');
    expect(stage.gate).toBe('confirm');
  });

  it('should generate pilot for scene 0 by default', async () => {
    const mockGenerator = {
      generate: vi.fn().mockResolvedValue({ path: '/tmp/pilot.png' }),
    };
    const stage = createGeneratePilotStage({ mediaGenerator: mockGenerator });

    const result = await stage.execute(createCtx());

    expect(mockGenerator.generate).toHaveBeenCalledOnce();
    expect(mockGenerator.generate).toHaveBeenCalledWith(
      'A beautiful scene 0, cinematic lighting',
      expect.objectContaining({ type: 'image' }),
    );
    expect(result.pilotPath).toBe('/tmp/pilot.png');
    expect(result.pilotSceneIndex).toBe(0);
  });

  it('should respect stageParams for pilot scene index', async () => {
    const mockGenerator = {
      generate: vi.fn().mockResolvedValue({ path: '/tmp/pilot-2.png' }),
    };
    const stage = createGeneratePilotStage({ mediaGenerator: mockGenerator });

    const ctx = createCtx({
      stageParams: { generatePilot: { sceneIndex: 2 } },
    });
    const result = await stage.execute(ctx);

    expect(mockGenerator.generate).toHaveBeenCalledWith(
      'A beautiful scene 2, cinematic lighting',
      expect.any(Object),
    );
    expect(result.pilotSceneIndex).toBe(2);
  });

  it('should use globalStyle from context', async () => {
    const mockGenerator = {
      generate: vi.fn().mockResolvedValue({ path: '/tmp/pilot.png' }),
    };
    const stage = createGeneratePilotStage({ mediaGenerator: mockGenerator });

    await stage.execute(createCtx({ globalStyle: 'anime' }));

    expect(mockGenerator.generate).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ style: 'anime' }),
    );
  });

  it('should skip if scenes is empty', async () => {
    const mockGenerator = { generate: vi.fn() };
    const stage = createGeneratePilotStage({ mediaGenerator: mockGenerator });

    const result = await stage.execute(createCtx({ scenes: [] }));

    expect(mockGenerator.generate).not.toHaveBeenCalled();
    expect(result.pilotPath).toBeUndefined();
  });

  it('should skip if scenes is undefined', async () => {
    const mockGenerator = { generate: vi.fn() };
    const stage = createGeneratePilotStage({ mediaGenerator: mockGenerator });

    const result = await stage.execute(createCtx({ scenes: undefined }));

    expect(mockGenerator.generate).not.toHaveBeenCalled();
  });

  it('should skip if pilot scene index out of bounds', async () => {
    const mockGenerator = { generate: vi.fn() };
    const stage = createGeneratePilotStage({ mediaGenerator: mockGenerator });

    const ctx = createCtx({
      stageParams: { generatePilot: { sceneIndex: 99 } },
    });
    const result = await stage.execute(ctx);

    expect(mockGenerator.generate).not.toHaveBeenCalled();
    expect(result.pilotPath).toBeUndefined();
  });
});
