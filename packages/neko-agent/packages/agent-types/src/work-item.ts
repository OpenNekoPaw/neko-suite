import type { WebviewGeneratedAsset } from '@neko/shared';
export type AgentWorkItemTaskStatus =
  | 'queued'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type AgentWorkItemTaskType = 'image' | 'video' | 'audio';

export type AgentWorkItemTaskStepStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface AgentWorkItemTaskStep {
  id: string;
  name: string;
  status: AgentWorkItemTaskStepStatus;
  startTime?: number;
  endTime?: number;
  message?: string;
}

export interface AgentBackgroundTask {
  id: string;
  type: AgentWorkItemTaskType;
  name: string;
  prompt: string;
  providerId: string;
  providerName: string;
  status: AgentWorkItemTaskStatus;
  progress: number;
  createdAt: string;
  updatedAt: string;
  result?: {
    urls: string[];
    localPaths?: string[];
    thumbnailUrl?: string;
    width?: number;
    height?: number;
    duration?: number;
    assets?: WebviewGeneratedAsset[];
  };
  error?: string;
  steps?: AgentWorkItemTaskStep[];
  currentStepId?: string;
  eta?: number;
}

export type AgentWorkItemKind = 'media-task' | 'tool-background-task' | 'subagent';

export interface AgentWorkItemBase {
  id: string;
  conversationId: string;
  kind: AgentWorkItemKind;
  parentMessageId: string | null;
  parentToolCallId: string | null;
  title: string;
  summary?: string;
  status: AgentWorkItemTaskStatus;
  progress: number;
  steps?: AgentWorkItemTaskStep[];
  currentStepId?: string;
  result?: AgentBackgroundTask['result'];
  error?: string;
  children?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TaskWorkItem extends AgentWorkItemBase {
  kind: 'media-task' | 'tool-background-task';
  task: AgentBackgroundTask;
}

export interface SubAgentWorkItem extends AgentWorkItemBase {
  kind: 'subagent';
  subAgent: {
    parentAgentId: string;
    type?: string;
    runMode?: 'foreground' | 'background';
    modelTier?: string;
    response?: string;
  };
}

export type AgentWorkItem = TaskWorkItem | SubAgentWorkItem;

export type AgentWorkItemStore = Map<string, Map<string, AgentWorkItem>>;

export interface AgentMediaTaskOutput {
  url: string;
  width?: number;
  height?: number;
  duration?: number;
  thumbnailUrl?: string;
}

export interface AgentMediaTaskError {
  code: string;
  message: string;
}

export type AgentMediaTaskResult = NonNullable<AgentBackgroundTask['result']>;

export interface AgentMediaTaskView {
  id: string;
  type: string;
  status: string;
  progress: number;
  providerId: string;
  modelId: string;
  createdAt: string | Date;
  updatedAt: string | Date;
  outputs?: AgentMediaTaskOutput[];
  result?: AgentMediaTaskResult;
  error?: AgentMediaTaskError;
  request: {
    prompt: string;
  };
}

export type SubAgentWorkItemEventType =
  | 'spawned'
  | 'started'
  | 'progress'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type SubAgentRuntimeStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface SubAgentWorkItemEvent {
  type: SubAgentWorkItemEventType;
  subAgentId: string;
  parentAgentId: string;
  conversationId: string;
  data?: {
    status?: SubAgentRuntimeStatus;
    progress?: string;
    result?: {
      id: string;
      status: SubAgentRuntimeStatus;
      response?: string;
      error?: string;
      duration?: number;
      iterations?: number;
    };
    error?: string;
    description?: string;
    subagentType?: string;
    runMode?: 'foreground' | 'background';
    modelTier?: string;
    parentMessageId?: string;
    parentToolCallId?: string;
  };
  timestamp: number;
}
