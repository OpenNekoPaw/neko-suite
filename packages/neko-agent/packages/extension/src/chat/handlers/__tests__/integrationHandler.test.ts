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

describe('IntegrationHandler', () => {
  let handler: IntegrationHandler;
  let webview: ReturnType<typeof createMockWebview>;

  beforeEach(() => {
    vi.clearAllMocks();
    webview = createMockWebview();
    handler = new IntegrationHandler();
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
});
