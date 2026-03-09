/**
 * MCP Tool - Wraps MCP tools as agent tools
 */

import type {
  Tool,
  ToolResult,
  ToolCategory,
  MCPToolDefinition,
  ToolDefinition,
} from '@neko/shared';
import { MCPManager } from './mcp-manager';
import { getLogger } from '../utils/logger';

const logger = getLogger('MCPTool');

/**
 * MCP tool wrapper - wraps an MCP tool as an agent tool
 */
export class MCPTool implements Tool {
  readonly name: string;
  readonly description: string;
  readonly category: ToolCategory = 'mcp';
  readonly parameters: Record<string, unknown>;

  private serverId: string;
  private mcpManager: MCPManager;
  private originalName: string;

  constructor(mcpManager: MCPManager, serverId: string, mcpTool: MCPToolDefinition) {
    this.mcpManager = mcpManager;
    this.serverId = serverId;
    this.originalName = mcpTool.name;

    // Prefix tool name with server ID to avoid conflicts
    // Use double underscore to match permission system's mcp__ prefix convention
    this.name = `mcp__${serverId}__${mcpTool.name}`;
    this.description = mcpTool.description || `MCP tool from ${serverId}`;
    this.parameters = mcpTool.inputSchema || {};
  }

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    const result = await this.mcpManager.callTool(this.serverId, this.originalName, args);

    return {
      success: result.success,
      data: result.data,
      error: result.error,
    };
  }

  toDefinition(): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: this.parameters,
      },
    };
  }
}

/**
 * Create MCPTool instances from MCP server tools
 */
export async function createMCPTools(mcpManager: MCPManager, serverId: string): Promise<MCPTool[]> {
  const client = mcpManager.getClient(serverId);
  if (!client?.isConnected()) {
    return [];
  }

  try {
    const mcpTools = await client.listTools();
    return mcpTools.map((tool) => new MCPTool(mcpManager, serverId, tool));
  } catch (error) {
    logger.error('Failed to create MCP tools', { serverId, error });
    return [];
  }
}

/**
 * Create all MCP tools from all connected servers
 */
export async function createAllMCPTools(mcpManager: MCPManager): Promise<MCPTool[]> {
  const tools: MCPTool[] = [];

  const allTools = await mcpManager.getAllTools();
  for (const tool of allTools) {
    tools.push(
      new MCPTool(mcpManager, tool.serverId, {
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      }),
    );
  }

  return tools;
}
