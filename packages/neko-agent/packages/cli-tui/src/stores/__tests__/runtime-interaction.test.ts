import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAgentStore } from '../agent-store';
import { useUIStore } from '../ui-store';

describe('TUI runtime interaction state', () => {
  beforeEach(() => {
    useAgentStore.getState().reset();
    useUIStore.setState({ scrollOffset: 0, scrollLimit: 0 });
  });

  afterEach(() => vi.restoreAllMocks());

  it('keeps one turn start time while running and clears it when the turn becomes idle', () => {
    vi.spyOn(Date, 'now').mockReturnValueOnce(1_000).mockReturnValueOnce(5_000);

    useAgentStore.getState().setRunning();
    expect(useAgentStore.getState()).toMatchObject({ status: 'running', startTime: 1_000 });

    useAgentStore.getState().setRunning();
    expect(useAgentStore.getState()).toMatchObject({ status: 'running', startTime: 1_000 });

    useAgentStore.getState().setIdle();
    expect(useAgentStore.getState()).toMatchObject({ status: 'idle', startTime: null });
  });

  it('defines scroll offset as rows above the live bottom', () => {
    useUIStore.getState().setScrollLimit(10);
    useUIStore.getState().scrollUp(6);
    expect(useUIStore.getState().scrollOffset).toBe(6);

    useUIStore.getState().setScrollLimit(14);
    expect(useUIStore.getState().scrollOffset).toBe(10);

    useUIStore.getState().scrollDown(2);
    expect(useUIStore.getState().scrollOffset).toBe(8);

    useUIStore.getState().scrollToBottom();
    expect(useUIStore.getState().scrollOffset).toBe(0);
  });
});
