/**
 * Validation Module
 *
 * Provides input/output validation for LLM interactions
 *
 * @example
 * ```typescript
 * import {
 *   createValidationHooks,
 *   createImageValidator,
 *   createOutputValidator,
 * } from '@neko/agent';
 *
 * // Create validation hooks for agent executor
 * const hooks = createValidationHooks({
 *   imageConstraints: {
 *     maxSizeBytes: 5 * 1024 * 1024,
 *     allowedFormats: ['image/jpeg', 'image/png'],
 *   },
 *   outputConstraints: {
 *     mermaidPreValidate: true,
 *   },
 * });
 *
 * // Or use validators directly
 * const imageValidator = createImageValidator();
 * const outputValidator = createOutputValidator({ mermaidPreValidate: true });
 * ```
 */

// Types
export type {
  ImageConstraints,
  OutputConstraints,
  ValidationHooksOptions,
  ValidationError,
  ValidationWarning,
  ValidationResult,
  ValidationErrorType,
  ImageInfo,
  MermaidValidationResult,
  MermaidBlockInfo,
  MermaidBlockValidationResult,
  JsonBlockInfo,
  JsonBlockValidationResult,
  ValidationResultWithBlocks,
} from './types';

// Constants
export { DEFAULT_IMAGE_CONSTRAINTS, DEFAULT_OUTPUT_CONSTRAINTS } from './types';

// Image Validator
export { ImageValidator, ImageValidationError, createImageValidator } from './image-validator';

// Output Validator
export { OutputValidator, createOutputValidator } from './output-validator';

// Creative table validators
export {
  STORYBOARD_CREATIVE_TABLE_HEADERS,
  STORYBOARD_CREATIVE_TABLE_VALIDATOR_ID,
  validateStoryboardCreativeTableOutput,
} from './creative-table-validator';
export type {
  MarkdownTableSummary,
  StoryboardCreativeTableValidationResult,
} from './creative-table-validator';

// Validation Hooks
export { ValidationHooks, createValidationHooks } from './validation-hooks';

// Re-export specialized components for advanced usage
export {
  MermaidExtractor,
  createMermaidExtractor,
  MermaidValidator,
  createMermaidValidator,
  MermaidBlockChecker,
  createMermaidBlockChecker,
} from './mermaid-validator';
export type {
  IMermaidExtractor,
  IMermaidValidator,
  IMermaidBlockChecker,
  UnclosedBlockPosition,
} from './mermaid-validator';
export {
  JsonExtractor,
  createJsonExtractor,
  JsonSchemaValidator,
  createJsonSchemaValidator,
  validateJsonAgainstSchema,
} from './json-validator';
export type {
  IJsonExtractor,
  IJsonSchemaValidator,
  JsonSchemaValidationResult,
} from './json-validator';
export { LengthValidator, createLengthValidator } from './length-validator';
export type { ILengthValidator, LengthValidationOptions } from './length-validator';

// QA domain types (migrated from agent/src/workflow/qa-types.ts — W1.2)
export { QUALITY_ISSUE_CATEGORIES } from './qa-types';
export type {
  QualityIssue,
  QualityIssueCategory,
  IssueSeverity,
  RemediationAction,
  MediaEvaluation,
  EvalMediaType,
  AudioTechnicalMetrics,
  VideoTechnicalMetrics,
  ConsistencyReport,
  SceneReviewCard,
  SceneVerdict,
  StyleDriftPair,
  CharacterAppearance,
} from './qa-types';

// Remediation Planner
export { RemediationPlanner, createRemediationPlanner } from './remediation-planner';
export type { IRemediationPlanner } from './remediation-planner';

// Consistency Evaluator
export { ConsistencyEvaluator, createConsistencyEvaluator } from './consistency-evaluator';
export type {
  ConsistencyFrameExtractor,
  IClipScorer,
  ConsistencyInput,
  CharacterRef,
  ConsistencyContext,
  ConsistencyEvaluatorDeps,
  ConsistencyLLMService,
  ConsistencyChatModelRef,
} from './consistency-evaluator';

// Media Quality Runtime
export {
  MediaQualityRuntime,
  coerceQualityScore,
  createMediaQualityRuntime,
  detectQualityMediaType,
  extractTextFromContent,
} from './media-quality-runtime';
export type {
  IAudioAnalyzer,
  IFrameExtractor,
  MediaGenerateOptions,
  MediaQualityCheckInput,
  MediaQualityCheckResult,
  MediaQualityEvalOptions,
  MediaQualityGenerator,
  MediaQualityLLMService,
  MediaQualityLogger,
  MediaQualityRuntimeDeps,
  MediaQualitySceneInput,
  MediaQualityChatModelRef,
} from './media-quality-runtime';

// Quality / consistency tool factories
export { createConsistencyCheckTools, createQualityCheckTools } from './quality-check-tools';
export type { ConsistencyCheckToolsDeps, QualityCheckToolsDeps } from './quality-check-tools';

// Quality evidence normalization
export {
  createContinuityEdgeId,
  createNormalizedQualityIssueId,
  mapQualityIssueCategory,
  normalizeQualityConsistencyPayload,
  normalizeQualityIssue,
  normalizeQualityReviewPayload,
  stableHashString,
  stableStringify,
  validateBasicQualityIssue,
} from './quality-evidence-normalizer';
export type {
  BasicQualityIssue,
  BasicQualityIssueCategory,
  NormalizedQualityConsistencyEvidence,
  NormalizedQualityEvidence,
  NormalizedQualitySourceIssue,
  QualityConsistencyNormalizationInput,
  QualityConsistencyReportForNormalization,
  QualityContinuityEdgeCandidate,
  QualityEvaluationForNormalization,
  QualityEvidenceLocation,
  QualityEvidenceRegion,
  QualityEvidenceSceneTimeRange,
  QualityEvidenceSource,
  QualityEvidenceTimeRange,
  QualityEvidenceValidationError,
  QualityEvidenceValidationResult,
  QualityIssueNormalizationDiagnostic,
  QualityReviewNormalizationInput,
  QualityReviewPayloadForNormalization,
  QualityStyleDriftForNormalization,
} from './quality-evidence-normalizer';

// VideoContentIndex foundation
export {
  VIDEO_CONTENT_ANALYZER_PLACEHOLDERS,
  buildVideoContentIndex,
  createVideoContentIndexId,
  createVideoSegmentId,
  validateVideoContentIndex,
} from './video-content-index';
export type {
  AestheticEmotionProfile,
  ConfidenceLevel,
  ContinuityEdge,
  ContinuityEdgeInput,
  ContinuityIssue,
  TemporalProfile,
  VideoContentAnalyzerPlaceholder,
  VideoContentIndex,
  VideoContentIndexBuildResult,
  VideoContentIndexInput,
  VideoContentIndexValidationError,
  VideoContentIndexValidationResult,
  VideoContentSourceKind,
  VideoSegment,
  VideoSegmentBasis,
  VideoSegmentInput,
  VideoTimeRange,
} from './video-content-index';
