import { describe, expect, it, vi } from 'vitest';
import {
  MCP_SERVER_TEST_TIMEOUT_MS,
  buildMCPServerStoreEntry,
  buildMCPServerTestPlan,
  buildMCPServerTestResultMessage,
  parseMCPServerArgsInput,
  runMCPServerTestRuntime,
} from '../mcp-webview-presenter';

describe('mcp webview presenter', () => {
  it('builds MCP server test plans', () => {
    expect(
      buildMCPServerTestPlan({
        server: {
          id: 'server-1',
          name: 'Server',
          command: 'npx server',
          args: ['--port', '3000'],
          requestId: 'req-1',
        },
      }),
    ).toEqual({
      requestId: 'req-1',
      config: {
        id: 'server-1',
        name: 'Server',
        command: 'npx server',
        args: ['--port', '3000'],
        timeout: MCP_SERVER_TEST_TIMEOUT_MS,
      },
    });

    expect(
      buildMCPServerTestPlan({
        server: { id: 'server-2', name: 'Server 2', command: 'npx server-2' },
        createRequestId: () => 'generated',
      }).requestId,
    ).toBe('generated');
  });

  it('builds test result messages', () => {
    expect(
      buildMCPServerTestResultMessage({
        requestId: 'req-1',
        result: { success: true, serverId: 'server-1' },
      }),
    ).toEqual({
      type: 'mcpServerTestResult',
      requestId: 'req-1',
      success: true,
    });

    expect(
      buildMCPServerTestResultMessage({
        requestId: 'req-2',
        error: new Error('Timeout'),
      }),
    ).toEqual({
      type: 'mcpServerTestResult',
      requestId: 'req-2',
      success: false,
      error: 'Timeout',
    });
  });

  it('parses args input and builds store entries', () => {
    expect(parseMCPServerArgsInput(' /repo , --flag ,, ')).toEqual(['/repo', '--flag']);
    expect(buildMCPServerStoreEntry({ command: 'npx server', argsInput: '/repo' })).toEqual({
      command: 'npx server',
      args: ['/repo'],
    });
  });

  it('runs MCP server tests and posts success messages', async () => {
    const test = vi.fn().mockResolvedValue({ success: true, serverId: 'server-1' });
    const postMessage = vi.fn();

    const result = await runMCPServerTestRuntime(
      {
        server: {
          id: 'server-1',
          name: 'Server',
          command: 'npx server',
          args: ['--stdio'],
          env: { DEBUG: '1' },
          requestId: 'req-1',
        },
      },
      { test, postMessage },
    );

    expect(test).toHaveBeenCalledWith({
      id: 'server-1',
      name: 'Server',
      command: 'npx server',
      args: ['--stdio'],
      env: { DEBUG: '1' },
      timeout: MCP_SERVER_TEST_TIMEOUT_MS,
    });
    expect(postMessage).toHaveBeenCalledWith({
      type: 'mcpServerTestResult',
      requestId: 'req-1',
      success: true,
    });
    expect(result).toEqual({ requestId: 'req-1', success: true });
  });

  it('runs MCP server tests and posts service failure messages', async () => {
    const test = vi.fn().mockResolvedValue({
      success: false,
      serverId: 'server-1',
      error: 'Connection refused',
    });
    const postMessage = vi.fn();

    const result = await runMCPServerTestRuntime(
      {
        server: {
          id: 'server-1',
          name: 'Server',
          command: 'npx server',
          requestId: 'req-2',
        },
      },
      { test, postMessage },
    );

    expect(postMessage).toHaveBeenCalledWith({
      type: 'mcpServerTestResult',
      requestId: 'req-2',
      success: false,
      error: 'Connection refused',
    });
    expect(result).toEqual({
      requestId: 'req-2',
      success: false,
      error: 'Connection refused',
    });
  });

  it('runs MCP server tests and posts exception failure messages', async () => {
    const test = vi.fn().mockRejectedValue(new Error('Timeout'));
    const postMessage = vi.fn();

    const result = await runMCPServerTestRuntime(
      {
        server: {
          id: 'server-1',
          name: 'Server',
          command: 'npx server',
          requestId: 'req-3',
        },
      },
      { test, postMessage },
    );

    expect(postMessage).toHaveBeenCalledWith({
      type: 'mcpServerTestResult',
      requestId: 'req-3',
      success: false,
      error: 'Timeout',
    });
    expect(result).toEqual({ requestId: 'req-3', success: false, error: 'Timeout' });
  });
});
