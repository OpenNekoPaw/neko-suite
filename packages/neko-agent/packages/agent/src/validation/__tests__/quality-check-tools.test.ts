import { describe, expect, it, vi } from 'vitest';
import { createConsistencyCheckTools, createQualityCheckTools } from '../quality-check-tools';

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

describe('quality check tool factories', () => {
  it('creates QualityCheck as an agent-owned read-only analysis tool', () => {
    const tools = createQualityCheckTools({
      createService: () => createService({ overallScore: 100, dimensions: {}, issues: [] }),
      mediaGenerator: createGenerator(),
      readFileAsBase64: vi.fn(),
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

  it('creates QualityRepairCheck as an explicit non-read-only repair tool', () => {
    const tools = createQualityCheckTools({
      createService: () => createService({ overallScore: 100, dimensions: {}, issues: [] }),
      mediaGenerator: createGenerator(),
      readFileAsBase64: vi.fn(),
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
    expect(generator.generate).not.toHaveBeenCalled();
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

  it('creates QualityCheckConsistency as an agent-owned read-only analysis tool', () => {
    const tool = createConsistencyCheckTools({
      createService: () =>
        createService({ driftScore: 10, description: 'consistent', characterIssues: [] }),
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
  });
});
