import { describe, expect, it, vi } from 'vitest';
import {
  AGENT_DOCUMENT_CONTEXT_INTENTS,
  AGENT_RETRY_CREATION_MESSAGE,
  buildAgentCreationMessage,
  buildAgentFileContextPayload,
  buildCanvasStoryboardActionIntentContextPayload,
  buildCanvasStoryboardActionIntentPrompt,
  buildAgentPromptCommandMessage,
  buildAgentRetryCreationMessage,
  buildAgentScriptCommandMessage,
  createAgentFileContextPayloadId,
  decideCanvasStoryboardActionIntent,
  inferAgentCreationIntentFromFilePath,
  inferAgentFileContextType,
} from '../agent-entry-intent-runtime';

describe('agent entry intent runtime', () => {
  it('maps source files to creation intents and messages', () => {
    expect(inferAgentCreationIntentFromFilePath('/tmp/story.fountain')).toBe(
      'Convert this screenplay to video',
    );
    expect(inferAgentCreationIntentFromFilePath('/tmp/source.DOCX')).toBe(
      'Create a video from this document',
    );
    expect(inferAgentCreationIntentFromFilePath('/tmp/notes.md')).toBe(
      'Create a video from this text',
    );
    expect(inferAgentCreationIntentFromFilePath('/tmp/archive.zip')).toBe(
      'Create a video from this file',
    );
    expect(
      buildAgentCreationMessage({
        intent: 'Create a video from this text',
        sourceFilePath: '/tmp/notes.md',
      }),
    ).toBe('Create a video from this text. Source file: /tmp/notes.md');
    expect(buildAgentCreationMessage({ intent: 'Generate videos for these scenes' })).toBe(
      'Generate videos for these scenes',
    );
  });

  it('builds command prompt messages for extension entrypoints', () => {
    expect(buildAgentPromptCommandMessage({ kind: 'generate-image', prompt: 'cat concept' })).toBe(
      'Generate an image: cat concept',
    );
    expect(
      buildAgentPromptCommandMessage({ kind: 'generate-video', prompt: 'cloud timelapse' }),
    ).toBe('Generate a video: cloud timelapse');

    expect(buildAgentScriptCommandMessage({ kind: 'generate', text: 'space opera' })).toBe(
      'Generate a script based on: space opera',
    );
    expect(buildAgentScriptCommandMessage({ kind: 'optimize', text: 'draft' })).toBe(
      'Optimize this script: draft',
    );
    expect(buildAgentScriptCommandMessage({ kind: 'generate-image', text: 'scene list' })).toBe(
      'Generate images for this script: scene list',
    );
    expect(buildAgentScriptCommandMessage({ kind: 'generate-video', text: 'scene list' })).toBe(
      'Generate a video from this script: scene list',
    );
    expect(buildAgentRetryCreationMessage()).toBe(AGENT_RETRY_CREATION_MESSAGE);
  });

  it('builds file context payloads with deterministic type, id and summary', () => {
    expect(inferAgentFileContextType('/tmp/frame.webp')).toBe('image');
    expect(inferAgentFileContextType('/tmp/frame.webp', 'file')).toBe('file');
    expect(createAgentFileContextPayloadId('/tmp/a.png', { now: () => 123 })).toBe(
      'file:/tmp/a.png:123',
    );

    const now = vi.fn(() => 456);
    expect(
      buildAgentFileContextPayload({
        filePath: '/workspace/assets/frame.webp',
        relativePath: 'assets/frame.webp',
        intent: AGENT_DOCUMENT_CONTEXT_INTENTS.analyzeImage,
        now,
      }),
    ).toEqual({
      type: 'image',
      id: 'file:/workspace/assets/frame.webp:456',
      label: 'frame.webp',
      summary: 'File: assets/frame.webp',
      data: {
        filePath: '/workspace/assets/frame.webp',
        relativePath: 'assets/frame.webp',
      },
      intent: '请分析这张图片：',
    });
  });

  it('builds Canvas storyboard action intent prompts for Agent routing', () => {
    const payload = buildCanvasStoryboardActionIntentContextPayload({
      locale: 'zh-cn',
      payload: {
        type: 'canvas-storyboard-action-intent',
        id: 'shot-1:generate-video',
        label: 'Storyboard action: generate-video',
        summary: 'raw summary',
        data: {
          intent: {
            version: 1,
            actionId: 'generate-video',
            target: { nodeId: 'shot-1', sceneNodeId: 'scene-1', shotNumber: 2 },
            expectedNextStateId: 'ready-to-generate-video',
          },
        },
        intent: 'generate-video',
      },
    });

    expect(payload).toMatchObject({
      type: 'canvas-storyboard-action-intent',
      summary: 'Generate Video for shot-1',
    });
    expect(payload?.intent).toContain('处理 Canvas 分镜下一步动作');
    expect(payload?.intent).toContain('Action intent: generate-video');
    expect(payload?.intent).toContain('nodeId=shot-1');
    expect(payload?.intent).toContain('异步任务');
    expect(payload?.intent).toContain('不要把它当作普通文本表格或旧 generationPrompt 路径');
  });

  it('returns null for ordinary context payloads and fails visibly for malformed storyboard intents', () => {
    expect(
      buildCanvasStoryboardActionIntentContextPayload({
        payload: {
          type: 'file',
          id: 'file-1',
          label: 'story.md',
          summary: 'File: story.md',
          data: { filePath: '/workspace/story.md' },
        },
      }),
    ).toBeNull();

    expect(() =>
      buildCanvasStoryboardActionIntentPrompt({
        intent: {
          version: 1,
          actionId: 'review-result',
          target: { nodeId: 'shot-2' },
        },
      }),
    ).not.toThrow();

    expect(() =>
      buildCanvasStoryboardActionIntentContextPayload({
        payload: {
          type: 'canvas-storyboard-action-intent',
          id: 'bad',
          label: 'Bad intent',
          summary: 'Bad intent',
          data: { intent: { version: 1, actionId: 'future-action', target: { nodeId: 'shot' } } },
        },
      }),
    ).toThrow(/Invalid Canvas storyboard action intent context payload/);
  });

  it('decides storyboard action readiness from inputs, approval, and model capabilities', () => {
    expect(
      decideCanvasStoryboardActionIntent({
        intent: {
          version: 1,
          actionId: 'generate-video',
          target: { nodeId: 'shot-1' },
        },
      }),
    ).toMatchObject({
      status: 'blocked',
      diagnostics: [
        expect.objectContaining({ code: 'storyboard-video-prompt-required' }),
        expect.objectContaining({ code: 'storyboard-model-capability-required' }),
      ],
    });

    const intent = {
      version: 1,
      actionId: 'generate-video',
      target: { nodeId: 'shot-1', sceneNodeId: 'scene-1' },
      promptDocuments: [{ blockKind: 'video', documentId: 'shot-1:video:prompt', version: 1 }],
      generationParams: {
        duration: 4,
        advancedParameters: { aspectRatio: '16:9' },
      },
    } as const;

    expect(
      decideCanvasStoryboardActionIntent({
        intent,
        modelCapability: {
          providerId: 'test',
          modelId: 'video-model',
          videoGeneration: true,
          duration: { maxSeconds: 8 },
          advancedParameters: ['aspectRatio'],
        },
      }),
    ).toMatchObject({
      status: 'requires-approval',
      requiresApproval: true,
      diagnostics: [expect.objectContaining({ code: 'approval-required' })],
    });

    expect(
      decideCanvasStoryboardActionIntent({
        intent,
        approvalGranted: true,
        modelCapability: {
          providerId: 'test',
          modelId: 'video-model',
          videoGeneration: true,
          duration: { maxSeconds: 8 },
          advancedParameters: ['aspectRatio'],
        },
      }),
    ).toMatchObject({
      status: 'ready',
      diagnostics: [],
    });
  });

  it('rejects unsupported storyboard action parameters and model capabilities', () => {
    expect(
      decideCanvasStoryboardActionIntent({
        intent: {
          version: 1,
          actionId: 'generate-video',
          target: { nodeId: 'shot-1' },
          promptDocuments: [{ blockKind: 'video', documentId: 'shot-1:video:prompt', version: 1 }],
          generationParams: {
            duration: 12,
            advancedParameters: { seed: 42 },
          },
        },
        approvalGranted: true,
        modelCapability: {
          videoGeneration: false,
          videoEditing: false,
          duration: { maxSeconds: 6 },
          advancedParameters: ['aspectRatio'],
        },
      }),
    ).toMatchObject({
      status: 'blocked',
      diagnostics: expect.arrayContaining([
        expect.objectContaining({ code: 'unsupported-storyboard-advanced-parameter' }),
        expect.objectContaining({ code: 'storyboard-video-capability-unsupported' }),
        expect.objectContaining({ code: 'storyboard-duration-unsupported' }),
      ]),
    });
  });
});
