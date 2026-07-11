/**
 * QualityCheck tool unit tests
 *
 * Tests structured MediaEvaluation responses with QualityIssue[] and RemediationAction[].
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createLegacyQualityCheckTools as createQualityCheckToolsRaw,
  type QualityCheckToolsDeps,
} from '../qualityCheckTools';

// Mock vscode
vi.mock('vscode', () => ({
  env: {
    language: 'zh-CN',
  },
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

/** Create a mock LLM service that returns a MediaEvaluation JSON */
function createMockService(responseJson: unknown) {
  return {
    chat: vi.fn().mockResolvedValue({
      message: {
        content: JSON.stringify(responseJson),
      },
    }),
  };
}

/** Create a mock MediaEvaluation response (structured format) */
function createPassingEvaluation(overrides?: Record<string, unknown>) {
  return {
    overallScore: 85,
    dimensions: {
      technicalQuality: 90,
      promptAdherence: 80,
      scriptAdherence: null,
      aesthetics: 85,
    },
    issues: [],
    ...overrides,
  };
}

/** Create a failing MediaEvaluation response with issues */
function createFailingEvaluation(overrides?: Record<string, unknown>) {
  return {
    overallScore: 30,
    dimensions: {
      technicalQuality: 25,
      promptAdherence: 40,
      scriptAdherence: null,
      aesthetics: 30,
    },
    issues: [
      {
        category: 'artifact',
        severity: 'major',
        description: 'Blurry image with visible noise',
      },
      {
        category: 'prompt-mismatch',
        severity: 'minor',
        description: 'Missing requested element',
      },
    ],
    ...overrides,
  };
}

function createMockGenerator() {
  return {
    generate: vi.fn().mockResolvedValue({ path: '/tmp/regenerated.png' }),
  };
}

const CHAT_MODEL = { providerId: 'deepseek-direct', modelId: 'deepseek-chat' } as const;

function createQualityCheckTools(deps: QualityCheckToolsDeps) {
  return createQualityCheckToolsRaw({
    ...deps,
    chatModel: deps.chatModel ?? CHAT_MODEL,
  });
}

/** Create a mock audio analyzer returning clean or problematic metrics */
function createMockAudioAnalyzer(overrides?: {
  loudness?: Partial<{
    integratedLufs: number;
    truePeakDbfs: number;
    loudnessRange: number;
    recommendedGain: number;
    targetLufs: number;
  }>;
  silence?: Partial<{
    totalDuration: number;
    silenceDuration: number;
    silenceRatio: number;
    regionCount: number;
  }>;
}) {
  return {
    analyzeLoudness: vi.fn().mockResolvedValue({
      integratedLufs: -14,
      truePeakDbfs: -3,
      loudnessRange: 8,
      recommendedGain: 0,
      targetLufs: -14,
      ...overrides?.loudness,
    }),
    detectSilence: vi.fn().mockResolvedValue({
      totalDuration: 30,
      silenceDuration: 3,
      silenceRatio: 0.1,
      regionCount: 2,
      ...overrides?.silence,
    }),
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

function createAudioScenes(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    index: i,
    mediaPath: `/tmp/audio-${i}.mp3`,
    prompt: `Background music ${i}`,
    description: `Audio scene ${i}`,
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
      const mockService = createMockService(createPassingEvaluation());
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
    it('keeps file bytes behind the VSCode host adapter while quality policy runs in skills', async () => {
      const mockService = createMockService(createPassingEvaluation());
      const tools = createQualityCheckTools({
        createService: () => mockService,
        mediaGenerator: createMockGenerator(),
      });

      const tool = tools.find((t) => t.name === 'QualityCheck')!;
      await tool.execute({
        scenes: [{ index: 0, mediaPath: '${WORKSPACE}/scene.png', prompt: 'Scene' }],
      });

      expect(mockReadFile).toHaveBeenCalledWith(
        expect.objectContaining({ fsPath: '${WORKSPACE}/scene.png' }),
      );
      expect(mockService.chat).toHaveBeenCalled();
      expect(mockService.chat).toHaveBeenCalledWith(
        expect.any(Array),
        expect.objectContaining({
          providerId: 'deepseek-direct',
          modelId: 'deepseek-chat',
        }),
      );
    });

    it('passes the VSCode locale into the final QualityCheck model prompt', async () => {
      const mockService = createMockService(createPassingEvaluation());
      const tools = createQualityCheckTools({
        createService: () => mockService,
        mediaGenerator: createMockGenerator(),
      });

      const tool = tools.find((t) => t.name === 'QualityCheck')!;
      await tool.execute({
        scenes: [{ index: 0, mediaPath: '/tmp/scene.png', prompt: 'Scene' }],
      });

      const messages = mockService.chat.mock.calls[0]![0] as Array<{
        role: string;
        content: string | Array<{ type: string; text?: string }>;
      }>;
      expect(messages[0]!.content).toContain('视觉质量评估器');
      expect(messages[0]!.content).not.toContain('You are a visual quality evaluator');
    });

    it('fails visibly when executed without an explicit chat model', async () => {
      const mockService = createMockService(createPassingEvaluation());
      const tools = createQualityCheckToolsRaw({
        createService: () => mockService,
        mediaGenerator: createMockGenerator(),
      });

      const tool = tools.find((t) => t.name === 'QualityCheck')!;
      await expect(
        tool.execute({
          scenes: [{ index: 0, mediaPath: '${WORKSPACE}/scene.png', prompt: 'Scene' }],
        }),
      ).rejects.toThrow(
        'Media quality LLM evaluation requires an explicit chat providerId and modelId.',
      );
      expect(mockService.chat).not.toHaveBeenCalled();
    });

    it('should evaluate all scenes and return pass results with dimensions', async () => {
      const mockService = createMockService(createPassingEvaluation());
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
          evaluations: Array<{
            passed: boolean;
            attempts: number;
            finalScore: number;
            issues: Array<{ category: string; severity: string; description: string }>;
            dimensions?: { technicalQuality: number; promptAdherence: number; aesthetics: number };
          }>;
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
        expect(evaluation.finalScore).toBe(85);
        // Verify structured issues (empty for passing)
        expect(evaluation.issues).toEqual([]);
        // Verify dimensions are returned
        expect(evaluation.dimensions).toBeDefined();
        expect(evaluation.dimensions!.technicalQuality).toBe(90);
        expect(evaluation.dimensions!.promptAdherence).toBe(80);
        expect(evaluation.dimensions!.aesthetics).toBe(85);
      }
    });
  });

  describe('structured issues and remediations', () => {
    it('should return QualityIssue[] and RemediationAction[] for failing scenes', async () => {
      const mockService = createMockService(createFailingEvaluation({ overallScore: 20 }));
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
          evaluations: Array<{
            issues: Array<{ category: string; severity: string; description: string }>;
            remediations?: Array<{ type: string; toolName?: string; confidence: number }>;
          }>;
        };
      };

      const evaluation = result.data.evaluations[0]!;

      // Issues should be structured QualityIssue[]
      expect(evaluation.issues).toHaveLength(2);
      expect(evaluation.issues[0]).toMatchObject({
        category: 'artifact',
        severity: 'major',
        description: 'Blurry image with visible noise',
      });
      expect(evaluation.issues[1]).toMatchObject({
        category: 'prompt-mismatch',
        severity: 'minor',
        description: 'Missing requested element',
      });

      // Remediations should exist for critical/major issues
      expect(evaluation.remediations).toBeDefined();
      // Only 'artifact' (major) gets remediation; 'prompt-mismatch' is minor
      expect(evaluation.remediations!.length).toBeGreaterThanOrEqual(1);
      // artifact → apply-effect with AddEffect
      const artifactRemediation = evaluation.remediations!.find((r) => r.toolName === 'AddEffect');
      expect(artifactRemediation).toBeDefined();
      expect(artifactRemediation!.type).toBe('apply-effect');
      expect(artifactRemediation!.confidence).toBeGreaterThan(0);
    });
  });

  describe('retry succeeds', () => {
    it('should retry failed scenes and pass on second attempt', async () => {
      let callCount = 0;
      const mockService = {
        chat: vi.fn().mockImplementation(() => {
          callCount++;
          // First call: low score with structured issues
          if (callCount === 1) {
            return Promise.resolve({
              message: {
                content: JSON.stringify(createFailingEvaluation({ overallScore: 30 })),
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
            message: {
              content: JSON.stringify(createPassingEvaluation({ overallScore: 80 })),
            },
          });
        }),
      };

      const mockGenerator = createMockGenerator();

      const tools = createQualityCheckTools({
        createService: () => mockService,
        mediaGenerator: mockGenerator,
      });

      const tool = tools.find((t) => t.name === 'QualityRepairCheck')!;
      const result = (await tool.execute({
        scenes: [createScenes(1)[0]],
        maxRetries: 2,
        minScore: 60,
      })) as {
        success: boolean;
        data: {
          passed: number;
          failed: number;
          evaluations: Array<{
            passed: boolean;
            attempts: number;
            finalPath: string;
            dimensions?: { technicalQuality: number };
          }>;
        };
      };

      expect(result.data.passed).toBe(1);
      expect(result.data.failed).toBe(0);
      expect(result.data.evaluations[0]!.attempts).toBe(2);
      expect(result.data.evaluations[0]!.finalPath).toBe('/tmp/regenerated.png');
      expect(mockGenerator.generate).toHaveBeenCalledTimes(1);
      // After retry, dimensions from passing eval should be present
      expect(result.data.evaluations[0]!.dimensions).toBeDefined();
      expect(result.data.evaluations[0]!.dimensions!.technicalQuality).toBe(90);
    });
  });

  describe('max retries exhausted', () => {
    it('should mark scene as failed after maxRetries', async () => {
      const mockService = createMockService(createFailingEvaluation({ overallScore: 20 }));
      const mockGenerator = createMockGenerator();

      const tools = createQualityCheckTools({
        createService: () => mockService,
        mediaGenerator: mockGenerator,
      });

      const tool = tools.find((t) => t.name === 'QualityRepairCheck')!;
      const result = (await tool.execute({
        scenes: [createScenes(1)[0]],
        maxRetries: 2,
        minScore: 60,
      })) as {
        success: boolean;
        data: {
          passed: number;
          failed: number;
          evaluations: Array<{
            passed: boolean;
            attempts: number;
            finalScore: number;
            issues: Array<{ category: string }>;
          }>;
        };
      };

      expect(result.data.passed).toBe(0);
      expect(result.data.failed).toBe(1);
      expect(result.data.evaluations[0]!.passed).toBe(false);
      expect(result.data.evaluations[0]!.attempts).toBe(3); // initial + 2 retries
      expect(mockGenerator.generate).toHaveBeenCalledTimes(2);
      // Issues should still be structured
      expect(result.data.evaluations[0]!.issues.length).toBeGreaterThan(0);
      expect(result.data.evaluations[0]!.issues[0]!.category).toBeDefined();
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
          evaluations: Array<{
            finalScore: number;
            issues: Array<{ category: string; severity: string }>;
          }>;
        };
      };

      expect(result.data.failed).toBe(1);
      expect(result.data.evaluations[0]!.finalScore).toBe(0);
      // Should have a fallback issue
      expect(result.data.evaluations[0]!.issues.length).toBeGreaterThan(0);
      expect(result.data.evaluations[0]!.issues[0]!.category).toBe('artifact');
      expect(result.data.evaluations[0]!.issues[0]!.severity).toBe('critical');
    });

    it('should handle invalid issue categories by filtering them out', async () => {
      const mockService = createMockService({
        overallScore: 85,
        dimensions: { technicalQuality: 80, promptAdherence: 90, aesthetics: 85 },
        issues: [
          { category: 'artifact', severity: 'minor', description: 'Slight noise' },
          { category: 'not-a-real-category', severity: 'major', description: 'Invalid' },
        ],
      });

      const tools = createQualityCheckTools({
        createService: () => mockService,
        mediaGenerator: createMockGenerator(),
      });

      const tool = tools.find((t) => t.name === 'QualityCheck')!;
      const result = (await tool.execute({
        scenes: [createScenes(1)[0]],
        maxRetries: 0,
        minScore: 60,
      })) as {
        success: boolean;
        data: {
          evaluations: Array<{ issues: Array<{ category: string }> }>;
        };
      };

      // Only valid category 'artifact' should survive
      const issues = result.data.evaluations[0]!.issues;
      expect(issues).toHaveLength(1);
      expect(issues[0]!.category).toBe('artifact');
    });
  });

  describe('file read failure', () => {
    it('should handle file read errors gracefully', async () => {
      mockReadFile.mockRejectedValue(new Error('File not found'));

      const mockService = createMockService(createPassingEvaluation());
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
          evaluations: Array<{
            passed: boolean;
            issues: Array<{ category: string; severity: string }>;
          }>;
        };
      };

      // Should fail gracefully, not throw
      expect(result.success).toBe(true);
      expect(result.data.failed).toBe(1);
      // Should have error issue
      expect(result.data.evaluations[0]!.issues[0]!.severity).toBe('critical');
    });
  });

  describe('sorted output', () => {
    it('should return evaluations sorted by scene index', async () => {
      const mockService = createMockService(createPassingEvaluation({ overallScore: 90 }));

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

  describe('evaluation context parameters', () => {
    it('should pass globalStyle and sceneDialogue to evaluator', async () => {
      const mockService = createMockService(createPassingEvaluation());

      const tools = createQualityCheckTools({
        createService: () => mockService,
        mediaGenerator: createMockGenerator(),
      });

      const tool = tools.find((t) => t.name === 'QualityCheck')!;
      await tool.execute({
        scenes: [createScenes(1)[0]],
        style: 'anime',
        sceneDialogue: ['Hello world', 'How are you?'],
      });

      // Verify the chat call includes style and dialogue in the user message
      const chatCall = mockService.chat.mock.calls[0]!;
      const messages = chatCall[0] as Array<{ role: string; content: unknown }>;
      const userMsg = messages.find((m) => m.role === 'user');
      expect(userMsg).toBeDefined();

      // Content should be an array with text part containing style/dialogue
      const content = userMsg!.content as Array<{ type: string; text?: string }>;
      const textPart = content.find((p) => p.type === 'text');
      expect(textPart?.text).toContain('全局风格：“anime”');
      expect(textPart?.text).toContain('对白：');
      expect(textPart?.text).toContain('Hello world');
    });
  });

  // ===========================================================================
  // Audio evaluation (Phase 3)
  // ===========================================================================

  describe('audio evaluation', () => {
    it('should use AudioEvaluator for .mp3 files and return audioMetrics', async () => {
      const mockAnalyzer = createMockAudioAnalyzer();
      const mockService = createMockService(createPassingEvaluation());

      const tools = createQualityCheckTools({
        createService: () => mockService,
        mediaGenerator: createMockGenerator(),
        audioAnalyzer: mockAnalyzer,
      });

      const tool = tools.find((t) => t.name === 'QualityCheck')!;
      const result = (await tool.execute({
        scenes: createAudioScenes(1),
        minScore: 60,
      })) as {
        success: boolean;
        data: {
          passed: number;
          failed: number;
          evaluations: Array<{
            passed: boolean;
            finalScore: number;
            dimensions?: { audioQuality?: number; technicalQuality: number };
            audioMetrics?: {
              integratedLufs: number;
              truePeakDbfs: number;
              clippingDetected: boolean;
              loudnessInRange: boolean;
            };
            issues: Array<{ category: string }>;
          }>;
        };
      };

      expect(result.success).toBe(true);
      expect(result.data.passed).toBe(1);
      // Should NOT have called LLM vision
      expect(mockService.chat).not.toHaveBeenCalled();
      // Should have called Engine audio analysis
      expect(mockAnalyzer.analyzeLoudness).toHaveBeenCalledTimes(1);
      expect(mockAnalyzer.detectSilence).toHaveBeenCalledTimes(1);
      // Should have audioMetrics
      const evaluation = result.data.evaluations[0]!;
      expect(evaluation.audioMetrics).toBeDefined();
      expect(evaluation.audioMetrics!.integratedLufs).toBe(-14);
      expect(evaluation.audioMetrics!.clippingDetected).toBe(false);
      expect(evaluation.audioMetrics!.loudnessInRange).toBe(true);
      // Should have audioQuality dimension
      expect(evaluation.dimensions?.audioQuality).toBeDefined();
      expect(evaluation.dimensions!.audioQuality!).toBeGreaterThan(0);
    });

    it('should detect clipping when truePeak > -1 dBFS', async () => {
      const mockAnalyzer = createMockAudioAnalyzer({
        loudness: { truePeakDbfs: 0.5 },
      });

      const tools = createQualityCheckTools({
        createService: () => createMockService(createPassingEvaluation()),
        mediaGenerator: createMockGenerator(),
        audioAnalyzer: mockAnalyzer,
      });

      const tool = tools.find((t) => t.name === 'QualityCheck')!;
      const result = (await tool.execute({
        scenes: createAudioScenes(1),
        minScore: 60,
        maxRetries: 0,
      })) as {
        success: boolean;
        data: {
          evaluations: Array<{
            issues: Array<{ category: string; severity: string; description: string }>;
            audioMetrics?: { clippingDetected: boolean; truePeakDbfs: number };
            remediations?: Array<{ type: string; toolName?: string }>;
          }>;
        };
      };

      const evaluation = result.data.evaluations[0]!;
      expect(evaluation.audioMetrics!.clippingDetected).toBe(true);
      // Should have audio-clipping issue
      const clippingIssue = evaluation.issues.find((i) => i.category === 'audio-clipping');
      expect(clippingIssue).toBeDefined();
      expect(clippingIssue!.severity).toBe('critical'); // truePeak > 0
      expect(clippingIssue!.description).toContain('dBFS');
      // Should have remediation
      expect(evaluation.remediations).toBeDefined();
      const clipRemediation = evaluation.remediations!.find(
        (r) => r.toolName === 'SetAudioProperties',
      );
      expect(clipRemediation).toBeDefined();
      expect(clipRemediation!.type).toBe('adjust-audio');
    });

    it('should detect loudness issues (< -24 LUFS)', async () => {
      const mockAnalyzer = createMockAudioAnalyzer({
        loudness: { integratedLufs: -30 },
      });

      const tools = createQualityCheckTools({
        createService: () => createMockService(createPassingEvaluation()),
        mediaGenerator: createMockGenerator(),
        audioAnalyzer: mockAnalyzer,
      });

      const tool = tools.find((t) => t.name === 'QualityCheck')!;
      const result = (await tool.execute({
        scenes: createAudioScenes(1),
        minScore: 60,
        maxRetries: 0,
      })) as {
        success: boolean;
        data: {
          evaluations: Array<{
            issues: Array<{ category: string; severity: string }>;
          }>;
        };
      };

      const loudnessIssue = result.data.evaluations[0]!.issues.find(
        (i) => i.category === 'loudness-off',
      );
      expect(loudnessIssue).toBeDefined();
      expect(loudnessIssue!.severity).toBe('major');
    });

    it('should pass clean audio with no issues', async () => {
      const mockAnalyzer = createMockAudioAnalyzer();

      const tools = createQualityCheckTools({
        createService: () => createMockService(createPassingEvaluation()),
        mediaGenerator: createMockGenerator(),
        audioAnalyzer: mockAnalyzer,
      });

      const tool = tools.find((t) => t.name === 'QualityCheck')!;
      const result = (await tool.execute({
        scenes: createAudioScenes(1),
        minScore: 60,
      })) as {
        success: boolean;
        data: {
          passed: number;
          evaluations: Array<{
            passed: boolean;
            issues: Array<{ category: string }>;
            finalScore: number;
          }>;
        };
      };

      expect(result.data.passed).toBe(1);
      expect(result.data.evaluations[0]!.passed).toBe(true);
      expect(result.data.evaluations[0]!.issues).toHaveLength(0);
      expect(result.data.evaluations[0]!.finalScore).toBeGreaterThanOrEqual(90);
    });

    it('should skip retry loop for audio (deterministic fix)', async () => {
      // Audio with low score should NOT trigger regeneration
      const mockAnalyzer = createMockAudioAnalyzer({
        loudness: { truePeakDbfs: 1.0, integratedLufs: -30 },
      });
      const mockGenerator = createMockGenerator();

      const tools = createQualityCheckTools({
        createService: () => createMockService(createPassingEvaluation()),
        mediaGenerator: mockGenerator,
        audioAnalyzer: mockAnalyzer,
      });

      const tool = tools.find((t) => t.name === 'QualityCheck')!;
      const result = (await tool.execute({
        scenes: createAudioScenes(1),
        maxRetries: 2,
        minScore: 60,
      })) as {
        success: boolean;
        data: {
          evaluations: Array<{ attempts: number; passed: boolean }>;
        };
      };

      // Should NOT have regenerated
      expect(mockGenerator.generate).not.toHaveBeenCalled();
      // Should have only 1 attempt (no retry)
      expect(result.data.evaluations[0]!.attempts).toBe(1);
      expect(result.data.evaluations[0]!.passed).toBe(false);
    });

    it('should fall back to vision evaluator if no audioAnalyzer provided', async () => {
      const mockService = createMockService(createPassingEvaluation());

      const tools = createQualityCheckTools({
        createService: () => mockService,
        mediaGenerator: createMockGenerator(),
        // No audioAnalyzer
      });

      const tool = tools.find((t) => t.name === 'QualityCheck')!;
      await tool.execute({
        scenes: createAudioScenes(1),
        maxRetries: 0,
        minScore: 60,
      });

      // Should have fallen back to LLM vision evaluator
      expect(mockService.chat).toHaveBeenCalled();
    });

    it('should handle audio analyzer failure gracefully', async () => {
      const mockAnalyzer = {
        analyzeLoudness: vi.fn().mockRejectedValue(new Error('Engine unavailable')),
        detectSilence: vi.fn().mockRejectedValue(new Error('Engine unavailable')),
      };

      const tools = createQualityCheckTools({
        createService: () => createMockService(createPassingEvaluation()),
        mediaGenerator: createMockGenerator(),
        audioAnalyzer: mockAnalyzer,
      });

      const tool = tools.find((t) => t.name === 'QualityCheck')!;
      const result = (await tool.execute({
        scenes: createAudioScenes(1),
        maxRetries: 0,
        minScore: 60,
      })) as {
        success: boolean;
        data: {
          failed: number;
          evaluations: Array<{
            finalScore: number;
            issues: Array<{ category: string; severity: string }>;
          }>;
        };
      };

      expect(result.success).toBe(true);
      expect(result.data.failed).toBe(1);
      expect(result.data.evaluations[0]!.finalScore).toBe(0);
      expect(result.data.evaluations[0]!.issues[0]!.severity).toBe('critical');
    });

    it('should detect multiple audio extensions (wav, flac, opus, m4a)', async () => {
      const extensions = ['wav', 'flac', 'opus', 'm4a', 'ogg', 'aac'];
      const mockAnalyzer = createMockAudioAnalyzer();
      const mockService = createMockService(createPassingEvaluation());

      const tools = createQualityCheckTools({
        createService: () => mockService,
        mediaGenerator: createMockGenerator(),
        audioAnalyzer: mockAnalyzer,
      });

      const tool = tools.find((t) => t.name === 'QualityCheck')!;
      const scenes = extensions.map((ext, i) => ({
        index: i,
        mediaPath: `/tmp/audio.${ext}`,
        prompt: 'Test audio',
      }));

      await tool.execute({ scenes, minScore: 60 });

      // All should have used audio analyzer, not LLM
      expect(mockAnalyzer.analyzeLoudness).toHaveBeenCalledTimes(extensions.length);
      expect(mockService.chat).not.toHaveBeenCalled();
    });
  });

  // ===========================================================================
  // Video evaluation (Phase 2)
  // ===========================================================================

  describe('video evaluation', () => {
    /** Create a mock frame extractor */
    function createMockFrameExtractor(overrides?: {
      probe?: Partial<{ duration: number; fps: number; width: number; height: number }>;
      extractFrame?: string | null;
    }) {
      const frameValue =
        overrides && 'extractFrame' in overrides ? overrides.extractFrame : 'base64framedata';
      return {
        extractFrame: vi.fn().mockResolvedValue(frameValue),
        probe: vi.fn().mockResolvedValue({
          duration: 5.0,
          fps: 30,
          width: 1920,
          height: 1080,
          ...overrides?.probe,
        }),
      };
    }

    function createVideoScenes(count: number) {
      return Array.from({ length: count }, (_, i) => ({
        index: i,
        mediaPath: `/tmp/video-${i}.mp4`,
        prompt: `A cinematic scene ${i}`,
        description: `Video scene ${i}`,
      }));
    }

    /** Create a video-specific passing evaluation response */
    function createVideoPassingEvaluation(overrides?: Record<string, unknown>) {
      return {
        overallScore: 85,
        dimensions: {
          technicalQuality: 90,
          promptAdherence: 80,
          scriptAdherence: null,
          aesthetics: 85,
          videoQuality: 88,
        },
        issues: [],
        ...overrides,
      };
    }

    it('should use VideoFrameEvaluator for .mp4 files', async () => {
      const mockExtractor = createMockFrameExtractor();
      const mockService = createMockService(createVideoPassingEvaluation());

      const tools = createQualityCheckTools({
        createService: () => mockService,
        mediaGenerator: createMockGenerator(),
        frameExtractor: mockExtractor,
      });

      const tool = tools.find((t) => t.name === 'QualityCheck')!;
      const result = (await tool.execute({
        scenes: createVideoScenes(1),
        minScore: 60,
      })) as {
        success: boolean;
        data: {
          passed: number;
          evaluations: Array<{
            passed: boolean;
            finalScore: number;
            videoMetrics?: {
              duration: number;
              fps: number;
              width: number;
              height: number;
              framesSampled: number;
            };
            dimensions?: { videoQuality?: number };
          }>;
        };
      };

      expect(result.success).toBe(true);
      expect(result.data.passed).toBe(1);
      // Should have called probe and extractFrame
      expect(mockExtractor.probe).toHaveBeenCalledTimes(1);
      expect(mockExtractor.extractFrame).toHaveBeenCalled();
      // Should have videoMetrics
      const evaluation = result.data.evaluations[0]!;
      expect(evaluation.videoMetrics).toBeDefined();
      expect(evaluation.videoMetrics!.duration).toBe(5.0);
      expect(evaluation.videoMetrics!.fps).toBe(30);
      expect(evaluation.videoMetrics!.width).toBe(1920);
      expect(evaluation.videoMetrics!.height).toBe(1080);
      expect(evaluation.videoMetrics!.framesSampled).toBeGreaterThan(0);
      // Should have videoQuality dimension
      expect(evaluation.dimensions?.videoQuality).toBeDefined();
    });

    it('should send multiple frames as image parts to LLM', async () => {
      const mockExtractor = createMockFrameExtractor();
      const mockService = createMockService(createVideoPassingEvaluation());

      const tools = createQualityCheckTools({
        createService: () => mockService,
        mediaGenerator: createMockGenerator(),
        frameExtractor: mockExtractor,
      });

      const tool = tools.find((t) => t.name === 'QualityCheck')!;
      await tool.execute({
        scenes: createVideoScenes(1),
        minScore: 60,
      });

      // Verify the LLM call contains multiple image parts
      expect(mockService.chat).toHaveBeenCalledTimes(1);
      const chatCall = mockService.chat.mock.calls[0]!;
      const messages = chatCall[0] as Array<{ role: string; content: unknown }>;
      const userMsg = messages.find((m) => m.role === 'user');
      expect(userMsg).toBeDefined();

      const content = userMsg!.content as Array<{ type: string; text?: string; imageUrl?: string }>;
      // Should have 1 text part + N image parts
      const textParts = content.filter((p) => p.type === 'text');
      const imageParts = content.filter((p) => p.type === 'image');
      expect(textParts).toHaveLength(1);
      expect(imageParts.length).toBeGreaterThanOrEqual(2); // At least 2 frames
      // Text should mention video metadata
      expect(textParts[0]!.text).toContain('1920x1080');
      expect(textParts[0]!.text).toContain('30fps');
    });

    it('should route .mp4/.webm/.mov/.avi to VideoFrameEvaluator', async () => {
      const extensions = ['mp4', 'webm', 'mov', 'avi'];
      const mockExtractor = createMockFrameExtractor();
      const mockService = createMockService(createVideoPassingEvaluation());

      const tools = createQualityCheckTools({
        createService: () => mockService,
        mediaGenerator: createMockGenerator(),
        frameExtractor: mockExtractor,
      });

      const tool = tools.find((t) => t.name === 'QualityCheck')!;
      const scenes = extensions.map((ext, i) => ({
        index: i,
        mediaPath: `/tmp/video.${ext}`,
        prompt: 'Test video',
      }));

      await tool.execute({ scenes, minScore: 60 });

      // All should have used frame extractor
      expect(mockExtractor.probe).toHaveBeenCalledTimes(extensions.length);
    });

    it('should retain retry for video (unlike audio)', async () => {
      const mockExtractor = createMockFrameExtractor();
      let callCount = 0;
      const mockService = {
        chat: vi.fn().mockImplementation(() => {
          callCount++;
          if (callCount <= 1) {
            // Initial evaluation: fail
            return Promise.resolve({
              message: {
                content: JSON.stringify({
                  overallScore: 30,
                  dimensions: {
                    technicalQuality: 25,
                    promptAdherence: 40,
                    aesthetics: 30,
                    videoQuality: 20,
                  },
                  issues: [
                    { category: 'jitter', severity: 'major', description: 'Flickering frames' },
                  ],
                }),
              },
            });
          }
          if (callCount === 2) {
            // Prompt optimization
            return Promise.resolve({ message: { content: 'Improved prompt' } });
          }
          // Re-evaluation: pass
          return Promise.resolve({
            message: {
              content: JSON.stringify(createVideoPassingEvaluation({ overallScore: 80 })),
            },
          });
        }),
      };
      const mockGenerator = createMockGenerator();

      const tools = createQualityCheckTools({
        createService: () => mockService,
        mediaGenerator: mockGenerator,
        frameExtractor: mockExtractor,
      });

      const tool = tools.find((t) => t.name === 'QualityRepairCheck')!;
      const result = (await tool.execute({
        scenes: createVideoScenes(1),
        maxRetries: 2,
        minScore: 60,
      })) as {
        success: boolean;
        data: {
          passed: number;
          evaluations: Array<{ attempts: number; passed: boolean }>;
        };
      };

      // Should have retried (unlike audio)
      expect(mockGenerator.generate).toHaveBeenCalled();
      expect(result.data.evaluations[0]!.attempts).toBeGreaterThan(1);
      expect(result.data.evaluations[0]!.passed).toBe(true);
    });

    it('should fall back to VisionEvaluator if no frameExtractor provided', async () => {
      const mockService = createMockService(createPassingEvaluation());

      const tools = createQualityCheckTools({
        createService: () => mockService,
        mediaGenerator: createMockGenerator(),
        // No frameExtractor
      });

      const tool = tools.find((t) => t.name === 'QualityCheck')!;
      await tool.execute({
        scenes: createVideoScenes(1),
        maxRetries: 0,
        minScore: 60,
      });

      // Should have fallen back to LLM vision evaluator (single image mode)
      expect(mockService.chat).toHaveBeenCalled();
    });

    it('should handle probe failure gracefully', async () => {
      const mockExtractor = {
        extractFrame: vi.fn().mockResolvedValue('base64data'),
        probe: vi.fn().mockRejectedValue(new Error('Probe failed')),
      };

      const tools = createQualityCheckTools({
        createService: () => createMockService(createVideoPassingEvaluation()),
        mediaGenerator: createMockGenerator(),
        frameExtractor: mockExtractor,
      });

      const tool = tools.find((t) => t.name === 'QualityCheck')!;
      const result = (await tool.execute({
        scenes: createVideoScenes(1),
        maxRetries: 0,
        minScore: 60,
      })) as {
        success: boolean;
        data: {
          failed: number;
          evaluations: Array<{
            finalScore: number;
            issues: Array<{ category: string; severity: string }>;
          }>;
        };
      };

      expect(result.data.failed).toBe(1);
      expect(result.data.evaluations[0]!.finalScore).toBe(0);
      expect(result.data.evaluations[0]!.issues[0]!.severity).toBe('critical');
    });

    it('should handle frame extraction failure gracefully', async () => {
      const mockExtractor = createMockFrameExtractor({ extractFrame: null });

      const tools = createQualityCheckTools({
        createService: () => createMockService(createVideoPassingEvaluation()),
        mediaGenerator: createMockGenerator(),
        frameExtractor: mockExtractor,
      });

      const tool = tools.find((t) => t.name === 'QualityCheck')!;
      const result = (await tool.execute({
        scenes: createVideoScenes(1),
        maxRetries: 0,
        minScore: 60,
      })) as {
        success: boolean;
        data: {
          failed: number;
          evaluations: Array<{
            finalScore: number;
            issues: Array<{ description: string }>;
          }>;
        };
      };

      expect(result.data.failed).toBe(1);
      expect(result.data.evaluations[0]!.finalScore).toBe(0);
      expect(result.data.evaluations[0]!.issues[0]!.description).toContain('extract');
    });

    it('should detect video-specific issue categories (jitter, tearing, stuttering)', async () => {
      const mockExtractor = createMockFrameExtractor();
      const mockService = createMockService({
        overallScore: 40,
        dimensions: { technicalQuality: 30, promptAdherence: 50, aesthetics: 40, videoQuality: 25 },
        issues: [
          { category: 'jitter', severity: 'major', description: 'Flickering between frames' },
          { category: 'stuttering', severity: 'minor', description: 'Frame drops detected' },
        ],
      });

      const tools = createQualityCheckTools({
        createService: () => mockService,
        mediaGenerator: createMockGenerator(),
        frameExtractor: mockExtractor,
      });

      const tool = tools.find((t) => t.name === 'QualityCheck')!;
      const result = (await tool.execute({
        scenes: createVideoScenes(1),
        maxRetries: 0,
        minScore: 60,
      })) as {
        success: boolean;
        data: {
          evaluations: Array<{
            issues: Array<{ category: string; severity: string }>;
            remediations?: Array<{ type: string; toolName?: string }>;
          }>;
        };
      };

      const evaluation = result.data.evaluations[0]!;
      expect(evaluation.issues).toHaveLength(2);
      expect(evaluation.issues[0]!.category).toBe('jitter');
      expect(evaluation.issues[1]!.category).toBe('stuttering');
      // Jitter remediation should be stabilize effect
      expect(evaluation.remediations).toBeDefined();
      const jitterFix = evaluation.remediations!.find((r) => r.toolName === 'AddEffect');
      expect(jitterFix).toBeDefined();
      expect(jitterFix!.type).toBe('apply-effect');
    });
  });
});
