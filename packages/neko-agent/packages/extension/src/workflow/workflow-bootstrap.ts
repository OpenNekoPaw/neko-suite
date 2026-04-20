/**
 * Pipeline Bootstrap — Initializes the Pipeline orchestration layer
 *
 * Creates all stage instances with injected dependencies and registers them
 * into the WorkflowRegistry. Called during extension activation.
 */

import type { Platform } from '@neko/platform';
import {
  createWorkflowExecutor,
  createWorkflowRegistry,
  createWorkflowResolver,
  createWorkflowHookRegistry,
  createReadDocumentStage,
  createParseStoryboardStage,
  createImportStoryboardToCanvasStage,
  createGeneratePromptsStage,
  createBatchGenerateStage,
  createGeneratePilotStage,
  createArrangeOnTimelineStage,
  createQualityGateStage,
  type IWorkflowRegistry,
  type WorkflowContext,
  type FlowId,
  type WorkflowHandle,
  type MediaGenerateOptions,
} from '@neko/agent/workflow';
import { createConsistencyEvaluator } from '@neko/agent/validation';
import { createWorkflowTools } from '../tools/pipelineTools';
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
} from './workflow-adapters';
import { createDocumentReaderService } from '../services/DocumentReaderService';
import { getLogger } from '../base';

const logger = getLogger('WorkflowBootstrap');

export interface WorkflowBootstrapResult {
  registry: IWorkflowRegistry;
  startPipeline: (
    flowId: FlowId,
    ctx: WorkflowContext,
    overrides?: { skipStages?: string[]; globalStyle?: string },
  ) => WorkflowHandle;
}

/**
 * Initialize the Pipeline orchestration layer
 *
 * @param platform - Platform instance for media generation
 * @param toolRegistry - Tool registry to register pipeline tools
 */
export function bootstrapWorkflow(
  platform: Platform,
  toolRegistry: { register: (tool: unknown) => void },
): WorkflowBootstrapResult {
  // Create core infrastructure
  const hookRegistry = createWorkflowHookRegistry();
  const registry = createWorkflowRegistry();
  const executor = createWorkflowExecutor(hookRegistry);
  const resolver = createWorkflowResolver(registry, executor);

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

      // Phase 5.4 — split resolved reference paths into primary +
      // additional IP-Adapter refs.  When the list is empty this
      // behaves exactly as pre-chain generation (no reference fields
      // set at all).
      const refPaths = options.referenceImagePaths ?? [];
      const primaryRef = refPaths[0];
      const extraRefs = refPaths.slice(1);

      if (genType === 'text-to-image') {
        const task = await mediaService.generateImage({
          prompt,
          width: 1024,
          height: 1024,
          ...(primaryRef !== undefined && { referenceImageUrl: primaryRef }),
          ...(extraRefs.length > 0 && {
            ipAdapterRefs: extraRefs.map((url) => ({ url, weight: 1 })),
          }),
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
          ...(primaryRef !== undefined && { referenceImageUrl: primaryRef }),
          ...(extraRefs.length > 0 && {
            referenceImages: extraRefs.map((url) => ({ url, weight: 1 })),
          }),
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
  registry.registerStage(
    createBatchGenerateStage({
      mediaGenerator,
      // Default shotId → path resolver.  Lookup order:
      //   1. Pre-rendered anchor frames from the `renderEngine` stage
      //      (Phase 5.4d — puppet/scene output that isn't an AI task).
      //   2. Task index → generatedPaths from this batch (MVP fallback).
      // Phase 5.4b's in-batch deferred map already handles the
      // "dependent shot waits for anchor AI task" case ahead of this.
      resolveReferencePath: (shotId, ctx) => {
        const rendered = ctx.renderedAnchorPaths?.[shotId];
        if (rendered && rendered.length > 0) {
          const first = rendered[0];
          if (typeof first === 'string' && first.length > 0) return first;
        }
        const taskIds = ctx.taskIds ?? [];
        const idx = taskIds.indexOf(shotId);
        if (idx < 0) return undefined;
        const paths = ctx.generatedPaths ?? [];
        const path = paths[idx];
        return typeof path === 'string' && path.length > 0 ? path : undefined;
      },
    }),
  );
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
    ctx: WorkflowContext,
    overrides?: {
      skipStages?: string[];
      globalStyle?: string;
      userCheckpoints?: string[];
    },
  ): WorkflowHandle => {
    return resolver.startFlow(flowId, ctx, {
      skipStages: overrides?.skipStages,
      globalStyle: overrides?.globalStyle,
      ...(overrides?.userCheckpoints !== undefined && {
        userCheckpoints: overrides.userCheckpoints,
      }),
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
  const pipelineTools = createWorkflowTools({ startPipeline });
  for (const tool of pipelineTools) {
    toolRegistry.register(tool);
  }

  // Register run report query tools (reads from in-memory completedWorkflows)
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
