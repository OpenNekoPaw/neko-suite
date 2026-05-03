import { describe, expect, it, vi } from 'vitest';
import { createPuppetFaceTools, type PuppetFaceToolsDeps } from '../puppet-face-tools';

function createDeps(overrides: Partial<PuppetFaceToolsDeps> = {}): PuppetFaceToolsDeps {
  return {
    generateWithLLM: vi.fn().mockResolvedValue('{"faceWidth": 0.5, "eyeSize": 0.8}'),
    readImagePayload: vi.fn().mockResolvedValue({ imageBase64: 'abc123', mimeType: 'image/png' }),
    getCurrentFaceParams: vi.fn().mockResolvedValue({ faceWidth: 0.1, eyeSize: 0.2 }),
    applyFaceParams: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('puppet face tool factory', () => {
  it('creates agent-owned puppet face tools with shared tool metadata', () => {
    const tools = createPuppetFaceTools(createDeps());

    expect(tools.map((tool) => tool.name)).toEqual([
      'PuppetGenerateParams',
      'PuppetFromImage',
      'PuppetAdjust',
    ]);
    for (const tool of tools) {
      expect(tool.category).toBe('generation');
      expect(tool.isReadOnly).toBe(false);
      expect(tool.isConcurrencySafe).toBe(false);
    }
  });

  it('generates params and skips host apply when apply is false', async () => {
    const deps = createDeps();
    const tool = createPuppetFaceTools(deps).find((item) => item.name === 'PuppetGenerateParams')!;

    const result = await tool.execute({ description: 'round face', apply: false });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      description: 'round face',
      modifiedCount: 2,
      applied: false,
    });
    expect(deps.applyFaceParams).not.toHaveBeenCalled();
  });

  it('applies generated params through the injected host adapter by default', async () => {
    const deps = createDeps();
    const tool = createPuppetFaceTools(deps).find((item) => item.name === 'PuppetGenerateParams')!;

    const result = await tool.execute({ description: 'big eyes' });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ applied: true });
    expect(deps.applyFaceParams).toHaveBeenCalledWith(expect.objectContaining({ eyeSize: 0.8 }));
  });

  it('reads image payload through the injected host adapter', async () => {
    const deps = createDeps({
      generateWithLLM: vi.fn().mockResolvedValue('{"chinSharpness": -0.2}'),
    });
    const tool = createPuppetFaceTools(deps).find((item) => item.name === 'PuppetFromImage')!;

    const result = await tool.execute({ imagePath: '/tmp/ref.png', apply: false });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      imagePath: '/tmp/ref.png',
      modifiedCount: 1,
      applied: false,
    });
    expect(deps.readImagePayload).toHaveBeenCalledWith('/tmp/ref.png');
  });

  it('adjusts current params using injected current-state and apply adapters', async () => {
    const deps = createDeps({
      generateWithLLM: vi.fn().mockResolvedValue('{"faceWidth": 0.1, "eyeSize": 0.9}'),
    });
    const tool = createPuppetFaceTools(deps).find((item) => item.name === 'PuppetAdjust')!;

    const result = await tool.execute({ instruction: 'make eyes bigger' });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      instruction: 'make eyes bigger',
      changedCount: 1,
      applied: true,
    });
    expect(deps.getCurrentFaceParams).toHaveBeenCalled();
    expect(deps.applyFaceParams).toHaveBeenCalledWith({ faceWidth: 0.1, eyeSize: 0.9 });
  });

  it('returns params with the tool error when host apply fails', async () => {
    const deps = createDeps({
      applyFaceParams: vi.fn().mockRejectedValue(new Error('puppet inactive')),
    });
    const tool = createPuppetFaceTools(deps).find((item) => item.name === 'PuppetGenerateParams')!;

    const result = await tool.execute({ description: 'round face' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('puppet inactive');
    expect(result.data).toMatchObject({
      params: expect.objectContaining({ faceWidth: 0.5 }),
    });
  });
});
