/**
 * Enhanced Agent Example
 *
 * Demonstrates advanced agent features: multi-model, retry, and memory.
 */

import {
  createPlatform,
  createEnhancedAgent,
  ToolRegistry,
  InMemorySessionMemory,
  ConversationCompressor,
  Tool,
  ToolResult,
  ToolCategory,
} from '@neko/platform';

// Context manager using ConversationCompressor
const contextCompressor = new ConversationCompressor({
  triggers: {
    tokenThreshold: 4096,
    turnThreshold: 20,
  },
});

// Sample tool
class AnalyzeVideoTool implements Tool {
  readonly name = 'AnalyzeVideo';
  readonly description = 'Analyze video content and return insights';
  readonly category: ToolCategory = 'analysis';
  readonly parameters = {
    type: 'object',
    properties: {
      videoId: { type: 'string', description: 'Video ID to analyze' },
      aspects: {
        type: 'array',
        items: { type: 'string' },
        description: 'Aspects to analyze: quality, motion, audio, color',
      },
    },
    required: ['videoId'],
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    // Simulate analysis
    await new Promise((r) => setTimeout(r, 100));
    return {
      success: true,
      data: {
        videoId: args.videoId,
        duration: 120,
        resolution: '1920x1080',
        fps: 30,
        quality: 'high',
        motionScore: 0.7,
        audioLevels: { peak: -3, average: -18 },
      },
    };
  }
}

async function main() {
  const platform = createPlatform();

  try {
    const service = platform.createService();

    // Setup tool registry
    const toolRegistry = new ToolRegistry();
    toolRegistry.register(new AnalyzeVideoTool());

    // Setup memory
    const sessionMemory = new InMemorySessionMemory('enhanced-session');
    // Create enhanced agent
    const agent = createEnhancedAgent({
      service,
      toolRegistry,
      config: {
        name: 'enhanced-video-agent',
        systemPrompt: `You are an advanced video editing AI assistant.
You can analyze videos and provide professional recommendations.
Always be thorough in your analysis.`,
        tools: toolRegistry.toToolDefinitions(),
        maxIterations: 10,
      },

      // Multi-model: use different models for different purposes
      multiModel: {
        primaryModel: 'gpt-4',
        purposeModels: {
          reasoning: 'gpt-4',
          coding: 'gpt-4-turbo',
          analysis: 'gpt-4',
          summarization: 'gpt-3.5-turbo',
          creative: 'gpt-4',
        },
      },

      // Tool retry policy
      toolRetryPolicy: {
        maxRetries: 3,
        backoffStrategy: {
          type: 'exponential',
          initialDelayMs: 1000,
          multiplier: 2,
          maxDelayMs: 10000,
        },
        retryableCategories: ['timeout', 'rate_limit', 'server', 'network'],
      },

      // Model fallback
      modelFallbackPolicy: {
        enabled: true,
        fallbackModels: ['gpt-3.5-turbo', 'claude-3-sonnet'],
        maxFallbacks: 2,
      },

      // Memory integration
      sessionMemory,
      contextManager: contextCompressor,

      // Callbacks
      onStep: (step: { type: string; content?: string }) => {
        console.log(`\n[${step.type.toUpperCase()}] ${new Date().toISOString()}`);
        if (step.content) {
          console.log(step.content.substring(0, 200) + (step.content.length > 200 ? '...' : ''));
        }
      },
      onStateChange: (state: string) => {
        console.log(`State: ${state}`);
      },
      onRetry: (error: Error, attempt: number) => {
        console.log(`Retry attempt ${attempt}: ${error.message}`);
      },
      onModelSwitch: (from: string, to: string, reason: string) => {
        console.log(`Model switch: ${from} -> ${to} (${reason})`);
      },
    });

    // First interaction
    console.log('=== First Query ===');
    let result = await agent.execute('Analyze video-001 and tell me about its quality');

    console.log('\n--- Result ---');
    console.log('Success:', result.success);
    console.log('Response:', result.response.substring(0, 300));

    // Second interaction (uses session memory)
    console.log('\n=== Second Query (with context) ===');
    result = await agent.execute('Based on the analysis, what improvements would you suggest?');

    console.log('\n--- Result ---');
    console.log('Success:', result.success);
    console.log('Response:', result.response.substring(0, 300));

    // Check session memory
    const history = await sessionMemory.getHistory();
    console.log('\n--- Session History ---');
    console.log('Messages in history:', history.length);
  } finally {
    platform.dispose();
  }
}

main().catch(console.error);
