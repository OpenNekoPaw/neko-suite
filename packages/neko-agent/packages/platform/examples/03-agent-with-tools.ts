/**
 * Agent with Tools Example
 *
 * Demonstrates ReAct agent with custom tools for video editing.
 */

import {
  createPlatform,
  AgentExecutor,
  ToolRegistry,
  Tool,
  ToolResult,
  ToolCategory,
} from '@neko/platform';

// Define a custom tool
class GetTimelineInfoTool implements Tool {
  readonly name = 'GetTimelineInfo';
  readonly description = 'Get information about the current video timeline';
  readonly category: ToolCategory = 'project';
  readonly parameters = {
    type: 'object',
    properties: {},
    required: [],
  };

  async execute(): Promise<ToolResult> {
    // Simulate timeline data
    return {
      success: true,
      data: {
        duration: 120000, // 2 minutes
        tracks: [
          { id: 'video-1', type: 'video', clips: 5 },
          { id: 'audio-1', type: 'audio', clips: 3 },
        ],
        currentTime: 30000,
      },
    };
  }
}

class AddEffectTool implements Tool {
  readonly name = 'AddEffect';
  readonly description = 'Add a visual effect to a clip';
  readonly category: ToolCategory = 'project';
  readonly parameters = {
    type: 'object',
    properties: {
      clipId: { type: 'string', description: 'The clip ID' },
      effectType: {
        type: 'string',
        enum: ['fade', 'blur', 'zoom', 'transition'],
        description: 'Type of effect to add',
      },
      duration: { type: 'number', description: 'Effect duration in ms' },
    },
    required: ['clipId', 'effectType'],
  };

  async execute(args: Record<string, unknown>): Promise<ToolResult> {
    console.log(`Adding ${args.effectType} effect to clip ${args.clipId}`);
    return {
      success: true,
      data: {
        effectId: `effect-${Date.now()}`,
        applied: true,
      },
    };
  }
}

async function main() {
  const platform = createPlatform();

  try {
    const service = platform.createService();

    // Register tools
    const toolRegistry = new ToolRegistry();
    toolRegistry.register(new GetTimelineInfoTool());
    toolRegistry.register(new AddEffectTool());

    // Create agent
    const agent = new AgentExecutor({
      service,
      toolRegistry,
      config: {
        name: 'video-editor-agent',
        systemPrompt: `You are a professional video editor assistant.
You can analyze timelines and apply effects to clips.
Always check the timeline first before making changes.`,
        tools: toolRegistry.toToolDefinitions(),
        maxIterations: 5,
      },
      onStep: (step) => {
        console.log(`\n[${step.type.toUpperCase()}]`);
        if (step.content) console.log(step.content);
        if (step.toolCalls) {
          step.toolCalls.forEach((tc) => {
            console.log(`  Tool: ${tc.name}(${JSON.stringify(tc.arguments)})`);
          });
        }
      },
    });

    // Execute agent
    console.log('Starting agent...\n');
    const result = await agent.execute(
      'Check the timeline and add a fade effect to the first video clip'
    );

    console.log('\n--- Agent Complete ---');
    console.log('Success:', result.success);
    console.log('Iterations:', result.iterations);
    console.log('Duration:', result.timing.duration, 'ms');
  } finally {
    platform.dispose();
  }
}

main().catch(console.error);
