import { describe, expect, it, vi } from 'vitest';
import { ToolRegistry } from '@neko/agent';
import type { MediaTask } from '../types';
import { registerMediaAgentTools } from '../media-agent-tools';

function createMediaMock() {
  return {
    generateImage: vi.fn(async (request: Record<string, unknown>) =>
      createTask('image-task', 'text-to-image', request),
    ),
    generateVideo: vi.fn(async (request: Record<string, unknown>) =>
      createTask('video-task', 'text-to-video', request),
    ),
    generateAudio: vi.fn(async (request: Record<string, unknown>) =>
      createTask('audio-task', 'text-to-audio', request),
    ),
  };
}

function createTask(
  id: string,
  type: MediaTask['type'],
  request: Record<string, unknown>,
): MediaTask {
  return {
    id,
    type,
    status: 'pending',
    progress: 0,
    providerId: (request.providerId as string | undefined) ?? 'default-provider',
    modelId: (request.modelId as string | undefined) ?? 'default-model',
    createdAt: new Date(0),
    updatedAt: new Date(0),
    request: request as never,
  };
}

describe('registerMediaAgentTools', () => {
  it('keeps GenerateImage prompt mode compatible and passes explicit provider/model routing', async () => {
    const registry = new ToolRegistry();
    const media = createMediaMock();
    registerMediaAgentTools(registry, media as never);

    const result = await registry.execute('GenerateImage', {
      prompt: 'A lighthouse at dusk',
      providerId: 'openai-provider',
      modelId: 'dalle-model',
      size: '512x512',
    });

    expect(result.success).toBe(true);
    expect(media.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'A lighthouse at dusk',
        providerId: 'openai-provider',
        modelId: 'dalle-model',
        width: 512,
        height: 512,
        metadata: expect.objectContaining({
          providerAdaptation: expect.objectContaining({
            providerId: 'openai-provider',
            modelId: 'dalle-model',
          }),
        }),
      }),
    );
    expect(result.data).toEqual(
      expect.objectContaining({
        routedTo: expect.objectContaining({
          provider: 'openai-provider',
          model: 'dalle-model',
        }),
        providerAdaptation: expect.objectContaining({
          providerId: 'openai-provider',
          modelId: 'dalle-model',
          resolvedTarget: { providerId: 'openai-provider', modelId: 'dalle-model' },
        }),
      }),
    );
  });

  it('preserves the runtime conversation id in GenerateImage request metadata', async () => {
    const registry = new ToolRegistry();
    const media = createMediaMock();
    registerMediaAgentTools(registry, media as never);

    const result = await registry.execute(
      'GenerateImage',
      {
        prompt: 'A playful cat',
        providerId: 'openai-provider',
        modelId: 'dalle-model',
      },
      {
        trace: {
          conversationId: 'conv-1',
          runId: 'run-1',
          turnId: 'turn-1',
        },
      },
    );

    expect(result.success).toBe(true);
    expect(media.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          conversationId: 'conv-1',
        }),
      }),
    );
  });

  it('extracts generation intent from task markdown and records providerAdaptation metadata', async () => {
    const registry = new ToolRegistry();
    const media = createMediaMock();
    registerMediaAgentTools(registry, media as never);

    const result = await registry.execute('GenerateVideo', {
      taskRef: 'docs/tasks/cat-detective.md',
      taskMarkdown: [
        '# Task: Cat Detective Video',
        '',
        '## Goal',
        'cat detective walking through a neon rainy alley',
        '',
        '## Style',
        '- anime',
        '- cyberpunk',
        '',
        '## Must Include',
        '- slow tracking shot',
        '',
        '## Avoid',
        '- blurry',
        '',
        '## Output',
        '- duration: 6',
        '- resolution: 720p',
      ].join('\n'),
      providerId: 'new-video-model',
      modelId: 'new-video-model-v1',
    });

    expect(result.success).toBe(true);
    expect(media.generateVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt:
          'cat detective walking through a neon rainy alley, anime, cyberpunk, slow tracking shot, avoid blurry',
        providerId: 'new-video-model',
        modelId: 'new-video-model-v1',
        metadata: expect.objectContaining({
          providerAdaptation: expect.objectContaining({
            mode: 'agentic',
            source: expect.objectContaining({
              kind: 'task-markdown',
              uri: 'docs/tasks/cat-detective.md',
            }),
            extractedIntent: expect.objectContaining({
              styleFamily: 'anime',
              mustInclude: ['slow tracking shot'],
              avoid: ['blurry'],
              output: { duration: 6, resolution: '720p' },
            }),
          }),
        }),
      }),
    );
    expect(result.data).toEqual(
      expect.objectContaining({
        providerAdaptation: expect.objectContaining({
          mode: 'agentic',
          source: expect.objectContaining({ kind: 'task-markdown' }),
        }),
      }),
    );
  });

  it('honors native provider adaptation mode for structured task markdown', async () => {
    const registry = new ToolRegistry();
    const media = createMediaMock();
    registerMediaAgentTools(registry, media as never);

    const result = await registry.execute('GenerateImage', {
      taskRef: 'docs/tasks/native-image.md',
      taskMarkdown: ['# Task', '', '## Goal', 'A quiet forest shrine'].join('\n'),
      providerAdaptationMode: 'native',
      providerId: 'image-provider',
      modelId: 'image-model',
    });

    expect(result.success).toBe(true);
    expect(media.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'A quiet forest shrine',
        metadata: expect.objectContaining({
          providerAdaptation: expect.objectContaining({
            mode: 'native',
            adaptationMetadata: expect.objectContaining({
              riskFlags: ['provider-adaptation-bypassed'],
            }),
          }),
        }),
      }),
    );
  });

  it('rejects GenerateImage without explicit args or Agent runtime media model routing', async () => {
    const registry = new ToolRegistry();
    const media = createMediaMock();
    registerMediaAgentTools(registry, media as never);

    const result = await registry.execute('GenerateImage', {
      prompt: 'A lighthouse at dusk',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('explicit Agent image model');
    expect(media.generateImage).not.toHaveBeenCalled();
  });

  it('does not expose legacy semanticPrompt fields in media tool results', async () => {
    const registry = new ToolRegistry();
    const media = createMediaMock();
    registerMediaAgentTools(registry, media as never);

    const result = await registry.execute('GenerateImage', {
      prompt: 'A lighthouse at dusk',
      providerId: 'openai-provider',
      modelId: 'dalle-model',
    });

    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty('semanticPrompt');
    const request = media.generateImage.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(request).not.toHaveProperty('semanticPrompt');
  });

  it('passes GenerateImage reference, mask, control, and edit fields to media routing', async () => {
    const registry = new ToolRegistry();
    const media = createMediaMock();
    registerMediaAgentTools(registry, media as never);

    const result = await registry.execute('GenerateImage', {
      prompt: 'Clean the panel',
      negativePrompt: 'speech bubbles',
      referenceImageUri: '${PROJECT}/refs/panel.png',
      maskUri: '${PROJECT}/masks/speech-bubble.png',
      controlImageUri: '${PROJECT}/controls/lineart.png',
      controlMode: 'lineart',
      controlStrength: 0.7,
      inpaintStrength: 0.8,
      editInstruction: 'Remove text and reconstruct the background.',
      aspectRatio: '16:9',
      providerId: 'image-provider',
      modelId: 'image-model',
    });

    expect(result.success).toBe(true);
    expect(media.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'Clean the panel',
        negativePrompt: 'speech bubbles',
        referenceImageUri: '${PROJECT}/refs/panel.png',
        maskUri: '${PROJECT}/masks/speech-bubble.png',
        controlImageUri: '${PROJECT}/controls/lineart.png',
        controlMode: 'lineart',
        controlStrength: 0.7,
        inpaintStrength: 0.8,
        editInstruction: 'Remove text and reconstruct the background.',
        aspectRatio: '16:9',
      }),
    );
  });

  it('blocks TransformImage when only stable refs are provided without host-resolved input', async () => {
    const registry = new ToolRegistry();
    const media = createMediaMock();
    registerMediaAgentTools(registry, media as never);

    const result = await registry.execute('TransformImage', {
      editInstruction: 'Remove dialogue bubbles.',
      providerId: 'edit-provider',
      modelId: 'edit-model',
      sourceImageRef: {
        refId: 'source-panel-1',
        role: 'source',
        locator: { type: 'tool-result', toolCallId: 'read-comic', assetIndex: 0 },
      },
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('host-resolved');
    expect(media.generateImage).not.toHaveBeenCalled();
  });

  it('registers TransformImage as a source-bound facade over image generation', async () => {
    const registry = new ToolRegistry();
    const media = createMediaMock();
    registerMediaAgentTools(registry, media as never);

    const transformTool = registry.get('TransformImage');
    expect(transformTool?.parameters.properties.sourceImageRef).toEqual(
      expect.objectContaining({ type: 'object' }),
    );
    expect(transformTool?.parameters.properties.maskRefs).toEqual(
      expect.objectContaining({ type: 'array' }),
    );

    const result = await registry.execute('TransformImage', {
      planId: 'prep-1',
      sceneId: 'scene-1',
      shotId: 'shot-1',
      editInstruction: 'Remove dialogue bubbles and fill the wall.',
      sourceImageRef: {
        refId: 'source-panel-1',
        role: 'source',
        locator: { type: 'tool-result', toolCallId: 'read-comic', assetIndex: 0 },
      },
      sourceImageUri: '${PROJECT}/resolved/source-panel-1.png',
      maskUri: '${PROJECT}/resolved/speech-mask.png',
      operationPlan: ['crop-panel', 'remove-text', 'inpaint'],
      targetAspectRatio: '16:9',
      targetStyle: 'natural',
      providerId: 'edit-provider',
      modelId: 'edit-model',
    });

    expect(result.success).toBe(true);
    expect(media.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'Remove dialogue bubbles and fill the wall.',
        providerId: 'edit-provider',
        modelId: 'edit-model',
        referenceImageUri: '${PROJECT}/resolved/source-panel-1.png',
        maskUri: '${PROJECT}/resolved/speech-mask.png',
        aspectRatio: '16:9',
        style: 'natural',
        editInstruction: 'Remove dialogue bubbles and fill the wall.',
        metadata: expect.objectContaining({
          transformImage: expect.objectContaining({
            planId: 'prep-1',
            sceneId: 'scene-1',
            shotId: 'shot-1',
            operationPlan: ['crop-panel', 'remove-text', 'inpaint'],
          }),
        }),
      }),
    );
    expect(result.data).toEqual(
      expect.objectContaining({
        type: 'image-transform',
        transformImage: expect.objectContaining({ planId: 'prep-1' }),
      }),
    );
  });

  it('passes explicit provider/model routing to GenerateVideo', async () => {
    const registry = new ToolRegistry();
    const media = createMediaMock();
    registerMediaAgentTools(registry, media as never);

    const result = await registry.execute('GenerateVideo', {
      prompt: 'A spaceship launch',
      providerId: 'runway-provider',
      modelId: 'runway-model',
    });

    expect(result.success).toBe(true);
    expect(media.generateVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'A spaceship launch',
        providerId: 'runway-provider',
        modelId: 'runway-model',
      }),
    );
  });

  it('passes GenerateVideo image-to-video reference and motion fields to media routing', async () => {
    const registry = new ToolRegistry();
    const media = createMediaMock();
    registerMediaAgentTools(registry, media as never);

    const result = await registry.execute('GenerateVideo', {
      prompt: 'Animate the prepared comic keyframe',
      referenceImageUri: '${PROJECT}/resolved/keyframe-1.png',
      aspectRatio: '16:9',
      motionStrength: 0.4,
      cameraMovement: 'zoom-in',
      cameraAngle: 'eye-level',
      shotScale: 'MS',
      editInstruction: 'Subtle breathing motion and drifting dust.',
      duration: 4,
      resolution: '720p',
      fps: 24,
      providerId: 'runway-provider',
      modelId: 'runway-model',
    });

    expect(result.success).toBe(true);
    expect(media.generateVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt: 'Animate the prepared comic keyframe',
        referenceImageUri: '${PROJECT}/resolved/keyframe-1.png',
        aspectRatio: '16:9',
        motionStrength: 0.4,
        cameraMovement: 'zoom-in',
        cameraAngle: 'eye-level',
        shotScale: 'MS',
        editInstruction: 'Subtle breathing motion and drifting dust.',
        duration: 4,
        resolution: '720p',
        fps: 24,
      }),
    );
  });

  it('uses runtime media model metadata when GenerateImage omits provider/model args', async () => {
    const registry = new ToolRegistry();
    const media = createMediaMock();
    registerMediaAgentTools(registry, media as never);

    const result = await registry.execute(
      'GenerateImage',
      { prompt: 'A mountain village' },
      {
        metadata: {
          mediaModels: {
            image: { providerId: 'flux-provider', modelId: 'flux-model', category: 'image' },
          },
        },
      },
    );

    expect(result.success).toBe(true);
    expect(media.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: 'flux-provider',
        modelId: 'flux-model',
      }),
    );
  });

  it('rejects partial media routing args instead of falling back to defaults', async () => {
    const registry = new ToolRegistry();
    const media = createMediaMock();
    registerMediaAgentTools(registry, media as never);

    const result = await registry.execute('GenerateVideo', {
      prompt: 'A spaceship launch',
      providerId: 'runway-provider',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('both providerId and modelId');
    expect(media.generateVideo).not.toHaveBeenCalled();
  });

  it('uses runtime audio model metadata for GenerateTTS', async () => {
    const registry = new ToolRegistry();
    const media = createMediaMock();
    registerMediaAgentTools(registry, media as never);

    const result = await registry.execute(
      'GenerateTTS',
      { text: 'hello' },
      {
        metadata: {
          mediaModels: {
            audio: { providerId: 'tts-provider', modelId: 'tts-model', category: 'audio' },
          },
        },
      },
    );

    expect(result.success).toBe(true);
    expect(media.generateAudio).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: 'tts-provider',
        modelId: 'tts-model',
      }),
    );
  });
});
