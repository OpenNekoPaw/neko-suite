/**
 * useResourceState Hook
 *
 * Manages resource-related state (tasks) for the AIAssistant component.
 */

import { useState, useCallback } from 'react';
import type { BackgroundTask } from '@/components/TaskListView';

/**
 * Resource state shape
 */
export interface ResourceState {
  backgroundTasks: BackgroundTask[];
}

/**
 * Promise resolvers for async operations
 */
export interface PromiseResolvers {
  pendingExportResolve: ((result: { success: boolean; data?: string; error?: string }) => void) | null;
  setPendingExportResolve: React.Dispatch<
    React.SetStateAction<((result: { success: boolean; data?: string; error?: string }) => void) | null>
  >;
}

/**
 * Resource state actions
 */
export interface ResourceStateActions {
  setBackgroundTasks: React.Dispatch<React.SetStateAction<BackgroundTask[]>>;
  addBackgroundTask: (task: BackgroundTask) => void;
  updateBackgroundTask: (taskId: string, updates: Partial<BackgroundTask>) => void;
  removeBackgroundTask: (taskId: string) => void;
}

/**
 * useResourceState return type
 */
export interface UseResourceStateReturn
  extends ResourceState,
    PromiseResolvers,
    ResourceStateActions {}

/**
 * Hook for managing resource state
 */
export function useResourceState(): UseResourceStateReturn {
  // Background tasks
  const [backgroundTasks, setBackgroundTasks] = useState<BackgroundTask[]>([]);

  // Promise resolvers for async operations
  const [pendingExportResolve, setPendingExportResolve] = useState<
    ((result: { success: boolean; data?: string; error?: string }) => void) | null
  >(null);

  // Helper: add a background task
  const addBackgroundTask = useCallback((task: BackgroundTask) => {
    setBackgroundTasks(prev => {
      if (prev.some(t => t.id === task.id)) {
        return prev;
      }
      return [task, ...prev];
    });
  }, []);

  // Helper: update a background task
  const updateBackgroundTask = useCallback((taskId: string, updates: Partial<BackgroundTask>) => {
    setBackgroundTasks(prev =>
      prev.map(t => (t.id === taskId ? { ...t, ...updates } : t))
    );
  }, []);

  // Helper: remove a background task
  const removeBackgroundTask = useCallback((taskId: string) => {
    setBackgroundTasks(prev => prev.filter(t => t.id !== taskId));
  }, []);

  return {
    // State
    backgroundTasks,
    // Promise resolvers
    pendingExportResolve,
    setPendingExportResolve,
    // Actions
    setBackgroundTasks,
    addBackgroundTask,
    updateBackgroundTask,
    removeBackgroundTask,
  };
}
