/**
 * QualityCheck tool unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createQualityCheckTools } from '../qualityCheckTools';

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
      message: {
        content: JSON.stringify(responseJson),
      },
    }),
  };
}

function createMockGenerator() {
  return {
    generate: vi.fn().mockResolvedValue({ path: '/tmp/regenerated.png' }),
  };
}

function createScenes(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    index: i,
    mediaPath: `/tmp/scene-${i}.png`,
    prompt: `A beautiful scene ${i}`,
    description: `Scene ${i} description`,
  }));
}

// =============================================================================
// Tests
// =============================================================================

describe('QualityCheck Tool', () => {
  let mockReadFile: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.clearAllMocks();
    const vscode = await import('vscode');
    mockReadFile = vi.mocked(vscode.workspace.fs.readFile);
    // Return fake image bytes
    mockReadFile.mockResolvedValue(new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
  });

  describe('empty input', () => {
    it('should return empty result for no scenes', async () => {
      const mockService = createMockService({ score: 80, issues: [] });
      const tools = createQualityCheckTools({
        createService: () => mockService,
        mediaGenerator: createMockGenerator(),
      });

      const tool = tools.find((t) => t.name === 'QualityCheck')!;
      const result = (await tool.execute({ scenes: [] })) as {
        success: boolean;
        data: { totalScenes: number; passed: number; failed: number };
      };

      expect(result.success).toBe(true);
      expect(result.data.totalScenes).toBe(0);
      expect(result.data.passed).toBe(0);
      expect(result.data.failed).toBe(0);
    });
  });

  describe('all scenes pass', () => {
    it('should evaluate all scenes and return pass results', async () => {
      const mockService = createMockService({
        score: 85,
        issues: [],
        suggestion: '',
      });
      const mockGenerator = createMockGenerator();

      const tools = createQualityCheckTools({
        createService: () => mockService,
        mediaGenerator: mockGenerator,
      });

      const tool = tools.find((t) => t.name === 'QualityCheck')!;
      const result = (await tool.execute({
        scenes: createScenes(3),
        minScore: 60,
      })) as {
        success: boolean;
        data: {
          totalScenes: number;
          passed: number;
          failed: number;
          evaluations: Array<{ passed: boolean; attempts: number; finalScore: number }>;
        };
      };

      expect(result.success).toBe(true);
      expect(result.data.totalScenes).toBe(3);
      expect(result.data.passed).toBe(3);
      expect(result.data.failed).toBe(0);
      // No regeneration should have happened
      expect(mockGenerator.generate).not.toHaveBeenCalled();
      // All should have 1 attempt
      for (const evaluation of result.data.evaluations) {
        expect(evaluation.passed).toBe(true);
        expect(evaluation.attempts).toBe(1);
      }
    });
  });

  describe('retry succeeds', () => {
    it('should retry failed scenes and pass on second attempt', async () => {
      let callCount = 0;
      const mockService = {
        chat: vi.fn().mockImplementation(() => {
          callCount++;
          // First call: low score, second call: optimization prompt, third call: high score
          if (callCount === 1) {
            return Promise.resolve({
              message: {
                content: JSON.stringify({
                  score: 30,
                  issues: ['Blurry image'],
                  suggestion: 'Add more detail',
                }),
              },
            });
          }
          if (callCount === 2) {
            // Prompt optimization call
            return Promise.resolve({
              message: { content: 'Improved detailed prompt for scene' },
            });
          }
          // Re-evaluation: pass
          return Promise.resolve({
            message: { content: JSON.stringify({ score: 80, issues: [], suggestion: '' }) },
          });
        }),
      };

      const mockGenerator = createMockGenerator();

      const tools = createQualityCheckTools({
        createService: () => mockService,
        mediaGenerator: mockGenerator,
      });

      const tool = tools.find((t) => t.name === 'QualityCheck')!;
      const result = (await tool.execute({
        scenes: [createScenes(1)[0]],
        maxRetries: 2,
        minScore: 60,
      })) as {
        success: boolean;
        data: {
          passed: number;
          failed: number;
          evaluations: Array<{ passed: boolean; attempts: number; finalPath: string }>;
        };
      };

      expect(result.data.passed).toBe(1);
      expect(result.data.failed).toBe(0);
      expect(result.data.evaluations[0]!.attempts).toBe(2);
      expect(result.data.evaluations[0]!.finalPath).toBe('/tmp/regenerated.png');
      expect(mockGenerator.generate).toHaveBeenCalledTimes(1);
    });
  });

  describe('max retries exhausted', () => {
    it('should mark scene as failed after maxRetries', async () => {
      const mockService = createMockService({
        score: 20,
        issues: ['Poor quality'],
        suggestion: 'Try different approach',
      });
      const mockGenerator = createMockGenerator();

      const tools = createQualityCheckTools({
        createService: () => mockService,
        mediaGenerator: mockGenerator,
      });

      const tool = tools.find((t) => t.name === 'QualityCheck')!;
      const result = (await tool.execute({
        scenes: [createScenes(1)[0]],
        maxRetries: 2,
        minScore: 60,
      })) as {
        success: boolean;
        data: {
          passed: number;
          failed: number;
          evaluations: Array<{ passed: boolean; attempts: number; finalScore: number }>;
        };
      };

      expect(result.data.passed).toBe(0);
      expect(result.data.failed).toBe(1);
      expect(result.data.evaluations[0]!.passed).toBe(false);
      expect(result.data.evaluations[0]!.attempts).toBe(3); // initial + 2 retries
      expect(mockGenerator.generate).toHaveBeenCalledTimes(2);
    });
  });

  describe('invalid LLM response', () => {
    it('should handle non-JSON LLM response gracefully', async () => {
      const mockService = {
        chat: vi.fn().mockResolvedValue({
          message: { content: 'This is not valid JSON at all' },
        }),
      };
      const mockGenerator = createMockGenerator();

      const tools = createQualityCheckTools({
        createService: () => mockService,
        mediaGenerator: mockGenerator,
      });

      const tool = tools.find((t) => t.name === 'QualityCheck')!;
      const result = (await tool.execute({
        scenes: [createScenes(1)[0]],
        maxRetries: 0,
        minScore: 60,
      })) as {
        success: boolean;
        data: {
          failed: number;
          evaluations: Array<{ finalScore: number; issues: string[] }>;
        };
      };

      expect(result.data.failed).toBe(1);
      expect(result.data.evaluations[0]!.finalScore).toBe(0);
    });
  });

  describe('file read failure', () => {
    it('should handle file read errors gracefully', async () => {
      mockReadFile.mockRejectedValue(new Error('File not found'));

      const mockService = createMockService({ score: 80, issues: [] });
      const mockGenerator = createMockGenerator();

      const tools = createQualityCheckTools({
        createService: () => mockService,
        mediaGenerator: mockGenerator,
      });

      const tool = tools.find((t) => t.name === 'QualityCheck')!;
      const result = (await tool.execute({
        scenes: [createScenes(1)[0]],
        maxRetries: 0,
        minScore: 60,
      })) as {
        success: boolean;
        data: {
          failed: number;
          evaluations: Array<{ passed: boolean; issues: string[] }>;
        };
      };

      // Should fail gracefully, not throw
      expect(result.success).toBe(true);
      expect(result.data.failed).toBe(1);
    });
  });

  describe('sorted output', () => {
    it('should return evaluations sorted by scene index', async () => {
      const mockService = createMockService({
        score: 90,
        issues: [],
        suggestion: '',
      });

      const tools = createQualityCheckTools({
        createService: () => mockService,
        mediaGenerator: createMockGenerator(),
      });

      const tool = tools.find((t) => t.name === 'QualityCheck')!;
      const scenes = createScenes(5);
      const result = (await tool.execute({ scenes })) as {
        success: boolean;
        data: {
          evaluations: Array<{ index: number }>;
        };
      };

      const indices = result.data.evaluations.map((e) => e.index);
      expect(indices).toEqual([0, 1, 2, 3, 4]);
    });
  });
});
