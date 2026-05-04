import type { MCPServerConfig, Tool } from '@neko/shared';
import { createAllMCPTools } from './mcp-tool';
import type { MCPToolDiscoveryManager } from './mcp-tool';

export interface MCPRuntimeToolRegistry {
  register(tool: Tool): void;
}

export interface MCPRuntimeManager extends MCPToolDiscoveryManager {
  listServers(): MCPServerConfig[];
  connect(serverId: string): Promise<unknown>;
}

export interface MCPRuntimeBootstrapLogger {
  info(message: string, details?: unknown): void;
  error(message: string, details?: unknown): void;
}

export interface MCPRuntimeBootstrapOptions {
  readonly mcpManager: MCPRuntimeManager;
  readonly toolRegistry: MCPRuntimeToolRegistry;
  readonly logger?: MCPRuntimeBootstrapLogger;
  readonly createTools?: (mcpManager: MCPRuntimeManager) => Promise<readonly Tool[]>;
}

export interface MCPRuntimeConnectionFailure {
  readonly id: string;
  readonly name: string;
  readonly error: string;
}

export interface MCPRuntimeBootstrapResult {
  readonly connectedServerIds: readonly string[];
  readonly failedServers: readonly MCPRuntimeConnectionFailure[];
  readonly registeredToolCount: number;
}

export async function connectMCPServersRuntime(
  options: MCPRuntimeBootstrapOptions,
): Promise<MCPRuntimeBootstrapResult> {
  const connectedServerIds: string[] = [];
  const failedServers: MCPRuntimeConnectionFailure[] = [];
  const servers = options.mcpManager.listServers();

  for (const server of servers) {
    try {
      await options.mcpManager.connect(server.id);
      connectedServerIds.push(server.id);
      options.logger?.info(`Connected to MCP server: ${server.name}`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      failedServers.push({
        id: server.id,
        name: server.name,
        error: errorMessage,
      });
      options.logger?.error(`Failed to connect to MCP server ${server.name}:`, error);
    }
  }

  const createTools = options.createTools ?? createAllMCPTools;
  const tools = await createTools(options.mcpManager);
  for (const tool of tools) {
    options.toolRegistry.register(tool);
  }

  return {
    connectedServerIds,
    failedServers,
    registeredToolCount: tools.length,
  };
}
