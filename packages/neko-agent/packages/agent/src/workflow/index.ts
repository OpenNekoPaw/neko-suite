/**
 * Pipeline Module — L2 orchestration layer for creative workflows
 */

// Types
export type {
  StageType,
  GateType,
  IWorkflowStage,
  IParallelStage,
  IReactiveStage,
  ParallelTask,
  ParallelTaskResult,
  EvalResult,
  StoryboardScene,
  WorkflowContext,
  FlowId,
  StageHookConfig,
  WorkflowConfig,
  WorkflowEvent,
  WorkflowHandle,
  IWorkflowExecutor,
  IWorkflowRegistry,
  StageRecord,
  SceneSummary,
  WorkflowRunReport,
} from './types';

// Executor
export { WorkflowExecutor, createWorkflowExecutor } from './workflow-executor';

// Registry
export { WorkflowRegistry, createWorkflowRegistry } from './workflow-registry';

// Resolver
export { WorkflowResolver, createWorkflowResolver } from './workflow-resolver';

// Stages
export { createReadDocumentStage } from './stages/read-document';
export type { IDocumentReader, IFileReader, ReadDocumentStageDeps } from './stages/read-document';

export { createParseStoryboardStage } from './stages/parse-storyboard';
export type {
  IStoryParser,
  IStructuredStoryPlanner,
  ILLMAnalyzer,
  ParseStoryboardStageDeps,
} from './stages/parse-storyboard';

export { createImportStoryboardToCanvasStage } from './stages/import-storyboard-to-canvas';
export type {
  IStoryboardCanvasSink,
  ImportStoryboardToCanvasStageDeps,
} from './stages/import-storyboard-to-canvas';

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

export { createQualityGateStage } from './stages/quality-gate';
export type { QualityGateStageDeps, QualityGateInput } from './stages/quality-gate';

// Hook Registry
export { WorkflowHookRegistry, createWorkflowHookRegistry } from './hook-registry';
export type { HookHandler } from './hook-registry';

// Run Report
export {
  collectRunReport,
  createReportCollector,
  type ReportCollector,
} from './run-report-collector';

// QA Types
export type {
  SceneVerdict,
  SceneReviewCard,
  GatePreviewData,
  SceneDiagnostic,
  DiagnosticsReport,
  StyleDriftPair,
  CharacterAppearance,
  ConsistencyReport,
  EvalMediaType,
  IssueSeverity,
  QualityIssueCategory,
  QualityIssue,
  RemediationActionType,
  RemediationAction,
  MediaEvaluation,
  AudioTechnicalMetrics,
  VideoTechnicalMetrics,
} from './qa-types';
export { QUALITY_ISSUE_CATEGORIES } from './qa-types';
