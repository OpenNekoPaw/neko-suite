/**
 * Pipeline Bootstrap — Initializes the Pipeline orchestration layer
 *
 * Creates all stage instances with injected dependencies and registers them
 * into the PipelineRegistry. Called during extension activation.
 */

import type { Platform } from '@neko/platform';
import {
  createPipelineExecutor,
  createPipelineRegistry,
  createPipelineResolver,
  createPipelineHookRegistry,
  createReadDocumentStage,
  createParseStoryboardStage,
  createImportStoryboardToCanvasStage,
  createGeneratePromptsStage,
  createBatchGenerateStage,
  createGeneratePilotStage,
  createArrangeOnTimelineStage,
  createQualityGateStage,
  type IPipelineRegistry,
  type PipelineContext,
  type FlowId,
  type PipelineHandle,
  type MediaGenerateOptions,
} from '@neko/agent/pipeline';
import { createConsistencyEvaluator } from '@neko/agent/validation';
import { createPipelineTools } from '../tools/pipelineTools';
import { createQualityCheckTools } from '../tools/qualityCheckTools';
import { createConsistencyCheckTools } from '../tools/consistencyCheckTools';
import { createRunReportTools } from '../tools/runReportTools';
import {
  VSCodeFileReader,
  DocumentReaderAdapter,
  StoryParserAdapter,
  StructuredStoryPlannerAdapter,
  CanvasStoryboardSinkAdapter,
  LLMAnalyzerAdapter,
  PromptOptimizerAdapter,
  MediaGeneratorAdapter,
  TimelineArrangerAdapter,
  EngineAudioAnalyzerAdapter,
  EngineFrameExtractorAdapter,
} from './pipeline-adapters';
import { createDocumentReaderService } from '../services/DocumentReaderService';
import { getLogger } from '../base';

const logger = getLogger('PipelineBootstrap');

export interface PipelineBootstrapResult {
  registry: IPipelineRegistry;
  startPipeline: (
    flowId: FlowId,
    ctx: PipelineContext,
    overrides?: { skipStages?: string[]; globalStyle?: string },
  ) => PipelineHandle;
}

/**
 * Initialize the Pipeline orchestration layer
 *
 * @param platform - Platform instance for media generation
 * @param toolRegistry - Tool registry to register pipeline tools
 */
export function bootstrapPipeline(
  platform: Platform,
  toolRegistry: { register: (tool: unknown) => void },
): PipelineBootstrapResult {
  // Create core infrastructure
  const hookRegistry = createPipelineHookRegistry();
  const registry = createPipelineRegistry();
  const executor = createPipelineExecutor(hookRegistry);
  const resolver = createPipelineResolver(registry, executor);

  // Create dependency adapters
  const fileReader = new VSCodeFileReader();
  const documentReaderService = createDocumentReaderService();
  const documentReader = new DocumentReaderAdapter(documentReaderService);
  const storyParser = new StoryParserAdapter();
  const structuredStoryPlanner = new StructuredStoryPlannerAdapter();
  const storyboardCanvasSink = new CanvasStoryboardSinkAdapter();
  const llmAnalyzer = new LLMAnalyzerAdapter();
  const promptOptimizer = new PromptOptimizerAdapter();

  // MediaGenerator adapter — wraps platform media generation service
  const mediaGenerator = new MediaGeneratorAdapter(
    async (prompt: string, options: MediaGenerateOptions) => {
      // Determine generation type
      const genType = options.type === 'image' ? 'text-to-image' : 'text-to-video';

      // Use platform media generation
      const mediaService = platform.media;
      if (!mediaService) {
        throw new Error('Media generation service not available');
      }

      if (genType === 'text-to-image') {
        const task = await mediaService.generateImage({
          prompt,
          width: 1024,
          height: 1024,
        });
        // Wait for completion and get output path
        const completed = await mediaService.waitForTask(task.id, 120_000);
        const output = completed.outputs?.[0];
        if (!output?.url) {
          throw new Error('Image generation produced no output');
        }
        return { path: output.url };
      } else {
        const task = await mediaService.generateVideo({
          prompt,
          duration: options.duration,
          resolution: options.resolution,
        });
        const completed = await mediaService.waitForTask(task.id, 300_000);
        const output = completed.outputs?.[0];
        if (!output?.url) {
          throw new Error('Video generation produced no output');
        }
        return { path: output.url, duration: output.duration };
      }
    },
  );

  const timelineArranger = new TimelineArrangerAdapter();

  // Register all 6 stages
  registry.registerStage(createReadDocumentStage({ fileReader, documentReader }));
  registry.registerStage(
    createParseStoryboardStage({ storyParser, structuredStoryPlanner, llmAnalyzer }),
  );
  registry.registerStage(createImportStoryboardToCanvasStage({ storyboardCanvasSink }));
  registry.registerStage(createGeneratePromptsStage({ promptOptimizer }));
  registry.registerStage(createGeneratePilotStage({ mediaGenerator }));
  registry.registerStage(createBatchGenerateStage({ mediaGenerator }));
  registry.registerStage(createArrangeOnTimelineStage({ timelineArranger }));

  // Register quality gate stage (opt-in via stageParams.qualityGate.enabled)
  registry.registerStage(
    createQualityGateStage({
      evaluateConsistency: async (inputs, globalStyle) => {
        const evaluator = createConsistencyEvaluator({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any -- cross-package type boundary
          createService: () => platform.createService() as any,
        });
        return evaluator.evaluate(inputs, { globalStyle });
      },
    }),
  );

  // Create the startPipeline function for pipeline tools
  const startPipeline = (
    flowId: FlowId,
    ctx: PipelineContext,
    overrides?: { skipStages?: string[]; globalStyle?: string },
  ): PipelineHandle => {
    return resolver.startFlow(flowId, ctx, {
      skipStages: overrides?.skipStages,
      globalStyle: overrides?.globalStyle,
    });
  };

  // Register quality check tools (multimodal LLM evaluation + audio/video analysis)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- cross-package type boundary
  const qaTools = createQualityCheckTools({
    createService: () => platform.createService() as any,
    mediaGenerator,
    audioAnalyzer: new EngineAudioAnalyzerAdapter(),
    frameExtractor: new EngineFrameExtractorAdapter(),
  });
  for (const tool of qaTools) {
    toolRegistry.register(tool);
  }

  // Register consistency check tools (cross-scene evaluation)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- cross-package type boundary
  const consistencyTools = createConsistencyCheckTools({
    createService: () => platform.createService() as any,
  });
  for (const tool of consistencyTools) {
    toolRegistry.register(tool);
  }

  // Register pipeline tools into tool registry
  const pipelineTools = createPipelineTools({ startPipeline });
  for (const tool of pipelineTools) {
    toolRegistry.register(tool);
  }

  // Register run report query tools (reads from in-memory completedPipelines)
  const reportTools = createRunReportTools();
  for (const tool of reportTools) {
    toolRegistry.register(tool);
  }

  logger.info('Pipeline orchestration layer initialized', {
    stages: registry.listStages(),
    flows: registry.listFlows().map((flow: { id: string }) => flow.id),
    tools: [...pipelineTools, ...reportTools].map((t: { name: string }) => t.name),
  });

  return { registry, startPipeline };
}
