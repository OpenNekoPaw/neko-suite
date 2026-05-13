import { describe, expect, it } from 'vitest';
import { isSafeDashboardLocalRef, isSafeRelativePath } from './pathGuards';

describe('navigation path guards', () => {
  it('accepts simple workspace-relative paths', () => {
    expect(isSafeRelativePath('folder/scene.nkv')).toBe(true);
    expect(isSafeRelativePath('scene.nkv')).toBe(true);
  });

  it('rejects absolute and traversal paths', () => {
    expect(isSafeRelativePath('/tmp/scene.nkv')).toBe(false);
    expect(isSafeRelativePath('../scene.nkv')).toBe(false);
    expect(isSafeRelativePath('folder/../scene.nkv')).toBe(false);
    expect(isSafeRelativePath('folder\\scene.nkv')).toBe(false);
    expect(isSafeRelativePath('')).toBe(false);
  });

  it('uses the shared local-ref guard for revealable dashboard outputs', () => {
    expect(isSafeDashboardLocalRef('renders/output.mp4')).toBe(true);
    expect(isSafeDashboardLocalRef('${WORKSPACE}/renders/output.mp4')).toBe(false);
    expect(isSafeDashboardLocalRef('file:///tmp/output.mp4')).toBe(false);
    expect(isSafeDashboardLocalRef('C:\\tmp\\output.mp4')).toBe(false);
  });
});
