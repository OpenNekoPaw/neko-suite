/**
 * Execution Group Types - AI generation task routing
 *
 * Provides types for routing AI generation tasks (image, video, TTS, etc.)
 * to appropriate execution targets (API, Workflow, Local).
 */

/**
 * Execution target type
 */
export type ExecutorType = 'api' | 'workflow' | 'local';

/**
 * Task type for generation tasks
 */
export type ExecutionTaskType =
  | 'image_generation'
  | 'video_generation'
  | 'tts'
  | 'music_generation'
  | 'style_transfer'
  | 'character_generation'
  | 'video_enhancement'
  | 'audio_optimization'
  | 'image_analysis'
  | 'video_analysis';

/**
 * Execution target definition
 */
export interface ExecutionTarget {
  /** Unique target identifier */
  id: string;
  /** Execution type */
  type: ExecutorType;
  /** Provider ID (for api type) */
  providerId?: string;
  /** Model ID (for api type) */
  modelId?: string;
  /** Workflow ID (for workflow type) */
  workflowId?: string;
  /** Display name */
  displayName?: string;
  /** Supported capabilities */
  capabilities?: string[];
  /** Estimated latency in ms */
  estimatedLatency?: number;
  /** Estimated cost per execution */
  estimatedCost?: number;
  /** Quality score (0-1) */
  qualityScore?: number;
  /** Whether this target is enabled */
  enabled?: boolean;
}

/**
 * Execution strategy types
 */
export type ExecutionStrategyType =
  | 'priority'
  | 'round-robin'
  | 'weighted'
  | 'cost-optimal'
  | 'quality-optimal'
  | 'latency-optimal'
  | 'capability-match';

export type ExecutionStrategy =
  | PriorityExecutionStrategy
  | RoundRobinExecutionStrategy
  | WeightedExecutionStrategy
  | CostOptimalExecutionStrategy
  | QualityOptimalExecutionStrategy
  | LatencyOptimalExecutionStrategy
  | CapabilityMatchExecutionStrategy;

export interface PriorityExecutionStrategy {
  type: 'priority';
}

export interface RoundRobinExecutionStrategy {
  type: 'round-robin';
}

export interface WeightedExecutionStrategy {
  type: 'weighted';
  weights: Record<string, number>;
}

export interface CostOptimalExecutionStrategy {
  type: 'cost-optimal';
  maxCost?: number;
}

export interface QualityOptimalExecutionStrategy {
  type: 'quality-optimal';
}

export interface LatencyOptimalExecutionStrategy {
  type: 'latency-optimal';
  maxLatency?: number;
}

export interface CapabilityMatchExecutionStrategy {
  type: 'capability-match';
  requiredCapabilities: string[];
}

/**
 * Fallback trigger types for execution
 */
export type ExecutionFallbackTrigger =
  | 'rate_limit'
  | 'timeout'
  | 'server_error'
  | 'unavailable'
  | 'quota_exceeded'
  | 'content_filter';

/**
 * Fallback configuration for execution group
 */
export interface ExecutionFallbackConfig {
  /** Whether fallback is enabled */
  enabled: boolean;
  /** Maximum number of fallback attempts */
  maxAttempts: number;
  /** Error types that trigger fallback */
  triggerOn: ExecutionFallbackTrigger[];
}

/**
 * Execution group for AI generation task routing
 */
export interface ExecutionGroup {
  /** Unique group identifier */
  id: string;
  /** Display name */
  name: string;
  /** Group description */
  description?: string;
  /** Task type this group handles */
  taskType: ExecutionTaskType;
  /** Execution targets (ordered by priority) */
  targets: ExecutionTarget[];
  /** Routing strategy */
  strategy: ExecutionStrategy;
  /** Fallback configuration */
  fallback: ExecutionFallbackConfig;
  /** Whether this group is enabled */
  enabled: boolean;
}

/**
 * Routing result from ExecutionGroupManager
 */
export interface ExecutionRoutingResult {
  /** Selected target */
  target: ExecutionTarget;
  /** Attempt number (1-based) */
  attempt: number;
  /** Reason for selection */
  reason: string;
}

/**
 * Routing options for route() method
 */
export interface ExecutionRoutingOptions {
  /** Target IDs to exclude from routing */
  excludeTargets?: string[];
  /** Required capabilities for the target */
  requiredCapabilities?: string[];
  /** Preferred execution type */
  preferredType?: ExecutorType;
}

/**
 * Direct target specification
 */
export interface ExecutionTargetSpec {
  /** Provider ID */
  provider?: string;
  /** Model ID */
  model?: string;
  /** Workflow ID */
  workflow?: string;
}

/**
 * Validation failure details
 */
export interface ValidationFailure {
  /** Target ID that failed validation */
  targetId: string;
  /** Error code */
  code: ExecutionErrorCode;
  /** Error message */
  message: string;
}

/**
 * Validation result for a target
 */
export interface ValidationResult {
  /** Whether the target is valid */
  valid: boolean;
  /** Failure details if invalid */
  failure?: ValidationFailure;
}

/**
 * Error codes for execution routing
 */
export type ExecutionErrorCode =
  | 'NO_AVAILABLE_TARGET'
  | 'PROVIDER_NOT_ENABLED'
  | 'MODEL_NOT_ENABLED'
  | 'WORKFLOW_NOT_AVAILABLE'
  | 'CAPABILITY_NOT_SATISFIED'
  | 'LOCAL_SERVICE_UNAVAILABLE'
  | 'GROUP_NOT_FOUND'
  | 'GROUP_DISABLED';

/**
 * Execution routing error with detailed information
 */
export interface ExecutionRoutingError {
  /** Error code */
  code: ExecutionErrorCode;
  /** Error message */
  message: string;
  /** Validation failures for all targets */
  failures?: ValidationFailure[];
}
