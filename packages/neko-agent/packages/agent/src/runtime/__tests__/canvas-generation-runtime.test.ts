import { describe, expect, it, vi } from 'vitest';
import {
  CanvasGenerationRuntime,
  buildCanvasMediaOutputDataUrl,
  buildCanvasImageGenerationRequest,
  buildCanvasShotPromptMessages,
  buildCanvasShotPromptUserContent,
  convertCanvasFileUrlToPath,
  inferCanvasImageMimeType,
  normalizeCanvasControlMode,
  normalizeCanvasGenerationCount,
  parseCanvasImageDataUrl,
  planCanvasImageSource,
  resolveCanvasIpAdapterReferences,
  selectCanvasReferenceImageSource,
} from '../canvas-generation-runtime';

describe('canvas generation runtime', () => {
  it('builds AutoPrompt messages from shot metadata without static defaults', () => {
    const userContent = buildCanvasShotPromptUserContent({
      visualDescription: '雨夜街道里的侦探',
      characters: [{ characterName: 'Mika' }],
      shotScale: 'wide',
      cameraMovement: 'static',
      cameraAngle: 'eye-level',
      characterAction: 'walking through neon rain',
      emotion: ['tense'],
      sceneTags: ['cyberpunk'],
      dialogue: 'We are close.',
    });

    expect(userContent).toContain('Scene: 雨夜街道里的侦探');
    expect(userContent).toContain('Characters: Mika');
    expect(userContent).toContain('Action: walking through neon rain');
    expect(userContent).not.toContain('Camera: static');
    expect(userContent).not.toContain('Angle: eye-level');

    const messages = buildCanvasShotPromptMessages({});
    expect(messages[0]?.role).toBe('system');
    expect(messages[1]?.content).toBe('Generate an image prompt for this shot.');
  });

  it('delegates prompt generation to the injected LLM service', async () => {
    const chat = vi.fn().mockResolvedValue({
      message: { content: 'A concise cinematic English prompt.' },
    });
    const runtime = new CanvasGenerationRuntime({ chat: { chat } });

    await expect(runtime.buildPrompt({ visualDescription: '森林里的猫' })).resolves.toBe(
      'A concise cinematic English prompt.',
    );
    expect(chat).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ role: 'system' }),
        expect.objectContaining({ role: 'user', content: 'Scene: 森林里的猫' }),
      ]),
      { maxTokens: 300 },
    );
  });

  it('plans canvas image source materialization without host IO', () => {
    expect(parseCanvasImageDataUrl('data:image/webp;base64,abc123')).toEqual({
      base64: 'abc123',
      mimeType: 'image/webp',
    });
    expect(parseCanvasImageDataUrl('data:image/png;base64,')).toEqual({
      base64: '',
      mimeType: 'image/png',
    });
    expect(parseCanvasImageDataUrl('data:image/png,abc123')).toBeUndefined();

    expect(inferCanvasImageMimeType('https://cdn.test/ref.avif?x=1')).toBe('image/avif');
    expect(inferCanvasImageMimeType('/tmp/ref.unknown')).toBe('image/png');

    expect(convertCanvasFileUrlToPath('file:///tmp/ref.png')).toBe('/tmp/ref.png');
    expect(convertCanvasFileUrlToPath('file:///C:/Users/me/ref.png')).toBe('C:/Users/me/ref.png');
    expect(convertCanvasFileUrlToPath('file://server/share/ref.png')).toBe(
      '\\\\server\\share\\ref.png',
    );

    expect(planCanvasImageSource('https://cdn.test/ref.jpg')).toEqual({
      kind: 'remote-url',
      url: 'https://cdn.test/ref.jpg',
      fallbackMimeType: 'image/jpeg',
    });
    expect(planCanvasImageSource('/tmp/ref.webp')).toEqual({
      kind: 'local-file',
      path: '/tmp/ref.webp',
      mimeType: 'image/webp',
    });
    expect(planCanvasImageSource('raw-base64')).toEqual({
      kind: 'base64',
      base64: 'raw-base64',
      mimeType: 'image/png',
    });
  });

  it('builds canvas media output data URLs with deterministic MIME precedence', () => {
    expect(buildCanvasMediaOutputDataUrl({ mimeType: 'image/webp' }, 'abc', 'image/png')).toBe(
      'data:image/webp;base64,abc',
    );
    expect(buildCanvasMediaOutputDataUrl({}, 'abc', 'image/jpeg')).toBe(
      'data:image/jpeg;base64,abc',
    );
    expect(buildCanvasMediaOutputDataUrl({}, 'abc')).toBe('data:image/png;base64,abc');
  });

  it('builds a normalized media generation request for a canvas node', () => {
    expect(
      buildCanvasImageGenerationRequest(
        {
          nodeId: 'shot-1',
          cellId: 'cell-1',
          prompt: 'cat detective',
          style: 'anime',
          ratio: '1:1',
          shotScale: 'close-up',
          cameraMovement: 'dolly-in',
          cameraAngle: 'low-angle',
          count: 2.8,
          sourceNodeId: 'source-1',
          characterIds: ['char-1'],
          controlMode: 'depth',
          controlStrength: 0.7,
          negativePrompt: 'blurry',
        },
        [{ imageBase64: 'ref', mimeType: 'image/png', strength: 0.6, mode: 'both' }],
      ),
    ).toEqual({
      prompt: 'cat detective, Shot: close-up, Angle: low-angle, Camera: dolly-in, Style: anime',
      aspectRatio: '1:1',
      count: 2,
      metadata: {
        nodeId: 'shot-1',
        sourceNodeId: 'source-1',
        cellId: 'cell-1',
        characterIds: ['char-1'],
      },
      style: 'anime',
      negativePrompt: 'blurry',
      controlMode: 'depth',
      controlStrength: 0.7,
      ipAdapterRefs: [{ imageBase64: 'ref', mimeType: 'image/png', strength: 0.6, mode: 'both' }],
    });
  });

  it('selects gallery and shot image sources deterministically', () => {
    expect(
      selectCanvasReferenceImageSource(
        {
          type: 'gallery',
          data: {
            cells: [
              { id: 'a', image: 'fallback-data-url' },
              { id: 'b', generatedAsset: { path: '/tmp/ref.png' }, image: 'old-data-url' },
            ],
          },
        },
        'b',
      ),
    ).toBe('/tmp/ref.png');

    expect(
      selectCanvasReferenceImageSource({
        type: 'shot',
        data: {
          generatedAsset: { path: '/tmp/shot.png' },
          generatedImage: 'old-data-url',
        },
      }),
    ).toBe('/tmp/shot.png');
  });

  it('resolves referenceRefs through injected canvas and image bridges', async () => {
    const refs = await resolveCanvasIpAdapterReferences(
      {
        nodeId: 'shot-1',
        prompt: 'prompt',
        referenceRefs: ['gallery-1:cell-2'],
      },
      {
        resolveCanvasNode: async () => ({
          type: 'gallery',
          data: { cells: [{ id: 'cell-2', generatedAsset: { path: '/tmp/ref.webp' } }] },
        }),
        resolveImageSource: async (source) => ({
          base64: `base64:${source}`,
          mimeType: 'image/webp',
        }),
      },
    );

    expect(refs).toEqual([
      {
        imageBase64: 'base64:/tmp/ref.webp',
        mimeType: 'image/webp',
        strength: 0.6,
        mode: 'both',
      },
    ]);
  });

  it('runs image generation and emits progress events', async () => {
    const progress = vi.fn();
    const generateImage = vi.fn().mockResolvedValue({ id: 'task-1', status: 'pending' });
    const waitForTask = vi.fn().mockResolvedValue({
      id: 'task-1',
      status: 'completed',
      outputs: [{ url: 'https://cdn.test/out.png', mimeType: 'image/png' }],
    });
    const runtime = new CanvasGenerationRuntime({
      media: { generateImage, waitForTask },
      fetchOutputAsDataUrl: async () => 'data:image/png;base64,abc',
      onProgress: progress,
    });

    await expect(
      runtime.generateForNode({ nodeId: 'shot-1', cellId: 'cell-1', prompt: 'cat' }),
    ).resolves.toEqual({ dataUrl: 'data:image/png;base64,abc' });

    expect(generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'cat',
        aspectRatio: '16:9',
        count: 1,
        metadata: { nodeId: 'shot-1', sourceNodeId: 'shot-1', cellId: 'cell-1' },
      }),
    );
    expect(waitForTask).toHaveBeenCalledWith('task-1', 180000);
    expect(progress).toHaveBeenCalledWith({
      nodeId: 'shot-1',
      taskId: 'task-1',
      cellId: 'cell-1',
      status: 'generating',
    });
    expect(progress).toHaveBeenCalledWith({
      nodeId: 'shot-1',
      taskId: 'task-1',
      cellId: 'cell-1',
      status: 'done',
    });
  });

  it('emits error progress when generation completes without outputs', async () => {
    const progress = vi.fn();
    const runtime = new CanvasGenerationRuntime({
      media: {
        generateImage: async () => ({ id: 'task-1', status: 'pending' }),
        waitForTask: async () => ({ id: 'task-1', status: 'failed' }),
      },
      fetchOutputAsDataUrl: async () => 'data:image/png;base64,abc',
      onProgress: progress,
    });

    await expect(runtime.generateForNode({ nodeId: 'shot-1', prompt: 'cat' })).resolves.toBe(
      undefined,
    );
    expect(progress).toHaveBeenLastCalledWith({
      nodeId: 'shot-1',
      taskId: 'task-1',
      status: 'error',
    });
  });

  it('normalizes bounded generation fields', () => {
    expect(normalizeCanvasGenerationCount(undefined)).toBe(1);
    expect(normalizeCanvasGenerationCount(0)).toBe(1);
    expect(normalizeCanvasGenerationCount(3.9)).toBe(3);
    expect(normalizeCanvasControlMode('pose')).toBe('pose');
    expect(normalizeCanvasControlMode('unknown')).toBeUndefined();
  });
});
