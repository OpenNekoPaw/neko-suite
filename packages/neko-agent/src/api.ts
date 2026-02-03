/**
 * NekoAgent API - Exported interface for other extensions
 */
import * as vscode from 'vscode';

// Types
export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

export interface ChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: Tool[];
  systemPrompt?: string;
}

export interface AgentMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  }>;
  toolResults?: Array<{
    id: string;
    result: unknown;
  }>;
}

export interface MCPServerConfig {
  name: string;
  transport: 'stdio' | 'http';
  command?: string;
  args?: string[];
  url?: string;
  enabled: boolean;
}

/**
 * NekoAgent API interface exported to other extensions
 */
export interface NekoAgentAPI {
  /**
   * Send a chat message and get a response
   */
  chat(message: string, options?: ChatOptions): Promise<string>;

  /**
   * Stream a chat response
   */
  chatStream(
    message: string,
    options?: ChatOptions
  ): AsyncIterable<{ type: 'text' | 'tool_call' | 'tool_result'; content: string }>;

  /**
   * Register a tool for the agent to use
   */
  registerTool(tool: Tool): void;

  /**
   * Unregister a tool
   */
  unregisterTool(name: string): void;

  /**
   * Get all registered tools
   */
  getTools(): Tool[];

  /**
   * Events
   */
  events: {
    /**
     * Fired when a message is received
     */
    onDidReceiveMessage: vscode.Event<AgentMessage>;

    /**
     * Fired when a tool is called
     */
    onDidCallTool: vscode.Event<{ name: string; args: Record<string, unknown> }>;
  };

  /**
   * MCP operations
   */
  mcp: {
    /**
     * Connect to an MCP server
     */
    connect(config: MCPServerConfig): Promise<void>;

    /**
     * Disconnect from an MCP server
     */
    disconnect(name: string): Promise<void>;

    /**
     * List connected MCP servers
     */
    listServers(): MCPServerConfig[];
  };
}
