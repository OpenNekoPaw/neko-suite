/**
 * MCP Integration Example
 *
 * Demonstrates connecting to MCP servers and using their tools.
 */

import {
  createPlatform,
  MCPManager,
  createAllMCPTools,
  AgentExecutor,
  ToolRegistry,
} from '@uniedit/platform';

async function main() {
  const platform = createPlatform();
  const mcpManager = new MCPManager();

  try {
    // Connect to MCP servers
    console.log('Connecting to MCP servers...');

    // Example: Connect to a file system MCP server
    await mcpManager.connectServer('filesystem', {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@anthropic/mcp-server-filesystem', '/tmp'],
    });

    // Example: Connect to an HTTP MCP server
    // await mcpManager.connectServer('remote-tools', {
    //   transport: 'http',
    //   url: 'http://localhost:3000/mcp',
    // });

    // Get all tools from MCP servers
    const mcpTools = await createAllMCPTools(mcpManager);
    console.log(`Loaded ${mcpTools.length} tools from MCP servers`);

    // Create tool registry and register MCP tools
    const toolRegistry = new ToolRegistry();
    mcpTools.forEach((tool) => {
      toolRegistry.register(tool);
      console.log(`  - ${tool.name}: ${tool.description}`);
    });

    // Create service and agent
    const service = platform.createService();

    const agent = new AgentExecutor({
      service,
      toolRegistry,
      config: {
        name: 'mcp-agent',
        systemPrompt: `You are a helpful assistant with access to external tools via MCP.
Use the available tools to help complete tasks.`,
        tools: toolRegistry.toToolDefinitions(),
        maxIterations: 5,
      },
      onStep: (step) => {
        if (step.type === 'act' && step.toolCalls) {
          step.toolCalls.forEach((tc) => {
            console.log(`Calling MCP tool: ${tc.name}`);
          });
        }
      },
    });

    // Execute with MCP tools
    const result = await agent.execute('List the files in the /tmp directory');

    console.log('\n--- Result ---');
    console.log('Success:', result.success);
    console.log('Response:', result.response);
  } finally {
    // Disconnect MCP servers
    await mcpManager.disconnectAll();
    platform.dispose();
  }
}

main().catch(console.error);
