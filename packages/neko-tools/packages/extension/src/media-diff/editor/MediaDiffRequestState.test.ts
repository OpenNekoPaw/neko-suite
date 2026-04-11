import { beforeEach, describe, expect, it, vi } from 'vitest';

const unlink = vi.fn().mockResolvedValue(undefined);

vi.mock('fs/promises', () => ({
  unlink,
}));

import { MediaDiffRequestState } from './MediaDiffRequestState';

describe('MediaDiffRequestState', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should abort the previous analysis when a new one begins', () => {
    const state = new MediaDiffRequestState();
    const first = state.beginAnalysis();
    const second = state.beginAnalysis();

    expect(first.signal.aborted).toBe(true);
    expect(second.signal.aborted).toBe(false);
    expect(state.currentAbortController).toBe(second);
  });

  it('should track extracted temp files by ref and clean stale ones', async () => {
    const state = new MediaDiffRequestState();

    await state.setPreviousFilePath('/tmp/prev-head.mp4', 'HEAD');
    expect(state.hasPreviousFileForRef('HEAD')).toBe(true);
    expect(state.hasPreviousFileForRef('abc123')).toBe(false);

    await state.setPreviousFilePath('/tmp/prev-commit.mp4', 'abc123');
    expect(unlink).toHaveBeenCalledWith('/tmp/prev-head.mp4');
    expect(state.previousFilePath).toBe('/tmp/prev-commit.mp4');
    expect(state.previousFileRef).toBe('abc123');
  });

  it('should clear fetch promise only when the current promise matches', () => {
    const state = new MediaDiffRequestState();
    const activeFetch = Promise.resolve();
    const staleFetch = Promise.resolve();

    state.fetchPromise = activeFetch;
    state.clearFetchPromise(staleFetch);
    expect(state.fetchPromise).toBe(activeFetch);

    state.clearFetchPromise(activeFetch);
    expect(state.fetchPromise).toBeNull();
  });
});
