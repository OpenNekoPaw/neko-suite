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
    });

    expect(result.success).toBe(true);
    expect(media.generateVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt:
          'cat detective walking through a neon rainy alley, anime, cyberpunk, slow tracking shot, avoid blurry',
        providerId: 'new-video-model',
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

  it('does not expose legacy semanticPrompt fields in media tool results', async () => {
    const registry = new ToolRegistry();
    const media = createMediaMock();
    registerMediaAgentTools(registry, media as never);

    const result = await registry.execute('GenerateImage', {
      prompt: 'A lighthouse at dusk',
    });

    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty('semanticPrompt');
    const request = media.generateImage.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(request).not.toHaveProperty('semanticPrompt');
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
});
