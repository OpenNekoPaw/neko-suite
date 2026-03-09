/**
 * IntegrationHandler unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IntegrationHandler } from '../integrationHandler';

// Mock getMCPTestService
vi.mock('@neko/agent', () => ({
  getMCPTestService: vi.fn().mockReturnValue({
    test: vi.fn().mockResolvedValue({ success: true }),
  }),
}));

import { getMCPTestService } from '@neko/agent';

function createMockWebview() {
  return { postMessage: vi.fn().mockResolvedValue(true) };
}

function createMockContext() {
  const store = new Map<string, unknown>();
  return {
    globalState: {
      get: vi.fn((key: string, defaultValue?: unknown) => store.get(key) ?? defaultValue),
      update: vi.fn(async (key: string, value: unknown) => {
        store.set(key, value);
      }),
    },
  };
}

describe('IntegrationHandler', () => {
  let handler: IntegrationHandler;
  let webview: ReturnType<typeof createMockWebview>;
  let context: ReturnType<typeof createMockContext>;
  let sendSettings: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    webview = createMockWebview();
    context = createMockContext();
    sendSettings = vi.fn();
    handler = new IntegrationHandler({
      context: context as any,
      sendSettings,
    });
  });

  describe('handleTestMCPServer', () => {
    it('should test MCP server and report success', async () => {
      await handler.handleTestMCPServer(webview as any, {
        id: 'server-1',
        name: 'Test Server',
        command: 'npx test-mcp',
        args: ['--port', '3000'],
        requestId: 'req-123',
      });

      const testService = getMCPTestService();
      expect(testService.test).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'server-1',
          name: 'Test Server',
          command: 'npx test-mcp',
          args: ['--port', '3000'],
          timeout: 10000,
        }),
      );

      expect(webview.postMessage).toHaveBeenCalledWith({
        type: 'mcpServerTestResult',
        requestId: 'req-123',
        success: true,
        error: undefined,
      });
    });

    it('should generate requestId when not provided', async () => {
      await handler.handleTestMCPServer(webview as any, {
        id: 'server-1',
        name: 'Test',
        command: 'npx test',
      });

      const call = webview.postMessage.mock.calls[0]![0];
      expect(call.requestId).toMatch(/^mcp-test-/);
    });

    it('should report test failure from service', async () => {
      const testService = getMCPTestService();
      (testService.test as any).mockResolvedValue({ success: false, error: 'Connection refused' });

      await handler.handleTestMCPServer(webview as any, {
        id: 'server-1',
        name: 'Bad Server',
        command: 'npx bad-server',
      });

      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: 'Connection refused' }),
      );
    });

    it('should handle test service exception', async () => {
      const testService = getMCPTestService();
      (testService.test as any).mockRejectedValue(new Error('Timeout'));

      await handler.handleTestMCPServer(webview as any, {
        id: 'server-1',
        name: 'Slow Server',
        command: 'npx slow-server',
      });

      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ success: false, error: 'Timeout' }),
      );
    });
  });

  describe('addMCPServer', () => {
    it('should store server and notify settings on success', async () => {
      const { showInputBox, showInformationMessage } = await import('vscode').then((m) => m.window);
      (showInputBox as any)
        .mockResolvedValueOnce('my-server') // server name
        .mockResolvedValueOnce('npx my-mcp') // command
        .mockResolvedValueOnce('/path/to/dir'); // args

      await handler.addMCPServer();

      expect(context.globalState.update).toHaveBeenCalledWith(
        'neko.mcpServers',
        expect.objectContaining({
          'my-server': { command: 'npx my-mcp', args: ['/path/to/dir'] },
        }),
      );
      expect(showInformationMessage).toHaveBeenCalledWith(expect.stringContaining('my-server'));
      expect(sendSettings).toHaveBeenCalled();
    });

    it('should abort when server name is cancelled', async () => {
      const { showInputBox } = await import('vscode').then((m) => m.window);
      (showInputBox as any).mockResolvedValueOnce(undefined);

      await handler.addMCPServer();

      expect(context.globalState.update).not.toHaveBeenCalled();
      expect(sendSettings).not.toHaveBeenCalled();
    });

    it('should abort when command is cancelled', async () => {
      const { showInputBox } = await import('vscode').then((m) => m.window);
      (showInputBox as any).mockResolvedValueOnce('my-server').mockResolvedValueOnce(undefined);

      await handler.addMCPServer();

      expect(context.globalState.update).not.toHaveBeenCalled();
    });

    it('should handle empty args', async () => {
      const { showInputBox } = await import('vscode').then((m) => m.window);
      (showInputBox as any)
        .mockResolvedValueOnce('my-server')
        .mockResolvedValueOnce('npx my-mcp')
        .mockResolvedValueOnce('');

      await handler.addMCPServer();

      expect(context.globalState.update).toHaveBeenCalledWith(
        'neko.mcpServers',
        expect.objectContaining({
          'my-server': { command: 'npx my-mcp', args: [] },
        }),
      );
    });
  });
});
