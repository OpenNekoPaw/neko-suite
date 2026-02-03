/**
 * MCP Bootstrap
 * MCP 服务器连接和工具注册
 *
 * Platform 层已经注册了 MCP 配置，这里负责：
 * 1. 连接已启用的 MCP 服务器
 * 2. 注册 MCP 工具到 ToolRegistry
 * 3. 记录连接状态到 ConnectionStateManager
 */

import type { Platform } from '@neko/platform';
import { MCPManager } from '@neko/agent';
import type { IToolRegistry, Tool, ToolCategory } from '@neko/agent';
import type { ConnectionStateManager } from '../services/connectionStateManager';

/**
 * MCP 连接结果
 */
export interface MCPConnectResult {
  serverId: string;
  serverName: string;
  success: boolean;
  toolCount: number;
  error?: string;
}

/**
 * 连接已启用的 MCP 服务器
 *
 * Platform.mcp 已包含注册的服务器配置，此函数负责：
 * 1. 遍历已注册的服务器
 * 2. 连接启用的服务器
 * 3. 获取工具列表并注册到 ToolRegistry
 * 4. 记录状态到 ConnectionStateManager
 *
 * @returns 连接结果数组
 */
export async function connectMCPServers(
  platform: Platform,
  mcpManager: MCPManager,
  toolRegistry: IToolRegistry,
  stateManager?: ConnectionStateManager
): Promise<MCPConnectResult[]> {
  const results: MCPConnectResult[] = [];

  // 从 MCPManager 获取已注册的服务器（Platform 已注册）
  const servers = mcpManager.listServers();

  for (const serverConfig of servers) {
    // 跳过禁用的服务器
    if (!serverConfig.enabled) {
      stateManager?.updateState(serverConfig.id, serverConfig.name, 'mcp', 'disconnected');
      continue;
    }

    // 更新状态为连接中
    stateManager?.updateState(serverConfig.id, serverConfig.name, 'mcp', 'connecting');

    try {
      // 连接服务器
      const client = await mcpManager.connect(serverConfig.id);

      if (client && client.isConnected()) {
        // 获取工具列表
        const mcpTools = await client.listTools();

        // 注册工具到 ToolRegistry
        for (const mcpTool of mcpTools) {
          const tool: Tool = {
            name: `mcp_${serverConfig.id}_${mcpTool.name}`,
            description: mcpTool.description || `MCP tool: ${mcpTool.name}`,
            category: 'mcp' as ToolCategory,
            parameters: mcpTool.inputSchema as Record<string, unknown>,
            execute: async (args: Record<string, unknown>) => {
              const result = await mcpManager.callTool(serverConfig.id, mcpTool.name, args);
              return result;
            },
          };
          toolRegistry.register(tool);
        }

        // 更新状态为已连接
        stateManager?.updateState(serverConfig.id, serverConfig.name, 'mcp', 'connected');
        results.push({
          serverId: serverConfig.id,
          serverName: serverConfig.name,
          success: true,
          toolCount: mcpTools.length,
        });
      } else {
        const error = 'Connection failed - client not connected';
        console.warn(`[UniEdit] MCP server ${serverConfig.name} connection failed`);
        stateManager?.updateState(serverConfig.id, serverConfig.name, 'mcp', 'error', error);
        results.push({
          serverId: serverConfig.id,
          serverName: serverConfig.name,
          success: false,
          toolCount: 0,
          error,
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[UniEdit] Failed to connect MCP server ${serverConfig.name}:`, errorMessage);

      // 更新状态为错误
      stateManager?.updateState(serverConfig.id, serverConfig.name, 'mcp', 'error', errorMessage);
      results.push({
        serverId: serverConfig.id,
        serverName: serverConfig.name,
        success: false,
        toolCount: 0,
        error: errorMessage,
      });
    }
  }

  return results;
}
