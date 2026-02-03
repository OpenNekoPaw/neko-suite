/**
 * Workflow Integration Example
 *
 * Demonstrates workflow execution and integration with agents.
 */

import {
  createPlatform,
  WorkflowManager,
  createWorkflowTools,
  AgentExecutor,
  ToolRegistry,
} from '@neko/platform';

async function main() {
  const platform = createPlatform();
  const workflowManager = new WorkflowManager();

  try {
    // Register builtin workflows
    console.log('Registering workflows...');

    // Video processing workflow
    workflowManager.registerBuiltin('video-compress', {
      id: 'video-compress',
      name: 'Video Compression',
      type: 'builtin',
      description: 'Compress video to target size or quality',
      inputSchema: {
        type: 'object',
        properties: {
          inputPath: { type: 'string', description: 'Input video path' },
          outputPath: { type: 'string', description: 'Output video path' },
          targetSize: { type: 'number', description: 'Target size in MB' },
          quality: { type: 'string', enum: ['low', 'medium', 'high'] },
        },
        required: ['inputPath', 'outputPath'],
      },
    }, async (input) => {
      console.log('Executing video compression workflow...');
      console.log('Input:', JSON.stringify(input.data, null, 2));

      // Simulate processing
      await new Promise((r) => setTimeout(r, 1000));

      return {
        success: true,
        outputPath: input.data.outputPath,
        originalSize: 100,
        compressedSize: 30,
        compressionRatio: 0.3,
      };
    });

    // Audio extraction workflow
    workflowManager.registerBuiltin('extract-audio', {
      id: 'extract-audio',
      name: 'Audio Extraction',
      type: 'builtin',
      description: 'Extract audio track from video',
      inputSchema: {
        type: 'object',
        properties: {
          videoPath: { type: 'string', description: 'Video file path' },
          outputFormat: { type: 'string', enum: ['mp3', 'wav', 'aac'] },
        },
        required: ['videoPath'],
      },
    }, async (input) => {
      console.log('Executing audio extraction workflow...');

      await new Promise((r) => setTimeout(r, 500));

      return {
        success: true,
        audioPath: input.data.videoPath.replace(/\.\w+$/, '.mp3'),
        duration: 120,
        sampleRate: 44100,
      };
    });

    // Create workflow tools
    const workflowTools = await createWorkflowTools(workflowManager);
    console.log(`Created ${workflowTools.length} workflow tools`);

    // Setup agent with workflow tools
    const toolRegistry = new ToolRegistry();
    workflowTools.forEach((tool) => {
      toolRegistry.register(tool);
      console.log(`  - ${tool.name}`);
    });

    const service = platform.createService();

    const agent = new AgentExecutor({
      service,
      toolRegistry,
      config: {
        name: 'workflow-agent',
        systemPrompt: `You are a video processing assistant.
You have access to workflows for video compression and audio extraction.
Use these workflows to help users process their videos.`,
        tools: toolRegistry.toToolDefinitions(),
        maxIterations: 5,
      },
      onStep: (step) => {
        if (step.type === 'act') {
          console.log('\n[Executing workflows...]');
        }
      },
    });

    // Execute agent with workflow
    console.log('\n=== Starting Agent ===');
    const result = await agent.execute(
      'Compress the video at /videos/raw.mp4 to medium quality and save to /videos/compressed.mp4'
    );

    console.log('\n--- Result ---');
    console.log('Success:', result.success);
    console.log('Response:', result.response);
    console.log('Steps:', result.steps.length);
  } finally {
    platform.dispose();
  }
}

main().catch(console.error);
