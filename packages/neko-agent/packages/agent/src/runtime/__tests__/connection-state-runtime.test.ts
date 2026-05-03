import { describe, expect, it, vi } from 'vitest';
import {
  createRuntimeConnectionStateStore,
  getRuntimeConnectionStateKey,
} from '../connection-state-runtime';

describe('connection state runtime', () => {
  it('stores connection state and projects protocol state map', () => {
    const store = createRuntimeConnectionStateStore({ now: () => 123 });

    store.updateState({
      id: 'server-1',
      name: 'MCP Server',
      type: 'mcp',
      status: 'connected',
    });

    expect(store.getState('server-1', 'mcp')).toEqual({
      id: 'server-1',
      name: 'MCP Server',
      type: 'mcp',
      status: 'connected',
      lastChecked: 123,
    });
    expect(store.getStatesMap()).toEqual({
      'mcp:server-1': { status: 'connected' },
    });
  });

  it('notifies listeners only when status changes', () => {
    const listener = vi.fn();
    const store = createRuntimeConnectionStateStore({ now: () => 123 });
    store.addListener(listener);

    store.updateState({
      id: 'server-1',
      name: 'MCP Server',
      type: 'mcp',
      status: 'connecting',
    });
    store.updateState({
      id: 'server-1',
      name: 'MCP Server',
      type: 'mcp',
      status: 'connecting',
    });
    store.updateState({
      id: 'server-1',
      name: 'MCP Server',
      type: 'mcp',
      status: 'error',
      error: 'failed',
    });

    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener).toHaveBeenNthCalledWith(1, {
      id: 'server-1',
      type: 'mcp',
      oldStatus: 'disconnected',
      newStatus: 'connecting',
    });
    expect(listener).toHaveBeenNthCalledWith(2, {
      id: 'server-1',
      type: 'mcp',
      oldStatus: 'connecting',
      newStatus: 'error',
      error: 'failed',
    });
  });

  it('removes listeners and builds stable keys', () => {
    const listener = vi.fn();
    const store = createRuntimeConnectionStateStore();
    const dispose = store.addListener(listener);
    dispose();

    store.updateState({
      id: 'server-1',
      name: 'MCP Server',
      type: 'mcp',
      status: 'connected',
    });

    expect(listener).not.toHaveBeenCalled();
    expect(getRuntimeConnectionStateKey('mcp', 'server-1')).toBe('mcp:server-1');
  });
});
