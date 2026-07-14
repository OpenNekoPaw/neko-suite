import { describe, expect, it } from 'vitest';
import {
  CANVAS_STORYBOARD_AGENT_TASK_SOURCE,
  buildCanvasStoryboardTaskWritebackPayload,
  createCanvasStoryboardAgentTaskProjection,
  projectCanvasStoryboardExecutableActionInput,
} from '../storyboard-action-task-runtime';
import type {
  CanvasStoryboardActionIntent,
  CanvasStoryboardPromptState,
  CanvasStoryboardSemanticPromptDocument,
  StoryboardMediaRef,
} from '@neko/shared';
import {
  CANVAS_STORYBOARD_PROMPT_DOCUMENT_VERSION,
  CANVAS_STORYBOARD_PROMPT_STATE_VERSION,
} from '@neko/shared';

function storyboardTaskScope(childRunId = 'storyboard-generate-video-shot-1-req-generate-video') {
  return {
    conversationId: 'conv-storyboard',
    runId: 'run-storyboard',
    parentRunId: 'run-storyboard',
    childRunId,
    childKind: 'task' as const,
  };
}

describe('storyboard action task runtime', () => {
  it('creates Agent-owned async task records and Canvas task refs for storyboard media work', () => {
    const projection = createCanvasStoryboardAgentTaskProjection({
      scope: storyboardTaskScope(),
      intent: createGenerateVideoIntent(),
      conversationId: 'conv-storyboard',
      status: 'processing',
      progress: 42,
      provider: {
        providerId: 'neko-video',
        modelId: 'video-model-1',
      },
      internalExecution: {
        workerId: 'worker-private',
        subAgentId: 'subagent-private',
      },
      now: () => 1_777_000_000_000,
    });

    expect(projection.taskRef).toEqual({
      source: CANVAS_STORYBOARD_AGENT_TASK_SOURCE,
      sourceTaskId: 'storyboard-generate-video-shot-1-req-generate-video',
      taskId: 'storyboard-generate-video-shot-1-req-generate-video',
      taskKind: 'video',
      conversationId: 'conv-storyboard',
    });
    expect(projection.workItem).toMatchObject({
      kind: 'media-task',
      conversationId: 'conv-storyboard',
      status: 'processing',
      progress: 42,
      task: expect.objectContaining({
        type: 'video',
        providerId: 'neko-video',
        providerName: 'video-model-1',
        steps: expect.arrayContaining([
          expect.objectContaining({ id: 'validate-intent' }),
          expect.objectContaining({ id: 'execute-agent-action', status: 'running' }),
          expect.objectContaining({ id: 'writeback-canvas' }),
        ]),
      }),
    });
    expect(JSON.stringify(projection)).not.toContain('worker-private');
    expect(JSON.stringify(projection)).not.toContain('subagent-private');
  });

  it('rejects review-only actions when callers try to create async task records', () => {
    expect(() =>
      createCanvasStoryboardAgentTaskProjection({
        scope: storyboardTaskScope('review-only-task'),
        intent: {
          version: CANVAS_STORYBOARD_PROMPT_STATE_VERSION,
          actionId: 'review-result',
          target: { nodeId: 'shot-1' },
          resultRef: { mediaRef: stableMediaRef('result-video', 'assets/result-video.mp4') },
        },
        conversationId: 'conv-storyboard',
      }),
    ).toThrow(/does not create an Agent async task/);
  });

  it('builds structured storyboardPrompt writeback with task refs, result refs and next state', () => {
    const intent = createGenerateVideoIntent();
    const taskProjection = createCanvasStoryboardAgentTaskProjection({
      scope: storyboardTaskScope(),
      intent,
      conversationId: 'conv-storyboard',
      now: () => 1_777_000_000_000,
    });
    const payload = buildCanvasStoryboardTaskWritebackPayload({
      intent,
      currentPromptState: createPromptState(),
      taskRef: taskProjection.taskRef,
      resultRef: {
        mediaRef: stableMediaRef('result-video', 'assets/result-video.mp4', 'video/mp4'),
      },
      promptDocuments: [
        {
          ...createVideoPromptDocument(),
          text: 'A slow dolly-in through rain toward Aki.',
          updatedAt: 1_777_000_000_000,
        },
      ],
      conversationId: 'conv-storyboard',
      messageId: 'message-1',
      toolCallId: 'tool-1',
      internalExecution: {
        workerId: 'worker-private',
        subAgentId: 'subagent-private',
      },
    });

    expect(payload).toMatchObject({
      kind: 'structured',
      format: 'json',
      target: {
        nodeId: 'shot-1',
        fieldPath: '/storyboardPrompt',
        mode: 'replace',
      },
      provenance: {
        source: 'agent',
        conversationId: 'conv-storyboard',
        messageId: 'message-1',
        toolCallId: 'tool-1',
        label: 'canvas-storyboard-task-writeback',
      },
    });
    expect(payload.content).toMatchObject({
      version: CANVAS_STORYBOARD_PROMPT_STATE_VERSION,
      promptBlocks: {
        videoPromptDocument: {
          documentId: 'shot-1:video:prompt',
          text: 'A slow dolly-in through rain toward Aki.',
        },
      },
      executionRefs: {
        taskRefs: [expect.objectContaining({ sourceTaskId: taskProjection.taskRef.sourceTaskId })],
        resultRefs: [
          expect.objectContaining({
            mediaRef: expect.objectContaining({ refId: 'result-video' }),
          }),
        ],
      },
      nextCreativeState: expect.objectContaining({
        id: 'needs-result-review',
        nextActionId: 'review-result',
      }),
    });
    expect(JSON.stringify(payload)).not.toContain('worker-private');
    expect(JSON.stringify(payload)).not.toContain('subagent-private');
  });

  it('projects failed task diagnostics to retry state without exposing provider progress', () => {
    const payload = buildCanvasStoryboardTaskWritebackPayload({
      intent: createGenerateVideoIntent(),
      currentPromptState: createPromptState(),
      diagnostics: [
        {
          severity: 'error',
          code: 'provider-generation-failed',
          message: 'Provider failed while rendering this shot.',
          target: 'result-review',
          retryable: true,
        },
      ],
    });

    expect(payload.content).toMatchObject({
      nextCreativeState: {
        id: 'failed-retry',
        label: 'Retry failed action',
        nextActionId: 'retry',
      },
    });
    expect(JSON.stringify(payload.content)).not.toContain('progress');
    expect(JSON.stringify(payload.content)).not.toContain('providerName');
  });

  it('filters unsupported reference inputs and advanced parameters out of executable payloads', () => {
    const projection = projectCanvasStoryboardExecutableActionInput({
      intent: {
        ...createGenerateVideoIntent(),
        referenceMedia: {
          imageRefs: [stableMediaRef('ref-image', 'assets/ref.png')],
          videoRefs: [stableMediaRef('ref-video', 'assets/ref.mp4', 'video/mp4')],
          audioRefs: [stableMediaRef('ref-audio', 'assets/ref.wav', 'audio/wav')],
        },
        generationParams: {
          duration: 4,
          advancedParameters: {
            seed: 12,
            negativePrompt: 'blur',
            cameraControl: 'locked-off',
          },
        },
      },
      modelCapability: {
        providerId: 'neko-video',
        modelId: 'video-model-1',
        videoGeneration: true,
        referenceInputs: { image: true },
        advancedParameters: ['seed'],
      },
    });

    expect(projection.payload.referenceMedia).toEqual({
      imageRefs: [stableMediaRef('ref-image', 'assets/ref.png')],
    });
    expect(projection.payload.generationParams?.advancedParameters).toEqual({ seed: 12 });
    expect(projection.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'storyboard-video-reference-unsupported' }),
        expect.objectContaining({ code: 'storyboard-audio-reference-unsupported' }),
        expect.objectContaining({
          code: 'unsupported-storyboard-advanced-parameter',
          target: 'generationParams.advancedParameters.negativePrompt',
        }),
        expect.objectContaining({
          code: 'unsupported-storyboard-advanced-parameter',
          target: 'generationParams.advancedParameters.cameraControl',
        }),
      ]),
    );
  });

  it('includes supported advanced parameters only for provider-executable actions', () => {
    const supported = projectCanvasStoryboardExecutableActionInput({
      intent: {
        ...createGenerateVideoIntent(),
        generationParams: {
          duration: 4,
          advancedParameters: {
            aspectRatio: '16:9',
            motionStrength: 0.6,
            videoReference: 'ref-video',
          },
        },
      },
      modelCapability: {
        providerId: 'neko-video',
        modelId: 'video-model-1',
        videoGeneration: true,
        referenceInputs: { image: true, video: true },
        advancedParameters: ['aspectRatio', 'motionStrength', 'videoReference'],
      },
    });
    expect(supported.payload.generationParams?.advancedParameters).toEqual({
      aspectRatio: '16:9',
      motionStrength: 0.6,
      videoReference: 'ref-video',
    });
    expect(supported.diagnostics).toEqual([]);

    const promptOptimization = projectCanvasStoryboardExecutableActionInput({
      intent: {
        version: CANVAS_STORYBOARD_PROMPT_STATE_VERSION,
        actionId: 'optimize-video-prompt',
        target: { nodeId: 'shot-1' },
        promptDocuments: [
          {
            blockKind: 'video',
            documentId: 'shot-1:video:prompt',
            version: CANVAS_STORYBOARD_PROMPT_DOCUMENT_VERSION,
          },
        ],
        generationParams: {
          advancedParameters: { aspectRatio: '16:9' },
        },
      },
      modelCapability: {
        advancedParameters: ['aspectRatio'],
      },
    });

    expect(promptOptimization.payload.generationParams?.advancedParameters).toBeUndefined();
    expect(promptOptimization.diagnostics).toEqual([
      expect.objectContaining({
        code: 'storyboard-advanced-parameter-action-unsupported',
        target: 'generationParams.advancedParameters.aspectRatio',
      }),
    ]);
  });
});

function createGenerateVideoIntent(): CanvasStoryboardActionIntent {
  return {
    version: CANVAS_STORYBOARD_PROMPT_STATE_VERSION,
    actionId: 'generate-video',
    requestId: 'req-generate-video',
    target: {
      nodeId: 'shot-1',
      sceneNodeId: 'scene-1',
      shotNumber: 1,
    },
    promptDocuments: [
      {
        blockKind: 'video',
        documentId: 'shot-1:video:prompt',
        version: CANVAS_STORYBOARD_PROMPT_DOCUMENT_VERSION,
      },
    ],
    generationParams: { duration: 4 },
    expectedNextStateId: 'ready-to-generate-video',
  };
}

function createPromptState(): CanvasStoryboardPromptState {
  return {
    version: CANVAS_STORYBOARD_PROMPT_STATE_VERSION,
    promptBlocks: {
      videoPromptDocument: createVideoPromptDocument(),
    },
    referenceMedia: {
      imageRefs: [stableMediaRef('ref-image', 'assets/ref.png')],
    },
    generationParams: { duration: 4 },
  };
}

function createVideoPromptDocument(): CanvasStoryboardSemanticPromptDocument {
  return {
    version: CANVAS_STORYBOARD_PROMPT_DOCUMENT_VERSION,
    documentId: 'shot-1:video:prompt',
    blockKind: 'video',
    text: 'Aki turns back in a rainy hallway.',
  };
}

function stableMediaRef(refId: string, uri: string, mimeType = 'image/png'): StoryboardMediaRef {
  return {
    refId,
    role: 'reference',
    locator: {
      type: 'asset',
      assetId: refId,
      uri,
    },
    mimeType,
  };
}
