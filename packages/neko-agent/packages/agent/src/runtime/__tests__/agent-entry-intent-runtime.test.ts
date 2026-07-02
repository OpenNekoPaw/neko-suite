import { describe, expect, it, vi } from 'vitest';
import {
  AGENT_DOCUMENT_CONTEXT_INTENTS,
  AGENT_RETRY_CREATION_MESSAGE,
  buildAgentCreationMessage,
  buildAgentFileContextPayload,
  buildAgentPromptCommandMessage,
  buildAgentRetryCreationMessage,
  buildAgentScriptCommandMessage,
  createAgentFileContextPayloadId,
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
});
