/**
 * Workflow Types - Workflow integration
 */

/**
 * Workflow type
 */
export type WorkflowType = 'builtin' | 'n8n' | 'comfyui' | 'custom';

/**
 * Workflow status
 */
export type WorkflowStatus =
  | 'idle'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * Workflow definition
 */
export interface Workflow {
  /** Unique workflow ID */
  id: string;
  /** Workflow name */
  name: string;
  /** Workflow description */
  description: string;
  /** Workflow type */
  type: WorkflowType;
  /** Input schema (JSON Schema) */
  inputSchema: Record<string, unknown>;
  /** Output schema (JSON Schema) */
  outputSchema: Record<string, unknown>;
  /** Workflow-specific configuration */
  config: Record<string, unknown>;
}

/**
 * Workflow execution input
 */
export interface WorkflowInput {
  /** Workflow ID */
  workflowId: string;
  /** Input data */
  data: Record<string, unknown>;
  /** Execution options */
  options?: {
    /** Timeout in milliseconds */
    timeout?: number;
    /** Whether to wait for completion */
    wait?: boolean;
  };
}

/**
 * Workflow execution result
 */
export interface WorkflowResult {
  /** Execution ID */
  executionId: string;
  /** Workflow ID */
  workflowId: string;
  /** Execution status */
  status: WorkflowStatus;
  /** Output data */
  output?: Record<string, unknown>;
  /** Error if failed */
  error?: string;
  /** Execution timing */
  timing?: {
    startTime: number;
    endTime: number;
    duration: number;
  };
}

/**
 * N8n workflow configuration
 */
export interface N8nWorkflowConfig {
  /** N8n instance URL */
  instanceUrl: string;
  /** API key */
  apiKey: string;
  /** Webhook path (for webhook-triggered workflows) */
  webhookPath?: string;
}

/**
 * ComfyUI workflow configuration
 */
export interface ComfyUIWorkflowConfig {
  /** ComfyUI server URL */
  serverUrl: string;
  /** Workflow JSON (prompt) */
  workflow: Record<string, unknown>;
  /** Client ID */
  clientId?: string;
}

/**
 * Workflow manager interface
 */
export interface WorkflowManager {
  /** List available workflows */
  list(): Promise<Workflow[]>;

  /** Get workflow by ID */
  get(id: string): Promise<Workflow | undefined>;

  /** Execute a workflow */
  execute(input: WorkflowInput): Promise<WorkflowResult>;

  /** Get execution status */
  getExecution(executionId: string): Promise<WorkflowResult | undefined>;

  /** Cancel execution */
  cancelExecution(executionId: string): Promise<boolean>;

  /** Register a workflow */
  register(workflow: Workflow): void;

  /** Unregister a workflow */
  unregister(id: string): void;
}
