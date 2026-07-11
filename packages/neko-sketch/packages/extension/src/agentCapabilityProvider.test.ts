import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AgentCapabilityContext,
  ICapabilityMediaService,
  NekoSketchAPI,
  SketchAIContextSnapshot,
  SketchSelectionData,
} from '@neko/shared';
import { TOOL_NAMES_SKETCH } from '@neko/shared';
import { createNekoSketchCapabilityProvider } from './agentCapabilityProvider';

const configValues = vi.hoisted(() => new Map<string, boolean>());

vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: () => ({
      get: (key: string, defaultValue: boolean) =>
        configValues.has(key) ? configValues.get(key) : defaultValue,
    }),
  },
}));

describe('NekoSketch capability provider AI kill switches', () => {
  beforeEach(() => {
    configValues.clear();
  });

  it('does not register AI tools when the total AI switch is disabled', () => {
    const provider = createNekoSketchCapabilityProvider(createApi());

    expect(provider.getTools(createContext())).toEqual([]);
    expect(provider.getToolGroups?.()[0]?.enabled).toBe(false);
  });

  it('registers sketch AI tools when the total AI switch is enabled', () => {
    configValues.set('aiOps.enabled', true);
    const provider = createNekoSketchCapabilityProvider(createApi());

    expect(provider.getTools(createContext()).map((tool) => tool.name)).toEqual([
      TOOL_NAMES_SKETCH.SKETCH_GENERATE,
      TOOL_NAMES_SKETCH.SKETCH_SMART_SELECTION,
      TOOL_NAMES_SKETCH.SKETCH_INPAINT,
      TOOL_NAMES_SKETCH.SKETCH_STYLE_TRANSFER,
      TOOL_NAMES_SKETCH.SKETCH_UPSCALE,
      TOOL_NAMES_SKETCH.SKETCH_LINEART_COLORIZE,
      TOOL_NAMES_SKETCH.SKETCH_AUTO_LAYER,
    ]);
    expect(provider.getToolGroups?.()[0]?.enabled).toBe(true);
  });

  it('filters disabled sketch AI sub-features', () => {
    configValues.set('aiOps.enabled', true);
    configValues.set('aiOps.inpaint.enabled', false);
    const provider = createNekoSketchCapabilityProvider(createApi());

    expect(provider.getTools(createContext()).map((tool) => tool.name)).toEqual([
      TOOL_NAMES_SKETCH.SKETCH_GENERATE,
      TOOL_NAMES_SKETCH.SKETCH_SMART_SELECTION,
      TOOL_NAMES_SKETCH.SKETCH_STYLE_TRANSFER,
      TOOL_NAMES_SKETCH.SKETCH_UPSCALE,
      TOOL_NAMES_SKETCH.SKETCH_LINEART_COLORIZE,
      TOOL_NAMES_SKETCH.SKETCH_AUTO_LAYER,
    ]);
  });

  it('filters disabled smart selection separately from other AI tools', () => {
    configValues.set('aiOps.enabled', true);
    configValues.set('aiOps.smartSelection.enabled', false);
    const provider = createNekoSketchCapabilityProvider(createApi());

    expect(provider.getTools(createContext()).map((tool) => tool.name)).toEqual([
      TOOL_NAMES_SKETCH.SKETCH_GENERATE,
      TOOL_NAMES_SKETCH.SKETCH_INPAINT,
      TOOL_NAMES_SKETCH.SKETCH_STYLE_TRANSFER,
      TOOL_NAMES_SKETCH.SKETCH_UPSCALE,
      TOOL_NAMES_SKETCH.SKETCH_LINEART_COLORIZE,
      TOOL_NAMES_SKETCH.SKETCH_AUTO_LAYER,
    ]);
  });

  it('filters disabled upscale separately from other AI tools', () => {
    configValues.set('aiOps.enabled', true);
    configValues.set('aiOps.upscale.enabled', false);
    const provider = createNekoSketchCapabilityProvider(createApi());

    expect(provider.getTools(createContext()).map((tool) => tool.name)).toEqual([
      TOOL_NAMES_SKETCH.SKETCH_GENERATE,
      TOOL_NAMES_SKETCH.SKETCH_SMART_SELECTION,
      TOOL_NAMES_SKETCH.SKETCH_INPAINT,
      TOOL_NAMES_SKETCH.SKETCH_STYLE_TRANSFER,
      TOOL_NAMES_SKETCH.SKETCH_LINEART_COLORIZE,
      TOOL_NAMES_SKETCH.SKETCH_AUTO_LAYER,
    ]);
  });

  it('filters disabled line art colorize separately from other AI tools', () => {
    configValues.set('aiOps.enabled', true);
    configValues.set('aiOps.lineartColorize.enabled', false);
    const provider = createNekoSketchCapabilityProvider(createApi());

    expect(provider.getTools(createContext()).map((tool) => tool.name)).toEqual([
      TOOL_NAMES_SKETCH.SKETCH_GENERATE,
      TOOL_NAMES_SKETCH.SKETCH_SMART_SELECTION,
      TOOL_NAMES_SKETCH.SKETCH_INPAINT,
      TOOL_NAMES_SKETCH.SKETCH_STYLE_TRANSFER,
      TOOL_NAMES_SKETCH.SKETCH_UPSCALE,
      TOOL_NAMES_SKETCH.SKETCH_AUTO_LAYER,
    ]);
  });

  it('applies generated images through the AI result protocol', async () => {
    configValues.set('aiOps.enabled', true);
    const applyAIImageResult = vi.fn(async () => true);
    const api = createApi({ applyAIImageResult });
    const media = createMediaService({
      outputs: [{ url: 'https://example.test/generated.png', mimeType: 'image/png' }],
    });
    const provider = createNekoSketchCapabilityProvider(api);
    const generateTool = provider
      .getTools(createContext(media))
      .find((tool) => tool.name === TOOL_NAMES_SKETCH.SKETCH_GENERATE);

    const result = await generateTool?.execute({ prompt: 'cat', size: '512x512' });

    expect(result?.success).toBe(true);
    expect(applyAIImageResult).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'task-1',
        operation: 'generate',
        sourceUrl: 'https://example.test/generated.png',
        target: 'layer',
        name: 'AI-cat',
        width: 512,
        height: 512,
      }),
    );
  });

  it('registers media task cancellation while a generation task is running', async () => {
    configValues.set('aiOps.enabled', true);
    const applyAIImageResult = vi.fn(async () => true);
    const registerAIRun = vi.fn((_runId: string, _cancel: () => Promise<void>) => {});
    const unregisterAIRun = vi.fn((_runId: string) => {});
    const reportAIProgress = vi.fn(async () => true);
    const cancelTask = vi.fn(async (_taskId: string) => true);
    const completed = createDeferred<Awaited<ReturnType<ICapabilityMediaService['waitForTask']>>>();
    const api = createApi({ applyAIImageResult, reportAIProgress, registerAIRun, unregisterAIRun });
    const media = createMediaService();
    media.cancelTask = cancelTask;
    media.waitForTask = vi.fn(async () => completed.promise);
    const provider = createNekoSketchCapabilityProvider(api);
    const generateTool = provider
      .getTools(createContext(media))
      .find((tool) => tool.name === TOOL_NAMES_SKETCH.SKETCH_GENERATE);

    const execution = generateTool?.execute({ prompt: 'cat', size: '512x512' });
    await flushPromises();

    expect(registerAIRun).toHaveBeenCalledWith('task-1', expect.any(Function));
    expect(reportAIProgress).toHaveBeenCalledWith({
      runId: 'task-1',
      operation: 'generate',
      percent: 10,
      stage: 'Generating image',
    });
    const cancel = registerAIRun.mock.calls[0]?.[1];
    if (!cancel) {
      throw new Error('Expected a registered cancellation callback');
    }

    await cancel();
    expect(cancelTask).toHaveBeenCalledWith('task-1');
    expect(unregisterAIRun).not.toHaveBeenCalled();

    completed.resolve({
      status: 'completed',
      outputs: [{ url: 'https://example.test/generated.png', mimeType: 'image/png' }],
    });
    const result = await execution;

    expect(result?.success).toBe(true);
    expect(unregisterAIRun).toHaveBeenCalledWith('task-1');
  });

  it('does not start generation when no sketch editor is active', async () => {
    configValues.set('aiOps.enabled', true);
    const media = createMediaService();
    const provider = createNekoSketchCapabilityProvider(createApi({ active: false }));
    const generateTool = provider
      .getTools(createContext(media))
      .find((tool) => tool.name === TOOL_NAMES_SKETCH.SKETCH_GENERATE);

    const result = await generateTool?.execute({ prompt: 'cat' });

    expect(result?.success).toBe(false);
    expect(media.generateImage).not.toHaveBeenCalled();
  });

  it('applies smart selection outputs as selection masks', async () => {
    configValues.set('aiOps.enabled', true);
    const applyAIImageResult = vi.fn(async () => true);
    const api = createApi({
      applyAIImageResult,
      canvasImageData: 'canvas-base64',
    });
    const media = createMediaService({
      outputs: [{ url: 'https://example.test/mask.png', mimeType: 'image/png' }],
    });
    const provider = createNekoSketchCapabilityProvider(api);
    const selectionTool = provider
      .getTools(createContext(media))
      .find((tool) => tool.name === TOOL_NAMES_SKETCH.SKETCH_SMART_SELECTION);

    const result = await selectionTool?.execute({
      prompt: 'main character',
      negativePrompt: 'background',
    });

    expect(result?.success).toBe(true);
    expect(media.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceImageBase64: 'canvas-base64',
        negativePrompt: 'background',
        outputKind: 'selection-mask',
      }),
    );
    expect(applyAIImageResult).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'task-1',
        operation: 'smart-selection',
        sourceUrl: 'https://example.test/mask.png',
        target: 'selection',
        name: 'smart-selection-mask',
      }),
    );
  });

  it('prefers context snapshot fileUri inputs when available', async () => {
    configValues.set('aiOps.enabled', true);
    const cleanupAIArtifacts = vi.fn(async () => {});
    const snapshot: SketchAIContextSnapshot = {
      runId: 'ctx-1',
      operation: 'smart-selection',
      scope: 'canvas',
      compositeImage: {
        kind: 'fileUri',
        ref: 'file:///tmp/composite.png',
        mimeType: 'image/png',
      },
    };
    const media = createMediaService({
      outputs: [{ url: 'https://example.test/mask.png', mimeType: 'image/png' }],
    });
    const provider = createNekoSketchCapabilityProvider(
      createApi({ contextSnapshot: snapshot, cleanupAIArtifacts }),
    );
    const selectionTool = provider
      .getTools(createContext(media))
      .find((tool) => tool.name === TOOL_NAMES_SKETCH.SKETCH_SMART_SELECTION);

    const result = await selectionTool?.execute({ prompt: 'main character' });

    expect(result?.success).toBe(true);
    expect(media.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceImageUri: 'file:///tmp/composite.png',
      }),
    );
    expect(cleanupAIArtifacts).toHaveBeenCalledWith('ctx-1');
  });

  it('passes inpaint masks and applies outputs at the selection offset', async () => {
    configValues.set('aiOps.enabled', true);
    const applyAIImageResult = vi.fn(async () => true);
    const selection: SketchSelectionData = {
      x: 12,
      y: 24,
      width: 128,
      height: 64,
      mask: 'mask-base64',
      layerImageData: 'source-base64',
    };
    const api = createApi({ applyAIImageResult, selection });
    const media = createMediaService({
      outputs: [{ url: 'https://example.test/inpaint.png', mimeType: 'image/png' }],
    });
    const provider = createNekoSketchCapabilityProvider(api);
    const inpaintTool = provider
      .getTools(createContext(media))
      .find((tool) => tool.name === TOOL_NAMES_SKETCH.SKETCH_INPAINT);

    const result = await inpaintTool?.execute({
      prompt: 'add flowers',
      negativePrompt: 'text',
      strength: 0.6,
      layerName: 'Flowers',
    });

    expect(result?.success).toBe(true);
    expect(media.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'add flowers',
        negativePrompt: 'text',
        referenceImageBase64: 'source-base64',
        maskBase64: 'mask-base64',
        inpaintStrength: 0.6,
        width: 128,
        height: 64,
      }),
    );
    expect(applyAIImageResult).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'inpaint',
        target: 'layer',
        name: 'Flowers',
        offsetX: 12,
        offsetY: 24,
      }),
    );
  });

  it('applies upscale outputs as new layers', async () => {
    configValues.set('aiOps.enabled', true);
    const applyAIImageResult = vi.fn(async () => true);
    const api = createApi({
      applyAIImageResult,
      layerImageData: 'layer-base64',
    });
    const media = createMediaService({
      outputs: [{ url: 'https://example.test/upscale.png', mimeType: 'image/png' }],
    });
    const provider = createNekoSketchCapabilityProvider(api);
    const upscaleTool = provider
      .getTools(createContext(media))
      .find((tool) => tool.name === TOOL_NAMES_SKETCH.SKETCH_UPSCALE);

    const result = await upscaleTool?.execute({
      scale: 4,
      scope: 'layer',
      prompt: 'clean line art',
      layerName: 'Upscaled Lines',
    });

    expect(result?.success).toBe(true);
    expect(media.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceImageBase64: 'layer-base64',
        operation: 'upscale',
        scale: 4,
      }),
    );
    expect(applyAIImageResult).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'task-1',
        operation: 'upscale',
        sourceUrl: 'https://example.test/upscale.png',
        target: 'layer',
        name: 'Upscaled Lines',
      }),
    );
  });

  it('applies line art colorize outputs as new color layers', async () => {
    configValues.set('aiOps.enabled', true);
    const applyAIImageResult = vi.fn(async () => true);
    const api = createApi({
      applyAIImageResult,
      layerImageData: 'lineart-base64',
    });
    const media = createMediaService({
      outputs: [{ url: 'https://example.test/color.png', mimeType: 'image/png' }],
    });
    const provider = createNekoSketchCapabilityProvider(api);
    const colorizeTool = provider
      .getTools(createContext(media))
      .find((tool) => tool.name === TOOL_NAMES_SKETCH.SKETCH_LINEART_COLORIZE);

    const result = await colorizeTool?.execute({
      prompt: 'warm evening colors',
      palette: ['#f43f5e', '#facc15'],
      scope: 'layer',
      layerName: 'Flats',
    });

    expect(result?.success).toBe(true);
    expect(media.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceImageBase64: 'lineart-base64',
        operation: 'lineart-colorize',
        palette: ['#f43f5e', '#facc15'],
      }),
    );
    expect(applyAIImageResult).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: 'task-1',
        operation: 'lineart-colorize',
        sourceUrl: 'https://example.test/color.png',
        target: 'layer',
        name: 'Flats',
      }),
    );
  });

  it('applies auto-layer outputs with layer-specific blend modes', async () => {
    configValues.set('aiOps.enabled', true);
    const applyAIImageResult = vi.fn(async () => true);
    const api = createApi({
      applyAIImageResult,
      canvasImageData: 'canvas-base64',
    });
    const media = createMediaService({
      outputByTaskId: {
        'task-1': [{ url: 'https://example.test/shadow.png', mimeType: 'image/png' }],
        'task-2': [{ url: 'https://example.test/highlight.png', mimeType: 'image/png' }],
      },
    });
    const provider = createNekoSketchCapabilityProvider(api);
    const autoLayerTool = provider
      .getTools(createContext(media))
      .find((tool) => tool.name === TOOL_NAMES_SKETCH.SKETCH_AUTO_LAYER);

    const result = await autoLayerTool?.execute({ layers: ['shadow', 'highlight'] });

    expect(result?.success).toBe(true);
    expect(media.generateImage).toHaveBeenCalledTimes(2);
    expect(applyAIImageResult).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        runId: 'task-1',
        operation: 'auto-layer',
        name: 'shadow',
        blendMode: 'multiply',
      }),
    );
    expect(applyAIImageResult).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        runId: 'task-2',
        operation: 'auto-layer',
        name: 'highlight',
        blendMode: 'screen',
      }),
    );
  });
});

function createApi(
  overrides: {
    readonly active?: boolean;
    readonly applyAIImageResult?: NekoSketchAPI['applyAIImageResult'];
    readonly canvasImageData?: string | null;
    readonly layerImageData?: string | null;
    readonly selection?: SketchSelectionData | null;
    readonly contextSnapshot?: SketchAIContextSnapshot | null;
    readonly cleanupAIArtifacts?: NekoSketchAPI['cleanupAIArtifacts'];
    readonly reportAIProgress?: NekoSketchAPI['reportAIProgress'];
    readonly registerAIRun?: NekoSketchAPI['registerAIRun'];
    readonly unregisterAIRun?: NekoSketchAPI['unregisterAIRun'];
  } = {},
): NekoSketchAPI {
  return {
    projectQuality: createProjectQualityFacadeStub(),
    importImageData: () => {},
    applyAIImageResult: overrides.applyAIImageResult ?? (async () => true),
    createAIContextSnapshot: async () => overrides.contextSnapshot ?? null,
    cleanupAIArtifacts: overrides.cleanupAIArtifacts,
    reportAIProgress: overrides.reportAIProgress,
    registerAIRun: overrides.registerAIRun,
    unregisterAIRun: overrides.unregisterAIRun,
    importImageWithContext: () => {},
    exportCanvas: async () => null,
    isActive: () => overrides.active ?? true,
    getCanvasImageData: async () => overrides.canvasImageData ?? null,
    getLayerImageData: async () => overrides.layerImageData ?? null,
    getSelectionMask: async () => overrides.selection ?? null,
  };
}

function createProjectQualityFacadeStub(): NekoSketchAPI['projectQuality'] {
  const notExpected = async (): Promise<never> => {
    throw new Error('ProjectQuality facade is not expected in capability provider tests.');
  };
  return {
    validateProject: notExpected,
    getProjectSnapshot: notExpected,
    renderPreview: notExpected,
    probeRuntime: notExpected,
    checkExportReadiness: notExpected,
  };
}

function createContext(
  mediaService: ICapabilityMediaService = createMediaService(),
): AgentCapabilityContext {
  return {
    mediaService,
  } as unknown as AgentCapabilityContext;
}

function createMediaService(
  completed: {
    readonly outputs?: Array<{ readonly url: string; readonly mimeType?: string }>;
    readonly outputByTaskId?: Record<
      string,
      Array<{ readonly url: string; readonly mimeType?: string }>
    >;
  } = {},
): ICapabilityMediaService {
  let taskIndex = 0;
  return {
    generateImage: vi.fn(async () => {
      taskIndex += 1;
      return { id: `task-${taskIndex}` };
    }),
    generateVideo: vi.fn(async () => ({ id: 'video-task-1' })),
    waitForTask: vi.fn(async (taskId: string) => ({
      status: 'completed',
      outputs: completed.outputByTaskId?.[taskId] ?? completed.outputs ?? [],
    })),
  };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

function createDeferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (reason?: unknown) => void;
} {
  let resolveFn = (_value: T) => {};
  let rejectFn = (_reason?: unknown) => {};
  const promise = new Promise<T>((resolve, reject) => {
    resolveFn = resolve;
    rejectFn = reject;
  });
  return { promise, resolve: resolveFn, reject: rejectFn };
}
