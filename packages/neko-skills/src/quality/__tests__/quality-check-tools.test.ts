import { describe, expect, it, vi } from 'vitest';
import {
  createLegacyConsistencyCheckTools as createConsistencyCheckTools,
  createLegacyQualityCheckTools as createQualityCheckTools,
} from '../quality-check-tools';

function createService(responseJson: unknown) {
  return {
    chat: vi.fn().mockResolvedValue({
      message: { content: JSON.stringify(responseJson) },
    }),
  };
}

function createGenerator() {
  return {
    generate: vi.fn().mockResolvedValue({ path: '/tmp/regenerated.png' }),
  };
}

const CHAT_MODEL = { providerId: 'deepseek-direct', modelId: 'deepseek-chat' } as const;

describe('quality check tool factories', () => {
  it('creates QualityCheck as a skills-owned read-only analysis tool', () => {
    const tools = createQualityCheckTools({
      createService: () => createService({ overallScore: 100, dimensions: {}, issues: [] }),
      mediaGenerator: createGenerator(),
      readFileAsBase64: vi.fn(),
      chatModel: CHAT_MODEL,
    });
    const tool = tools.find((candidate) => candidate.name === 'QualityCheck')!;

    expect(tool.name).toBe('QualityCheck');
    expect(tool.category).toBe('analysis');
    expect(tool.isReadOnly).toBe(true);
    expect(tool.parameters.required).toContain('scenes');
    expect(tool.parameters.properties).not.toHaveProperty('maxRetries');
    const sceneProperties = tool.parameters.properties['scenes']?.items?.properties;
    expect(sceneProperties).toHaveProperty('timeRange');
    expect(sceneProperties).toHaveProperty('start');
    expect(sceneProperties).toHaveProperty('end');
    expect(sceneProperties).toHaveProperty('duration');
  });

  it('owns Chinese localization metadata for quality tool schemas', () => {
    const qualityTools = createQualityCheckTools({
      createService: () => createService({ overallScore: 100, dimensions: {}, issues: [] }),
      mediaGenerator: createGenerator(),
      readFileAsBase64: vi.fn(),
      chatModel: CHAT_MODEL,
    });
    const consistencyTool = createConsistencyCheckTools({
      createService: () =>
        createService({ driftScore: 10, description: 'consistent', characterIssues: [] }),
      chatModel: CHAT_MODEL,
    })[0]!;
    const qualityTool = qualityTools.find((candidate) => candidate.name === 'QualityCheck')!;
    const repairTool = qualityTools.find((candidate) => candidate.name === 'QualityRepairCheck')!;

    expect(qualityTool.localization?.zh?.description).toContain('评估 AI 生成媒体质量');
    expect(qualityTool.localization?.zh?.parameters?.scenes).toContain('要评估的场景数组');
    expect(qualityTool.localization?.zh?.parameters?.['scenes.[].mediaPath']).toContain(
      '生成媒体文件路径',
    );
    expect(repairTool.localization?.zh?.description).toContain(
      '评估 AI 生成媒体质量并显式尝试修复',
    );
    expect(repairTool.localization?.zh?.parameters?.maxRetries).toContain('修复重试次数');
    expect(consistencyTool.localization?.zh?.description).toContain('跨场景视觉一致性');
    expect(consistencyTool.localization?.zh?.parameters?.characters).toContain(
      '要跟踪外观一致性的角色',
    );
  });

  it('creates QualityRepairCheck as an explicit non-read-only repair tool', () => {
    const tools = createQualityCheckTools({
      createService: () => createService({ overallScore: 100, dimensions: {}, issues: [] }),
      mediaGenerator: createGenerator(),
      readFileAsBase64: vi.fn(),
      chatModel: CHAT_MODEL,
    });
    const tool = tools.find((candidate) => candidate.name === 'QualityRepairCheck')!;

    expect(tool.category).toBe('generation');
    expect(tool.isReadOnly).toBe(false);
    expect(tool.requiresConfirmation).toBe(true);
    expect(tool.parameters.required).toContain('scenes');
    expect(tool.parameters.properties).toHaveProperty('maxRetries');
  });

  it('keeps QualityCheck before QualityRepairCheck for existing callers', () => {
    const tools = createQualityCheckTools({
      createService: () => createService({ overallScore: 100, dimensions: {}, issues: [] }),
      mediaGenerator: createGenerator(),
      readFileAsBase64: vi.fn(),
      chatModel: CHAT_MODEL,
    });

    expect(tools.map((tool) => tool.name)).toEqual(['QualityCheck', 'QualityRepairCheck']);
  });

  it('delegates QualityCheck execution to the media quality runtime', async () => {
    const service = createService({
      overallScore: 88,
      dimensions: {
        technicalQuality: 90,
        promptAdherence: 86,
        scriptAdherence: null,
        aesthetics: 88,
      },
      issues: [],
    });
    const generator = createGenerator();
    const readFileAsBase64 = vi.fn().mockResolvedValue('image-base64');
    const tool = createQualityCheckTools({
      createService: () => service,
      mediaGenerator: generator,
      readFileAsBase64,
      chatModel: CHAT_MODEL,
    }).find((candidate) => candidate.name === 'QualityCheck')!;

    const result = await tool.execute({
      scenes: [{ index: 0, mediaPath: '/tmp/scene.png', prompt: 'cinematic scene' }],
      minScore: 60,
    });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      totalScenes: 1,
      passed: 1,
      failed: 0,
    });
    expect(readFileAsBase64).toHaveBeenCalledWith('/tmp/scene.png');
    expect(service.chat).toHaveBeenCalled();
    expect(service.chat).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        providerId: 'deepseek-direct',
        modelId: 'deepseek-chat',
      }),
    );
    expect(generator.generate).not.toHaveBeenCalled();
  });

  it('uses Chinese prompt wrappers for localized QualityCheck model calls', async () => {
    const service = createService({
      overallScore: 88,
      dimensions: {
        technicalQuality: 90,
        promptAdherence: 86,
        scriptAdherence: null,
        aesthetics: 88,
      },
      issues: [],
    });
    const tool = createQualityCheckTools({
      createService: () => service,
      mediaGenerator: createGenerator(),
      readFileAsBase64: vi.fn().mockResolvedValue('image-base64'),
      chatModel: CHAT_MODEL,
      locale: 'zh-CN',
    }).find((candidate) => candidate.name === 'QualityCheck')!;

    await tool.execute({
      scenes: [
        {
          index: 0,
          mediaPath: '/tmp/scene.png',
          prompt: 'cinematic scene',
          description: 'hero enters the city',
        },
      ],
      style: 'cinematic',
      sceneDialogue: ['hello'],
    });

    const messages = service.chat.mock.calls[0]![0] as Array<{
      role: string;
      content: string | Array<{ type: string; text?: string }>;
    }>;
    expect(messages[0]!.content).toContain('视觉质量评估器');
    expect(messages[0]!.content).not.toContain('You are a visual quality evaluator');
    const userText = (messages[1]!.content as Array<{ type: string; text?: string }>)[0]!.text!;
    expect(userText).toContain('原始提示词');
    expect(userText).toContain('场景描述');
    expect(userText).toContain('全局风格');
    expect(userText).toContain('对白');
    expect(userText).not.toContain('Original prompt');
  });

  it('uses Chinese prompt wrappers for localized QualityRepairCheck prompt optimization', async () => {
    let callCount = 0;
    const service = {
      chat: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            message: {
              content: JSON.stringify({
                overallScore: 20,
                dimensions: { technicalQuality: 20, promptAdherence: 30, aesthetics: 20 },
                issues: [{ category: 'artifact', severity: 'major', description: 'blurry image' }],
              }),
            },
          });
        }
        if (callCount === 2) {
          return Promise.resolve({ message: { content: 'Sharper prompt' } });
        }
        return Promise.resolve({
          message: {
            content: JSON.stringify({
              overallScore: 90,
              dimensions: { technicalQuality: 90, promptAdherence: 90, aesthetics: 90 },
              issues: [],
            }),
          },
        });
      }),
    };
    const tool = createQualityCheckTools({
      createService: () => service,
      mediaGenerator: createGenerator(),
      readFileAsBase64: vi.fn().mockResolvedValue('image-base64'),
      chatModel: CHAT_MODEL,
      locale: 'zh-CN',
    }).find((candidate) => candidate.name === 'QualityRepairCheck')!;

    await tool.execute({
      scenes: [{ index: 0, mediaPath: '/tmp/scene.png', prompt: 'cinematic scene' }],
      maxRetries: 1,
      minScore: 60,
    });

    const messages = service.chat.mock.calls[1]![0] as Array<{ role: string; content: string }>;
    expect(messages[0]!.content).toContain('提示词工程师');
    expect(messages[0]!.content).not.toContain(
      'You are an AI image/video generation prompt engineer',
    );
    expect(messages[1]!.content).toContain('原始提示词');
    expect(messages[1]!.content).toContain('发现的问题');
    expect(messages[1]!.content).not.toContain('Original prompt');
  });

  it('uses Chinese prompt wrappers for localized video quality model calls', async () => {
    const service = createService({
      overallScore: 90,
      dimensions: {
        technicalQuality: 90,
        promptAdherence: 90,
        scriptAdherence: null,
        aesthetics: 90,
        videoQuality: 90,
      },
      issues: [],
    });
    const frameExtractor = {
      probe: vi.fn().mockResolvedValue({ duration: 4, fps: 24, width: 1280, height: 720 }),
      extractFrame: vi.fn().mockResolvedValue('frame-base64'),
    };
    const tool = createQualityCheckTools({
      createService: () => service,
      mediaGenerator: createGenerator(),
      readFileAsBase64: vi.fn().mockResolvedValue('unused'),
      frameExtractor,
      chatModel: CHAT_MODEL,
      locale: 'zh-CN',
    }).find((candidate) => candidate.name === 'QualityCheck')!;

    await tool.execute({
      scenes: [
        {
          index: 0,
          mediaPath: '/tmp/scene.mp4',
          prompt: 'cinematic video',
          description: 'camera moves forward',
        },
      ],
      style: 'cinematic',
    });

    const messages = service.chat.mock.calls[0]![0] as Array<{
      role: string;
      content: string | Array<{ type: string; text?: string }>;
    }>;
    expect(messages[0]!.content).toContain('生成视频的质量评估器');
    expect(messages[0]!.content).not.toContain('You are a video quality evaluator');
    const userText = (messages[1]!.content as Array<{ type: string; text?: string }>)[0]!.text!;
    expect(userText).toContain('原始提示词');
    expect(userText).toContain('视频元数据');
    expect(userText).toContain('采样帧');
    expect(userText).not.toContain('Original prompt');
  });

  it('does not generate media from read-only QualityCheck even when maxRetries is provided', async () => {
    const service = createService({
      overallScore: 20,
      dimensions: {
        technicalQuality: 20,
        promptAdherence: 30,
        scriptAdherence: null,
        aesthetics: 20,
      },
      issues: [{ category: 'artifact', severity: 'major', description: 'blurry image' }],
    });
    const generator = createGenerator();
    const tool = createQualityCheckTools({
      createService: () => service,
      mediaGenerator: generator,
      readFileAsBase64: vi.fn().mockResolvedValue('image-base64'),
      chatModel: CHAT_MODEL,
    }).find((candidate) => candidate.name === 'QualityCheck')!;

    const result = await tool.execute({
      scenes: [{ index: 0, mediaPath: '/tmp/scene.png', prompt: 'cinematic scene' }],
      maxRetries: 2,
      minScore: 60,
    });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      totalScenes: 1,
      passed: 0,
      failed: 1,
      evaluations: [{ attempts: 1, finalPath: '/tmp/scene.png' }],
    });
    expect(generator.generate).not.toHaveBeenCalled();
  });

  it('allows explicit QualityRepairCheck to invoke generation retries', async () => {
    let callCount = 0;
    const service = {
      chat: vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            message: {
              content: JSON.stringify({
                overallScore: 20,
                dimensions: { technicalQuality: 20, promptAdherence: 30, aesthetics: 20 },
                issues: [{ category: 'artifact', severity: 'major', description: 'blurry image' }],
              }),
            },
          });
        }
        if (callCount === 2) {
          return Promise.resolve({ message: { content: 'Sharper prompt' } });
        }
        return Promise.resolve({
          message: {
            content: JSON.stringify({
              overallScore: 90,
              dimensions: { technicalQuality: 90, promptAdherence: 90, aesthetics: 90 },
              issues: [],
            }),
          },
        });
      }),
    };
    const generator = createGenerator();
    const tool = createQualityCheckTools({
      createService: () => service,
      mediaGenerator: generator,
      readFileAsBase64: vi.fn().mockResolvedValue('image-base64'),
      chatModel: CHAT_MODEL,
    }).find((candidate) => candidate.name === 'QualityRepairCheck')!;

    const result = await tool.execute({
      scenes: [{ index: 0, mediaPath: '/tmp/scene.png', prompt: 'cinematic scene' }],
      maxRetries: 1,
      minScore: 60,
    });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      passed: 1,
      failed: 0,
      evaluations: [{ attempts: 2, finalPath: '/tmp/regenerated.png' }],
    });
    expect(generator.generate).toHaveBeenCalledTimes(1);
  });

  it('preserves issue locations returned by quality evaluators', async () => {
    const service = createService({
      overallScore: 30,
      dimensions: { technicalQuality: 30, promptAdherence: 40, aesthetics: 30 },
      issues: [
        {
          category: 'tearing',
          severity: 'major',
          description: 'tear in the middle of the clip',
          location: { timeRange: { start: 1, end: 2 } },
        },
      ],
    });
    const tool = createQualityCheckTools({
      createService: () => service,
      mediaGenerator: createGenerator(),
      readFileAsBase64: vi.fn().mockResolvedValue('image-base64'),
      chatModel: CHAT_MODEL,
    }).find((candidate) => candidate.name === 'QualityCheck')!;

    const result = await tool.execute({
      scenes: [{ index: 0, mediaPath: '/tmp/scene.png', prompt: 'cinematic scene' }],
      minScore: 60,
    });

    expect(result.data).toMatchObject({
      evaluations: [
        {
          issues: [
            {
              location: { timeRange: { start: 1, end: 2 } },
            },
          ],
        },
      ],
    });
  });

  it('filters invalid QualityCheck scene arguments before runtime execution', async () => {
    const service = createService({ overallScore: 100, dimensions: {}, issues: [] });
    const readFileAsBase64 = vi.fn();
    const tool = createQualityCheckTools({
      createService: () => service,
      mediaGenerator: createGenerator(),
      readFileAsBase64,
      chatModel: CHAT_MODEL,
    }).find((candidate) => candidate.name === 'QualityCheck')!;

    const result = await tool.execute({
      scenes: [{ index: 0, prompt: 'missing media path' }, null, 'invalid'],
    });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      totalScenes: 0,
      passed: 0,
      failed: 0,
    });
    expect(readFileAsBase64).not.toHaveBeenCalled();
  });

  it('creates QualityCheckConsistency as a skills-owned read-only analysis tool', () => {
    const tool = createConsistencyCheckTools({
      createService: () =>
        createService({ driftScore: 10, description: 'consistent', characterIssues: [] }),
      chatModel: CHAT_MODEL,
    })[0]!;

    expect(tool.name).toBe('QualityCheckConsistency');
    expect(tool.category).toBe('analysis');
    expect(tool.isReadOnly).toBe(true);
    expect(tool.parameters.required).toContain('scenes');
  });

  it('delegates QualityCheckConsistency execution to the consistency evaluator', async () => {
    const service = createService({
      driftScore: 12,
      description: 'minor lighting drift',
      characterIssues: [],
    });
    const tool = createConsistencyCheckTools({
      createService: () => service,
      chatModel: CHAT_MODEL,
    })[0]!;

    const result = await tool.execute({
      scenes: [
        { sceneIndex: 0, mediaPath: '/tmp/a.png', prompt: 'scene a' },
        { sceneIndex: 1, mediaPath: '/tmp/b.png', prompt: 'scene b' },
      ],
      globalStyle: 'cinematic',
    });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      overallConsistency: 88,
      aestheticScore: 70,
    });
    expect(service.chat).toHaveBeenCalled();
    expect(service.chat).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        providerId: 'deepseek-direct',
        modelId: 'deepseek-chat',
      }),
    );
  });

  it('fails visibly when QualityCheck executes without an explicit chat model', async () => {
    const service = createService({ overallScore: 100, dimensions: {}, issues: [] });
    const tool = createQualityCheckTools({
      createService: () => service,
      mediaGenerator: createGenerator(),
      readFileAsBase64: vi.fn().mockResolvedValue('image-base64'),
    }).find((candidate) => candidate.name === 'QualityCheck')!;

    await expect(
      tool.execute({
        scenes: [{ index: 0, mediaPath: '/tmp/scene.png', prompt: 'cinematic scene' }],
      }),
    ).rejects.toThrow(
      'Media quality LLM evaluation requires an explicit chat providerId and modelId.',
    );
    expect(service.chat).not.toHaveBeenCalled();
  });
});
