/**
 * ConsistencyCheckTools unit tests
 *
 * Tests the QualityCheckConsistency tool factory and execution.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createConsistencyCheckTools } from '../consistencyCheckTools';

// Mock vscode
vi.mock('vscode', () => ({
  Uri: {
    file: (path: string) => ({ fsPath: path, scheme: 'file' }),
  },
  workspace: {
    fs: {
      readFile: vi.fn(),
    },
  },
}));

// Mock the logger
vi.mock('../../base', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

// =============================================================================
// Helpers
// =============================================================================

function createMockService(responseJson: unknown) {
  return {
    chat: vi.fn().mockResolvedValue({
      message: { content: JSON.stringify(responseJson) },
    }),
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('createConsistencyCheckTools', () => {
  let mockService: ReturnType<typeof createMockService>;

  beforeEach(() => {
    mockService = createMockService({
      driftScore: 15,
      description: 'Minor color variation',
      characterIssues: [],
    });
  });

  it('should return array with QualityCheckConsistency tool', () => {
    const tools = createConsistencyCheckTools({
      createService: () => mockService,
    });

    expect(tools).toHaveLength(1);
    expect(tools[0]!.name).toBe('QualityCheckConsistency');
  });

  it('should have correct parameter schema', () => {
    const tools = createConsistencyCheckTools({
      createService: () => mockService,
    });
    const tool = tools[0]!;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- testing schema structure
    const params = tool.parameters as any;
    expect(params.required).toContain('scenes');
    expect(params.properties).toHaveProperty('scenes');
    expect(params.properties).toHaveProperty('globalStyle');
    expect(params.properties).toHaveProperty('characters');
  });

  it('should return ConsistencyReport on execute', async () => {
    const tools = createConsistencyCheckTools({
      createService: () => mockService,
    });
    const tool = tools[0]!;

    const result = (await tool.execute({
      scenes: [
        { sceneIndex: 0, mediaPath: '/media/scene0.png', prompt: 'Scene A' },
        { sceneIndex: 1, mediaPath: '/media/scene1.png', prompt: 'Scene B' },
      ],
    })) as { success: boolean; data: Record<string, unknown> };

    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('overallConsistency');
    expect(result.data).toHaveProperty('styleDrift');
    expect(result.data).toHaveProperty('characterConsistency');
    expect(result.data).toHaveProperty('aestheticScore');
    expect(result.data).toHaveProperty('recommendations');
  });

  it('should return default report for empty scenes', async () => {
    const tools = createConsistencyCheckTools({
      createService: () => mockService,
    });
    const tool = tools[0]!;

    const result = (await tool.execute({
      scenes: [],
    })) as { success: boolean; data: Record<string, unknown> };

    expect(result.success).toBe(true);
    expect(result.data.overallConsistency).toBe(100);
  });

  it('should pass globalStyle and characters to evaluator', async () => {
    const tools = createConsistencyCheckTools({
      createService: () => mockService,
    });
    const tool = tools[0]!;

    const result = (await tool.execute({
      scenes: [
        { sceneIndex: 0, mediaPath: '/media/scene0.png', prompt: 'A' },
        { sceneIndex: 1, mediaPath: '/media/scene1.png', prompt: 'B' },
      ],
      globalStyle: 'cinematic dark tone',
      characters: [{ name: 'Hero', description: 'Tall figure in armor' }],
    })) as { success: boolean; data: Record<string, unknown> };

    expect(result.success).toBe(true);
    // LLM should have been called (at minimum for pairwise eval)
    expect(mockService.chat).toHaveBeenCalled();
  });
});
