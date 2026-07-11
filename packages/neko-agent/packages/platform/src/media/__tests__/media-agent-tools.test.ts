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
  it('exposes numeric fps enum values in the GenerateVideo tool schema', () => {
    const registry = new ToolRegistry();
    const media = createMediaMock();
    registerMediaAgentTools(registry, media as never);

    const generateVideo = registry
      .toToolDefinitions()
      .find((tool) => tool.function.name === 'GenerateVideo');
    const parameters = generateVideo?.function.parameters as
      { properties?: Record<string, unknown> } | undefined;

    expect(parameters?.properties?.fps).toEqual(
      expect.objectContaining({
        type: 'number',
        enum: [24, 30, 60],
      }),
    );
  });

  it('projects Chinese media tool schema text for model-facing definitions', () => {
    const registry = new ToolRegistry();
    const media = createMediaMock();
    registerMediaAgentTools(registry, media as never);

    const definitions = registry.toToolDefinitions(undefined, { locale: 'zh-CN' });
    const byName = new Map(definitions.map((tool) => [tool.function.name, tool.function]));
    const image = byName.get('GenerateImage');
    const transform = byName.get('TransformImage');
    const video = byName.get('GenerateVideo');
    const music = byName.get('GenerateMusic');
    const tts = byName.get('GenerateTTS');

    expect(image?.description).toContain('异步图像生成任务');
    expect(getPropertyDescription(image, 'prompt')).toBe('图像生成或编辑提示词。');
    expect(getPropertyDescription(image, 'referenceImageUri')).toContain('宿主已解析');
    expect(getPropertyDescription(image, 'editInstruction')).toContain('编辑指令');
    expect(getPropertyDescription(image, 'prompt')).not.toContain('Text description');

    expect(transform?.description).toContain('异步图像编辑任务');
    expect(getPropertyDescription(transform, 'sourceImageUri')).toContain('源图像');
    expect(getPropertyDescription(transform, 'operationPlan')).toContain('可审阅');

    expect(video?.description).toContain('异步视频生成任务');
    expect(getPropertyDescription(video, 'prompt')).toBe('视频生成或编辑提示词。');
    expect(getPropertyDescription(video, 'referenceImageUri')).toContain('图生视频');
    expect(getPropertyDescription(video, 'editInstruction')).toContain('视频编辑');

    expect(music?.description).toContain('异步音乐生成任务');
    expect(getPropertyDescription(music, 'mood')).toContain('音乐情绪');

    expect(tts?.description).toContain('异步文本转语音任务');
    expect(getPropertyDescription(tts, 'text')).toBe('要朗读的文本。');
    expect(getPropertyDescription(tts, 'sourceCueId')).toContain('对白 cue ID');
  });

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
          runId: 'run-1',
          resultDeliveryPolicy: { kind: 'auto-resume-agent' },
        }),
      }),
    );
  });

  it('preserves runtime understanding model overrides in GenerateImage request metadata', async () => {
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
        metadata: {
          understandingModels: {
            image: { providerId: 'google', modelId: 'gemini-flash', category: 'llm' },
          },
        },
      },
    );

    expect(result.success).toBe(true);
    expect(media.generateImage).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          understandingModels: {
            image: { providerId: 'google', modelId: 'gemini-flash', category: 'llm' },
          },
        }),
      }),
    );
  });

  it('creates a distinct run lease for Agent background media tasks when the turn trace has no run id', async () => {
    const registry = new ToolRegistry();
    const media = createMediaMock();
    registerMediaAgentTools(registry, media as never);

    const result = await registry.execute(
      'GenerateImage',
      {
        prompt: 'A moonlit studio',
        providerId: 'openai-provider',
        modelId: 'dalle-model',
      },
      {
        trace: {
          conversationId: 'conv-turn-only',
          turnId: 'turn-conv-turn-only-1',
        },
      },
    );

    const request = media.generateImage.mock.calls[0]?.[0] as
      { metadata?: Record<string, unknown> } | undefined;
    const data = result.data as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(request?.metadata).toEqual(
      expect.objectContaining({
        conversationId: 'conv-turn-only',
        runId: expect.stringMatching(/^run-conv-turn-only-/),
        resultDeliveryPolicy: { kind: 'auto-resume-agent' },
      }),
    );
    expect(request?.metadata?.runId).not.toBe('turn-conv-turn-only-1');
    expect(data).toEqual(
      expect.objectContaining({
        backgroundMode: true,
        conversationId: 'conv-turn-only',
        runId: request?.metadata?.runId,
      }),
    );
  });

  it('creates unique run leases for concurrent Agent background media tasks in the same millisecond', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    try {
      const registry = new ToolRegistry();
      const media = createMediaMock();
      registerMediaAgentTools(registry, media as never);

      const [first, second] = await Promise.all([
        registry.execute(
          'GenerateImage',
          {
            prompt: 'First frame',
            providerId: 'openai-provider',
            modelId: 'dalle-model',
          },
          { trace: { conversationId: 'conv-concurrent', turnId: 'turn-concurrent' } },
        ),
        registry.execute(
          'GenerateImage',
          {
            prompt: 'Second frame',
            providerId: 'openai-provider',
            modelId: 'dalle-model',
          },
          { trace: { conversationId: 'conv-concurrent', turnId: 'turn-concurrent' } },
        ),
      ]);

      const firstRunId = (first.data as Record<string, unknown>).runId;
      const secondRunId = (second.data as Record<string, unknown>).runId;

      expect(first.success).toBe(true);
      expect(second.success).toBe(true);
      expect(firstRunId).toEqual(expect.stringMatching(/^run-conv-concurrent-/));
      expect(secondRunId).toEqual(expect.stringMatching(/^run-conv-concurrent-/));
      expect(firstRunId).not.toBe(secondRunId);
    } finally {
      vi.useRealTimers();
    }
  });

  it('marks Agent-submitted audio media tasks for auto-resume when the runtime trace has a conversation id', async () => {
    const registry = new ToolRegistry();
    const media = createMediaMock();
    registerMediaAgentTools(registry, media as never);

    const result = await registry.execute(
      'GenerateMusic',
      {
        prompt: 'Gentle piano theme',
        providerId: 'music-provider',
        modelId: 'music-model',
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
    expect(media.generateAudio).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: expect.objectContaining({
          conversationId: 'conv-1',
          runId: 'run-1',
          resultDeliveryPolicy: { kind: 'auto-resume-agent' },
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

function getPropertyDescription(
  tool: { parameters: Record<string, unknown> } | undefined,
  name: string,
): string | undefined {
  const properties = tool?.parameters['properties'] as
    Record<string, { description?: string }> | undefined;
  return properties?.[name]?.description;
}
