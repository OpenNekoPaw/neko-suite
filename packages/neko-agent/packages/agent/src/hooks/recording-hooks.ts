/**
 * Recording Hooks - Records agent execution for debugging and replay
 *
 * Provides:
 * - Step-by-step execution recording
 * - JSON export/import
 * - Replay capability
 */

import type {
  AgentContext,
  AgentResult,
  AgentStep,
  ExecutorHooks,
  ToolCallInfo,
  ToolResultWithMeta,
  ToolResult,
} from '@neko/shared';

/**
 * Recording configuration
 */
export interface RecordingConfig {
  /** Whether to record tool arguments */
  recordToolArgs?: boolean;
  /** Whether to record tool results */
  recordToolResults?: boolean;
  /** Whether to record thinking content */
  recordThinking?: boolean;
  /** Maximum steps to record (0 = unlimited) */
  maxSteps?: number;
  /** Whether to include timestamps */
  includeTimestamps?: boolean;
}

/**
 * Recorded step with additional metadata
 */
export interface RecordedStep extends AgentStep {
  /** Step index */
  index: number;
  /** Duration in ms */
  duration?: number;
  /** Memory usage at this step */
  memoryUsage?: number;
}

/**
 * Agent recording
 */
export interface AgentRecording {
  /** Unique session ID */
  sessionId: string;
  /** Agent name */
  agentName?: string;
  /** Recording start time */
  startTime: number;
  /** Recording end time */
  endTime?: number;
  /** Initial input */
  input: string;
  /** Final response */
  response?: string;
  /** Whether execution succeeded */
  success?: boolean;
  /** Recorded steps */
  steps: RecordedStep[];
  /** Recording metadata */
  metadata: Record<string, unknown>;
  /** Recording config used */
  config: RecordingConfig;
}

/**
 * Replay options
 */
export interface ReplayOptions {
  /** Delay between steps in ms */
  stepDelay?: number;
  /** Start from step index */
  startFromStep?: number;
  /** End at step index */
  endAtStep?: number;
  /** Callback for each step */
  onStep?: (step: RecordedStep) => void;
}

/**
 * Default recording config
 */
export const DEFAULT_RECORDING_CONFIG: RecordingConfig = {
  recordToolArgs: true,
  recordToolResults: true,
  recordThinking: true,
  maxSteps: 0,
  includeTimestamps: true,
};

/**
 * Recording hooks implementation
 */
export class RecordingHooks implements ExecutorHooks {
  name = 'recording';

  private config: RecordingConfig;
  private recording: AgentRecording | null = null;
  private stepStartTime: number = 0;
  private stepIndex: number = 0;

  constructor(config: Partial<RecordingConfig> = {}) {
    this.config = { ...DEFAULT_RECORDING_CONFIG, ...config };
  }

  /**
   * Get recording configuration
   */
  getConfig(): RecordingConfig {
    return { ...this.config };
  }

  /**
   * Get current recording
   */
  getRecording(): AgentRecording | null {
    return this.recording;
  }

  /**
   * Check if recording is active
   */
  isRecording(): boolean {
    return this.recording !== null && this.recording.endTime === undefined;
  }

  /**
   * Export recording to JSON
   */
  exportToJSON(): string {
    if (!this.recording) {
      throw new Error('No recording available');
    }
    return JSON.stringify(this.recording, null, 2);
  }

  /**
   * Import recording from JSON
   */
  importFromJSON(json: string): AgentRecording {
    const recording = JSON.parse(json) as AgentRecording;
    this.recording = recording;
    return recording;
  }

  /**
   * Replay recorded steps
   */
  async *replay(options: ReplayOptions = {}): AsyncIterable<RecordedStep> {
    if (!this.recording) {
      throw new Error('No recording available');
    }

    const {
      stepDelay = 0,
      startFromStep = 0,
      endAtStep = this.recording.steps.length,
      onStep,
    } = options;

    for (let i = startFromStep; i < Math.min(endAtStep, this.recording.steps.length); i++) {
      const step = this.recording.steps[i];
      if (!step) continue;

      if (stepDelay > 0) {
        await this.sleep(stepDelay);
      }

      onStep?.(step);
      yield step;
    }
  }

  /**
   * Clear current recording
   */
  clear(): void {
    this.recording = null;
    this.stepIndex = 0;
  }

  // ==================== ExecutorHooks Implementation ====================

  async onExecuteStart(input: string, context: AgentContext): Promise<void> {
    this.recording = {
      sessionId: this.generateSessionId(),
      startTime: Date.now(),
      input,
      steps: [],
      metadata: {
        initialIteration: context.iteration,
        initialState: context.state,
      },
      config: this.config,
    };
    this.stepIndex = 0;
  }

  async onExecuteEnd(result: AgentResult): Promise<void> {
    if (this.recording) {
      this.recording.endTime = Date.now();
      this.recording.response = result.response;
      this.recording.success = result.success;
      this.recording.metadata.totalIterations = result.iterations;
      this.recording.metadata.totalDuration = result.timing.duration;
    }
  }

  async afterThink(step: AgentStep, context: AgentContext): Promise<void> {
    if (!this.recording) return;
    if (this.config.maxSteps && this.stepIndex >= this.config.maxSteps) return;

    const recordedStep: RecordedStep = {
      ...step,
      index: this.stepIndex++,
      timestamp: this.config.includeTimestamps ? Date.now() : step.timestamp,
    };

    // Optionally strip thinking content
    if (!this.config.recordThinking) {
      delete recordedStep.thinking;
    }

    // Optionally strip tool arguments
    if (!this.config.recordToolArgs && recordedStep.toolCalls) {
      recordedStep.toolCalls = recordedStep.toolCalls.map((tc) => ({
        ...tc,
        arguments: {},
      }));
    }

    this.recording.steps.push(recordedStep);
  }

  async beforeAct(toolCalls: ToolCallInfo[]): Promise<void> {
    this.stepStartTime = Date.now();
  }

  async afterAct(results: ToolResultWithMeta[]): Promise<void> {
    if (!this.recording) return;

    // Record tool results as observe step
    if (this.config.recordToolResults) {
      const observeStep: RecordedStep = {
        type: 'observe',
        content: results.map((r) => `${r.name}: ${r.success ? 'success' : r.error}`).join('\n'),
        toolResults: this.config.recordToolResults ? results : undefined,
        timestamp: Date.now(),
        index: this.stepIndex++,
        duration: Date.now() - this.stepStartTime,
      };

      if (this.config.maxSteps === undefined || this.config.maxSteps === 0 || this.recording.steps.length < this.config.maxSteps) {
        this.recording.steps.push(observeStep);
      }
    }
  }

  async onToolCall(
    info: ToolCallInfo,
    execute: () => Promise<ToolResult>
  ): Promise<ToolResultWithMeta | null> {
    // Don't intercept, just pass through
    return null;
  }

  async onError(error: Error, context: AgentContext): Promise<void> {
    if (this.recording) {
      this.recording.metadata.error = {
        message: error.message,
        name: error.name,
        stack: error.stack,
      };
    }
  }

  // ==================== Private Methods ====================

  private generateSessionId(): string {
    return `rec_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/**
 * Create recording hooks
 */
export function createRecordingHooks(config?: Partial<RecordingConfig>): RecordingHooks {
  return new RecordingHooks(config);
}
