import { describe, expect, it } from 'vitest';
import { isWebviewToExtensionMessage } from './protocol';

describe('dashboard webview protocol guards', () => {
  it('accepts valid messages', () => {
    expect(isWebviewToExtensionMessage({ type: 'ready' })).toBe(true);
    expect(isWebviewToExtensionMessage({ type: 'refresh' })).toBe(true);
    expect(isWebviewToExtensionMessage({ type: 'refreshCreativeEntities' })).toBe(true);
    expect(
      isWebviewToExtensionMessage({
        type: 'selectCreativeEntity',
        ref: {
          source: 'neko-story',
          sourceEntityId: 'entity:char_xiaoju',
          entityId: 'char_xiaoju',
          entityKind: 'character',
          workspaceFolder: 'neko-test',
        },
      }),
    ).toBe(true);
    expect(
      isWebviewToExtensionMessage({
        type: 'creativeEntityAction',
        request: {
          source: 'neko-story',
          ref: {
            source: 'neko-story',
            sourceEntityId: 'entity:char_xiaoju',
            entityId: 'char_xiaoju',
            entityKind: 'character',
            workspaceFolder: 'neko-test',
          },
          action: 'bind-existing',
          role: 'portrait',
        },
      }),
    ).toBe(true);
    expect(
      isWebviewToExtensionMessage({
        type: 'creativeEntityAction',
        request: {
          source: 'neko-story',
          ref: {
            source: 'neko-story',
            sourceEntityId: 'entity:char_xiaoju',
            entityId: 'char_xiaoju',
            entityKind: 'character',
            workspaceFolder: 'neko-test',
          },
          action: 'accept-memory-review',
          memoryReviewId: 'review-obs-1',
        },
      }),
    ).toBe(true);
    expect(isWebviewToExtensionMessage({ type: 'openProject', path: 'scene.nkv' })).toBe(true);
    expect(isWebviewToExtensionMessage({ type: 'cancelTask', taskId: 'neko-cut:1' })).toBe(true);
    expect(isWebviewToExtensionMessage({ type: 'createProject', projectType: 'story' })).toBe(true);
    expect(isWebviewToExtensionMessage({ type: 'createProject', projectType: 'video' })).toBe(true);
    expect(isWebviewToExtensionMessage({ type: 'executeCommand', command: 'neko.ai.chat' })).toBe(
      true,
    );
    expect(
      isWebviewToExtensionMessage({
        type: 'executeCommand',
        command: 'neko.agent.invokeSkill',
        intent: 'Generate a clip',
        skill: {
          id: 'ai-generate',
          extensionId: 'neko.neko-agent',
          name: 'AI Generate',
          description: 'Generate media',
          locale: 'en',
          tags: ['ai'],
        },
      }),
    ).toBe(true);
  });

  it('rejects invalid messages', () => {
    expect(isWebviewToExtensionMessage({ type: 'openProject', taskId: 'wrong' })).toBe(false);
    expect(
      isWebviewToExtensionMessage({
        type: 'selectCreativeEntity',
        ref: {
          source: 'neko-story',
          sourceEntityId: 'entity:bad',
          entityKind: 'character',
          workspaceFolder: '/tmp/bad',
        },
      }),
    ).toBe(false);
    expect(
      isWebviewToExtensionMessage({
        type: 'creativeEntityAction',
        request: { source: 'neko-story', action: 'unknown' },
      }),
    ).toBe(false);
    expect(isWebviewToExtensionMessage({ type: 'cancelTask', path: 'wrong' })).toBe(false);
    expect(isWebviewToExtensionMessage({ type: 'createProject', projectType: 'unknown' })).toBe(
      false,
    );
    expect(
      isWebviewToExtensionMessage({
        type: 'executeCommand',
        command: 'neko.agent.invokeSkill',
        skill: {
          id: 'missing-locale',
          extensionId: 'neko.neko-agent',
          name: 'AI Generate',
          description: 'Generate media',
        },
      }),
    ).toBe(false);
    expect(isWebviewToExtensionMessage({ type: 'unknown' })).toBe(false);
  });
});
