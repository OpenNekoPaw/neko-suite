/**
 * HTTP Server Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UniEditHttpServer } from '../http-server';
import type { ToolRegistry, Tool, ToolResult } from '@neko/agent';

// Mock ToolRegistry
function createMockToolRegistry(): ToolRegistry {
  const tools: Map<string, Tool> = new Map();

  // Add test tools
  const testTools: Tool[] = [
    {
      name: 'GetTimelineInfo',
      description: 'Get timeline info',
      category: 'timeline',
      parameters: { type: 'object', properties: {} },
      requiresConfirmation: false,
      execute: async () => ({ success: true, data: { duration: 60, fps: 30 } }),
    },
    {
      name: 'GenerateImage',
      description: 'Generate an image',
      category: 'generation',
      parameters: {
        type: 'object',
        properties: { prompt: { type: 'string' } },
        required: ['prompt'],
      },
      requiresConfirmation: true,
      execute: async (args) => ({
        success: true,
        data: { url: 'https://example.com/image.png', prompt: args.prompt },
      }),
    },
  ];

  for (const tool of testTools) {
    tools.set(tool.name, tool);
  }

  return {
    register: vi.fn((tool: Tool) => tools.set(tool.name, tool)),
    unregister: vi.fn((name: string) => tools.delete(name)),
    get: vi.fn((name: string) => tools.get(name)),
    list: vi.fn(() => Array.from(tools.values())),
    listByCategory: vi.fn((category) =>
      Array.from(tools.values()).filter((t) => t.category === category)
    ),
    execute: vi.fn(async (name: string, args: Record<string, unknown>) => {
      const tool = tools.get(name);
      if (!tool) {
        return { success: false, error: `Tool '${name}' not found` };
      }
      return tool.execute(args);
    }),
  } as unknown as ToolRegistry;
}

// HTTP client helper
async function httpRequest(
  port: number,
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; data: unknown }> {
  const url = `http://127.0.0.1:${port}${path}`;
  const options: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const data = await response.json();
  return { status: response.status, data };
}

describe('UniEditHttpServer', () => {
  let server: UniEditHttpServer;
  let toolRegistry: ToolRegistry;
  const testPort = 19527; // Use different port for tests

  beforeEach(() => {
    toolRegistry = createMockToolRegistry();
    server = new UniEditHttpServer(toolRegistry, {
      port: testPort,
      host: '127.0.0.1',
    });
  });

  afterEach(async () => {
    await server.stop();
  });

  describe('Server lifecycle', () => {
    it('should start and stop correctly', async () => {
      expect(server.isRunning()).toBe(false);

      await server.start();
      expect(server.isRunning()).toBe(true);
      expect(server.getUrl()).toBe(`http://127.0.0.1:${testPort}`);

      await server.stop();
      expect(server.isRunning()).toBe(false);
    });

    it('should handle multiple start calls', async () => {
      await server.start();
      await server.start(); // Should not throw
      expect(server.isRunning()).toBe(true);
    });

    it('should handle multiple stop calls', async () => {
      await server.start();
      await server.stop();
      await server.stop(); // Should not throw
      expect(server.isRunning()).toBe(false);
    });
  });

  describe('Health endpoint', () => {
    beforeEach(async () => {
      await server.start();
    });

    it('should return health status', async () => {
      const { status, data } = await httpRequest(testPort, 'GET', '/api/v1/health');

      expect(status).toBe(200);
      expect(data).toMatchObject({
        success: true,
        data: {
          status: 'ok',
          version: '1.0.0',
        },
      });
    });
  });

  describe('Tools endpoints', () => {
    beforeEach(async () => {
      await server.start();
    });

    it('should list all tools', async () => {
      const { status, data } = await httpRequest(testPort, 'GET', '/api/v1/tools');

      expect(status).toBe(200);
      const response = data as { success: boolean; data: { tools: unknown[]; total: number } };
      expect(response.success).toBe(true);
      expect(response.data.tools).toHaveLength(2);
      expect(response.data.total).toBe(2);
    });

    it('should filter tools by category', async () => {
      const { status, data } = await httpRequest(
        testPort,
        'GET',
        '/api/v1/tools?category=timeline'
      );

      expect(status).toBe(200);
      const response = data as { success: boolean; data: { tools: { name: string }[] } };
      expect(response.success).toBe(true);
      expect(response.data.tools).toHaveLength(1);
      expect(response.data.tools[0].name).toBe('GetTimelineInfo');
    });

    it('should get single tool info', async () => {
      const { status, data } = await httpRequest(
        testPort,
        'GET',
        '/api/v1/tools/GenerateImage'
      );

      expect(status).toBe(200);
      const response = data as { success: boolean; data: { name: string; category: string } };
      expect(response.success).toBe(true);
      expect(response.data.name).toBe('GenerateImage');
      expect(response.data.category).toBe('generation');
    });

    it('should return 404 for unknown tool', async () => {
      const { status, data } = await httpRequest(
        testPort,
        'GET',
        '/api/v1/tools/unknown_tool'
      );

      expect(status).toBe(404);
      const response = data as { success: boolean; code: string };
      expect(response.success).toBe(false);
      expect(response.code).toBe('TOOL_NOT_FOUND');
    });
  });

  describe('Tool execution', () => {
    beforeEach(async () => {
      // Set webview checker to return connected
      server.setWebviewChecker({
        isConnected: () => true,
        getProjectInfo: () => ({ loaded: true }),
      });
      await server.start();
    });

    it('should execute non-timeline tool without webview', async () => {
      // Remove webview checker
      server.setWebviewChecker({
        isConnected: () => false,
        getProjectInfo: () => null,
      });

      const { status, data } = await httpRequest(
        testPort,
        'POST',
        '/api/v1/tools/GenerateImage/execute',
        { prompt: 'a beautiful sunset' }
      );

      expect(status).toBe(200);
      const response = data as { success: boolean; data: { prompt: string } };
      expect(response.success).toBe(true);
      expect(response.data.prompt).toBe('a beautiful sunset');
    });

    it('should execute timeline tool with webview connected', async () => {
      const { status, data } = await httpRequest(
        testPort,
        'POST',
        '/api/v1/tools/GetTimelineInfo/execute',
        {}
      );

      expect(status).toBe(200);
      const response = data as { success: boolean; data: { duration: number } };
      expect(response.success).toBe(true);
      expect(response.data.duration).toBe(60);
    });

    it('should reject timeline tool without webview', async () => {
      // Set webview as disconnected
      server.setWebviewChecker({
        isConnected: () => false,
        getProjectInfo: () => null,
      });

      const { status, data } = await httpRequest(
        testPort,
        'POST',
        '/api/v1/tools/GetTimelineInfo/execute',
        {}
      );

      expect(status).toBe(503);
      const response = data as { success: boolean; code: string };
      expect(response.success).toBe(false);
      expect(response.code).toBe('PROJECT_NOT_LOADED');
    });

    it('should execute timeline tool without webview when project is loaded', async () => {
      // Webview disconnected but project loaded (Extension 本地执行)
      server.setWebviewChecker({
        isConnected: () => false,
        getProjectInfo: () => ({ loaded: true }),
      });

      const { status, data } = await httpRequest(
        testPort,
        'POST',
        '/api/v1/tools/GetTimelineInfo/execute',
        {}
      );

      expect(status).toBe(200);
      const response = data as { success: boolean; data: { duration: number } };
      expect(response.success).toBe(true);
      expect(response.data.duration).toBe(60);
    });

    it('should return 404 for unknown tool execution', async () => {
      const { status, data } = await httpRequest(
        testPort,
        'POST',
        '/api/v1/tools/unknown_tool/execute',
        {}
      );

      expect(status).toBe(404);
      const response = data as { success: boolean; code: string };
      expect(response.success).toBe(false);
      expect(response.code).toBe('TOOL_NOT_FOUND');
    });

    it('should handle invalid JSON body', async () => {
      const url = `http://127.0.0.1:${testPort}/api/v1/tools/GenerateImage/execute`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json',
      });

      expect(response.status).toBe(400);
      const data = (await response.json()) as { code: string };
      expect(data.code).toBe('INVALID_JSON');
    });
  });

  describe('Project endpoints', () => {
    beforeEach(async () => {
      await server.start();
    });

    it('should return project status', async () => {
      server.setWebviewChecker({
        isConnected: () => true,
        getProjectInfo: () => ({ loaded: true, path: '/test/project.jvi' }),
      });

      const { status, data } = await httpRequest(
        testPort,
        'GET',
        '/api/v1/project/status'
      );

      expect(status).toBe(200);
      const response = data as {
        success: boolean;
        data: { webviewConnected: boolean; project: { loaded: boolean } };
      };
      expect(response.success).toBe(true);
      expect(response.data.webviewConnected).toBe(true);
      expect(response.data.project.loaded).toBe(true);
    });

    it('should require path for load project', async () => {
      server.setProjectLoader(async () => {});

      const { status, data } = await httpRequest(
        testPort,
        'POST',
        '/api/v1/project/load',
        {}
      );

      expect(status).toBe(400);
      const response = data as { code: string };
      expect(response.code).toBe('PATH_REQUIRED');
    });
  });

  describe('CORS', () => {
    beforeEach(async () => {
      await server.start();
    });

    it('should handle OPTIONS preflight request', async () => {
      const url = `http://127.0.0.1:${testPort}/api/v1/health`;
      const response = await fetch(url, { method: 'OPTIONS' });

      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    });
  });

  describe('404 handling', () => {
    beforeEach(async () => {
      await server.start();
    });

    it('should return 404 for unknown endpoints', async () => {
      const { status, data } = await httpRequest(
        testPort,
        'GET',
        '/api/v1/unknown'
      );

      expect(status).toBe(404);
      const response = data as { code: string };
      expect(response.code).toBe('NOT_FOUND');
    });
  });
});
