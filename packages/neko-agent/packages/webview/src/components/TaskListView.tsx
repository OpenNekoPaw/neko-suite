/**
 * Task type definitions for background media generation tasks.
 *
 * Originally this file also contained TaskListView/TaskItem/useBackgroundTasks
 * components, but those were replaced by inline TaskCard rendering within messages.
 * Only the type definitions are still used (by TaskCard, handlers, hooks).
 */

import type { WebviewGeneratedAsset } from '@neko/shared';

export type TaskStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
export type TaskType = 'image' | 'video' | 'audio';

/** Task step status for detailed progress tracking */
export type TaskStepStatus = 'pending' | 'running' | 'completed' | 'failed';

/** Individual step in a task workflow */
export interface TaskStep {
  id: string;
  name: string;
  status: TaskStepStatus;
  startTime?: number;
  endTime?: number;
  message?: string;
}

export interface BackgroundTask {
  id: string;
  type: TaskType;
  name: string;
  prompt: string;
  providerId: string;
  providerName: string;
  status: TaskStatus;
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
    /** GeneratedAsset references with webview-safe URIs (ADR-4) */
    assets?: WebviewGeneratedAsset[];
  };
  error?: string;
  steps?: TaskStep[];
  currentStepId?: string;
  eta?: number;
}
