/**
 * useResourceState Hook
 *
 * Manages resource-related state (tasks) for the AIAssistant component.
 */

import { useState } from 'react';
import type { BackgroundTask } from '@/components/TaskListView';

/**
 * Resource state shape
 */
export interface ResourceState {
  backgroundTasks: BackgroundTask[];
}

/**
 * Resource state actions
 */
export interface ResourceStateActions {
  setBackgroundTasks: React.Dispatch<React.SetStateAction<BackgroundTask[]>>;
}

/**
 * useResourceState return type
 */
export interface UseResourceStateReturn extends ResourceState, ResourceStateActions {}

/**
 * Hook for managing resource state
 */
export function useResourceState(): UseResourceStateReturn {
  // Background tasks
  const [backgroundTasks, setBackgroundTasks] = useState<BackgroundTask[]>([]);

  return {
    backgroundTasks,
    setBackgroundTasks,
  };
}
