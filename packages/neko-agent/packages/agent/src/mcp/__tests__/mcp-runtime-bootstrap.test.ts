import { describe, expect, it, vi } from 'vitest';
import type { IMCPClient, MCPServerConfig, Tool } from '@neko/shared';
import { MCPManager } from '../mcp-manager';
import { connectMCPServersRuntime } from '../mcp-runtime-bootstrap';

function createServer(overrides: Partial<MCPServerConfig> = {}): MCPServerConfig {
  return {
    id: 'server-a',
    name: 'Server A',
    description: 'Test MCP server',
    category: 'development',
    transport: 'stdio',
    command: 'test-command',
    enabled: true,
    ...overrides,
  };
}

function createConnectedClient(serverId: string): IMCPClient {
  return {
    serverId,
    connect: vi.fn(),
    disconnect: vi.fn(),
    isConnected: () => true,
    listTools: vi.fn(async () => []),
    callTool: vi.fn(async () => ({ content: [] })),
    listResources: vi.fn(async () => []),
    readResource: vi.fn(async () => ''),
    listPrompts: vi.fn(async () => []),
    getPrompt: vi.fn(async () => ({ messages: [] })),
  };
}

function createTool(name: string): Tool {
  return {
    name,
    description: 'Test tool',
    category: 'mcp',
    parameters: {
      type: 'object',
      properties: {},
    },
    execute: vi.fn(async () => ({ success: true })),
  };
}

describe('connectMCPServersRuntime', () => {
  it('connects registered servers, updates state, and registers MCP tools', async () => {
    const mcpManager = new MCPManager();
    mcpManager.register(createServer({ id: 'server-a', name: 'Server A' }));
    mcpManager.register(createServer({ id: 'server-b', name: 'Server B' }));

    const connect = vi
      .spyOn(mcpManager, 'connect')
      .mockImplementation(async (serverId) => createConnectedClient(serverId));
    const tool = createTool('mcp__server-a__search');
    const connectionState = { updateState: vi.fn() };
    const toolRegistry = { register: vi.fn() };
    const createTools = vi.fn(async () => [tool]);

    const result = await connectMCPServersRuntime({
      mcpManager,
      toolRegistry,
      connectionState,
      createTools,
    });

    expect(connect).toHaveBeenCalledTimes(2);
    expect(connect).toHaveBeenNthCalledWith(1, 'server-a');
    expect(connect).toHaveBeenNthCalledWith(2, 'server-b');
    expect(connectionState.updateState).toHaveBeenCalledWith(
      'server-a',
      'Server A',
      'mcp',
      'connected',
    );
    expect(connectionState.updateState).toHaveBeenCalledWith(
      'server-b',
      'Server B',
      'mcp',
      'connected',
    );
    expect(createTools).toHaveBeenCalledWith(mcpManager);
    expect(toolRegistry.register).toHaveBeenCalledWith(tool);
    expect(result).toEqual({
      connectedServerIds: ['server-a', 'server-b'],
      failedServers: [],
      registeredToolCount: 1,
    });
  });

  it('keeps connecting remaining servers and registers tools after failures', async () => {
    const events: string[] = [];
    const mcpManager = new MCPManager();
    mcpManager.register(createServer({ id: 'server-a', name: 'Server A' }));
    mcpManager.register(createServer({ id: 'server-b', name: 'Server B' }));

    vi.spyOn(mcpManager, 'connect').mockImplementation(async (serverId) => {
      events.push(`connect:${serverId}`);
      if (serverId === 'server-b') {
        throw new Error('connection refused');
      }
      return createConnectedClient(serverId);
    });

    const connectionState = { updateState: vi.fn() };
    const toolRegistry = { register: vi.fn() };
    const createTools = vi.fn(async () => {
      events.push('createTools');
      return [createTool('mcp__server-a__search')];
    });

    const result = await connectMCPServersRuntime({
      mcpManager,
      toolRegistry,
      connectionState,
      createTools,
    });

    expect(events).toEqual(['connect:server-a', 'connect:server-b', 'createTools']);
    expect(connectionState.updateState).toHaveBeenCalledWith(
      'server-a',
      'Server A',
      'mcp',
      'connected',
    );
    expect(connectionState.updateState).toHaveBeenCalledWith(
      'server-b',
      'Server B',
      'mcp',
      'error',
      'connection refused',
    );
    expect(toolRegistry.register).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      connectedServerIds: ['server-a'],
      failedServers: [
        {
          id: 'server-b',
          name: 'Server B',
          error: 'connection refused',
        },
      ],
      registeredToolCount: 1,
    });
  });
});
