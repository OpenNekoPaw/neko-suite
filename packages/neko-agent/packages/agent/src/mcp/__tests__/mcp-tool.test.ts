/**
 * MCPTool Unit Tests — description truncation
 */

import { describe, it, expect, vi } from 'vitest';
import { MCPTool } from '../mcp-tool';
import type { MCPToolDefinition } from '@neko/shared';
import type { MCPManager } from '../mcp-manager';

// Mock logger
vi.mock('../../utils/logger', () => ({
  getLogger: vi.fn(() => ({
    error: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}));

function createMockManager(): MCPManager {
  return {
    callTool: vi.fn().mockResolvedValue({ success: true, data: 'ok' }),
  } as unknown as MCPManager;
}

describe('MCPTool', () => {
  it('should preserve short descriptions unchanged', () => {
    const tool: MCPToolDefinition = {
      name: 'myTool',
      description: 'A short description',
      inputSchema: { type: 'object' },
    };

    const mcpTool = new MCPTool(createMockManager(), 'test-server', tool);

    expect(mcpTool.description).toBe('A short description');
  });

  it('should truncate descriptions exceeding 2048 characters', () => {
    const longDesc = 'x'.repeat(3000);
    const tool: MCPToolDefinition = {
      name: 'myTool',
      description: longDesc,
      inputSchema: { type: 'object' },
    };

    const mcpTool = new MCPTool(createMockManager(), 'test-server', tool);

    expect(mcpTool.description.length).toBe(2048);
    expect(mcpTool.description.endsWith('...')).toBe(true);
  });

  it('should use fallback description when none provided', () => {
    const tool: MCPToolDefinition = {
      name: 'myTool',
      description: '',
      inputSchema: { type: 'object' },
    };

    const mcpTool = new MCPTool(createMockManager(), 'test-server', tool);

    expect(mcpTool.description).toBe('MCP tool from test-server');
  });

  it('should prefix tool name with server ID', () => {
    const tool: MCPToolDefinition = {
      name: 'read_file',
      description: 'Read a file',
      inputSchema: { type: 'object' },
    };

    const mcpTool = new MCPTool(createMockManager(), 'my-server', tool);

    expect(mcpTool.name).toBe('mcp__my-server__read_file');
  });

  it('should keep exactly 2048 chars when description is exactly 2048', () => {
    const exactDesc = 'y'.repeat(2048);
    const tool: MCPToolDefinition = {
      name: 'myTool',
      description: exactDesc,
      inputSchema: { type: 'object' },
    };

    const mcpTool = new MCPTool(createMockManager(), 'test-server', tool);

    expect(mcpTool.description.length).toBe(2048);
    expect(mcpTool.description).toBe(exactDesc); // No truncation needed
  });
});
