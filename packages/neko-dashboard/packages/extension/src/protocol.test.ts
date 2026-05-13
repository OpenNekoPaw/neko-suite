import { describe, expect, it } from 'vitest';
import { isWebviewToExtensionMessage } from './protocol';

describe('dashboard webview protocol guards', () => {
  it('accepts valid messages', () => {
    expect(isWebviewToExtensionMessage({ type: 'ready' })).toBe(true);
    expect(isWebviewToExtensionMessage({ type: 'refresh' })).toBe(true);
    expect(isWebviewToExtensionMessage({ type: 'openProject', path: 'scene.nkv' })).toBe(true);
    expect(isWebviewToExtensionMessage({ type: 'cancelTask', taskId: 'neko-cut:1' })).toBe(true);
    expect(isWebviewToExtensionMessage({ type: 'createProject', projectType: 'video' })).toBe(true);
  });

  it('rejects invalid messages', () => {
    expect(isWebviewToExtensionMessage({ type: 'openProject', taskId: 'wrong' })).toBe(false);
    expect(isWebviewToExtensionMessage({ type: 'cancelTask', path: 'wrong' })).toBe(false);
    expect(isWebviewToExtensionMessage({ type: 'createProject', projectType: 'unknown' })).toBe(
      false,
    );
    expect(isWebviewToExtensionMessage({ type: 'unknown' })).toBe(false);
  });
});
