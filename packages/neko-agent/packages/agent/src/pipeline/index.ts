/**
 * Pipeline Module — L2 orchestration layer for creative workflows
 */

// Types
export type {
  StageType,
  GateType,
  IPipelineStage,
  IParallelStage,
  IReactiveStage,
  ParallelTask,
  ParallelTaskResult,
  EvalResult,
  StoryboardScene,
  PipelineContext,
  FlowId,
  StageHookConfig,
  PipelineConfig,
  PipelineEvent,
  PipelineHandle,
  IPipelineExecutor,
  IPipelineRegistry,
} from './types';

// Executor
export { PipelineExecutor, createPipelineExecutor } from './pipeline-executor';

// Registry
export { PipelineRegistry, createPipelineRegistry } from './pipeline-registry';

// Resolver
export { PipelineResolver, createPipelineResolver } from './pipeline-resolver';

// Stages
export { createReadDocumentStage } from './stages/read-document';
export type { IDocumentReader, IFileReader, ReadDocumentStageDeps } from './stages/read-document';

export { createParseStoryboardStage } from './stages/parse-storyboard';
export type {
  IStoryParser,
  ILLMAnalyzer,
  ParseStoryboardStageDeps,
} from './stages/parse-storyboard';

export { createGeneratePromptsStage } from './stages/generate-prompts';
export type { IPromptOptimizer, GeneratePromptsStageDeps } from './stages/generate-prompts';

export { createBatchGenerateStage } from './stages/batch-generate';
export type {
  IMediaGenerator,
  MediaGenerateOptions,
  BatchGenerateStageDeps,
} from './stages/batch-generate';

export { createArrangeOnTimelineStage } from './stages/arrange-on-timeline';
export type { ITimelineArranger, ArrangeOnTimelineStageDeps } from './stages/arrange-on-timeline';

export { createGeneratePilotStage } from './stages/generate-pilot';
export type { GeneratePilotStageDeps } from './stages/generate-pilot';

// Hook Registry
export { PipelineHookRegistry, createPipelineHookRegistry } from './hook-registry';
export type { HookHandler } from './hook-registry';
