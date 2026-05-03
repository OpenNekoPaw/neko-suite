/**
 * IntegrationHandler unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IntegrationHandler } from '../integrationHandler';

// Mock only the MCP test service; keep presenter functions real.
vi.mock('@neko/agent', async () => {
  const actual = await vi.importActual<typeof import('@neko/agent')>('@neko/agent');
  return {
    ...actual,
    getMCPTestService: vi.fn().mockReturnValue({
      test: vi.fn().mockResolvedValue({ success: true }),
    }),
  };
});

import { getMCPTestService } from '@neko/agent';

function createMockWebview() {
  return { postMessage: vi.fn().mockResolvedValue(true) };
}

function createMockPlatform() {
  return {
    config: {
      setMCPServer: vi.fn().mockResolvedValue(undefined),
    },
  };
}

describe('IntegrationHandler', () => {
  let handler: IntegrationHandler;
  let webview: ReturnType<typeof createMockWebview>;
  let platform: ReturnType<typeof createMockPlatform>;
  let sendSettings: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    webview = createMockWebview();
    platform = createMockPlatform();
    sendSettings = vi.fn();
    handler = new IntegrationHandler({
      platform: platform as any,
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

      expect(platform.config.setMCPServer).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'my-server',
          name: 'my-server',
          transport: 'stdio',
          command: 'npx my-mcp',
          args: ['/path/to/dir'],
          enabled: true,
        }),
      );
      expect(showInformationMessage).toHaveBeenCalledWith(expect.stringContaining('my-server'));
      expect(sendSettings).toHaveBeenCalled();
    });

    it('should abort when server name is cancelled', async () => {
      const { showInputBox } = await import('vscode').then((m) => m.window);
      (showInputBox as any).mockResolvedValueOnce(undefined);

      await handler.addMCPServer();

      expect(platform.config.setMCPServer).not.toHaveBeenCalled();
      expect(sendSettings).not.toHaveBeenCalled();
    });

    it('should abort when command is cancelled', async () => {
      const { showInputBox } = await import('vscode').then((m) => m.window);
      (showInputBox as any).mockResolvedValueOnce('my-server').mockResolvedValueOnce(undefined);

      await handler.addMCPServer();

      expect(platform.config.setMCPServer).not.toHaveBeenCalled();
    });

    it('should handle empty args', async () => {
      const { showInputBox } = await import('vscode').then((m) => m.window);
      (showInputBox as any)
        .mockResolvedValueOnce('my-server')
        .mockResolvedValueOnce('npx my-mcp')
        .mockResolvedValueOnce('');

      await handler.addMCPServer();

      expect(platform.config.setMCPServer).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'my-server',
          command: 'npx my-mcp',
          args: [],
        }),
      );
    });

    it('should show error when platform config is unavailable', async () => {
      const { showInputBox, showErrorMessage } = await import('vscode').then((m) => m.window);
      handler = new IntegrationHandler({ sendSettings });
      (showInputBox as any)
        .mockResolvedValueOnce('my-server')
        .mockResolvedValueOnce('npx my-mcp')
        .mockResolvedValueOnce('');

      await handler.addMCPServer();

      expect(showErrorMessage).toHaveBeenCalledWith('MCP configuration is unavailable.');
      expect(sendSettings).not.toHaveBeenCalled();
    });

    it('should show error and skip settings refresh when platform write fails', async () => {
      const { showInputBox, showErrorMessage } = await import('vscode').then((m) => m.window);
      platform.config.setMCPServer.mockRejectedValue(new Error('disk denied'));
      (showInputBox as any)
        .mockResolvedValueOnce('my-server')
        .mockResolvedValueOnce('npx my-mcp')
        .mockResolvedValueOnce('');

      await handler.addMCPServer();

      expect(showErrorMessage).toHaveBeenCalledWith('Failed to add MCP server: disk denied');
      expect(sendSettings).not.toHaveBeenCalled();
    });
  });
});
