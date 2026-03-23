/**
 * MessageActionsContext - Provides message action callbacks via React Context
 *
 * Eliminates prop drilling of 9 callback functions through
 * ChatView → MessageList → MessageItem/ContentBlockItem.
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { BackgroundTask } from '@/components/TaskListView';

export interface MessageActionsContextValue {
  // Background tasks (for inline TaskCard rendering in ToolCallDisplay)
  backgroundTasks?: BackgroundTask[];
  // Task actions
  onCancelTask?: (taskId: string) => void;
  onViewTaskResult?: (taskId: string) => void;
  // Diff actions
  onAcceptDiff?: (filePath: string) => void;
  onRejectDiff?: (filePath: string) => void;
  // Plan actions
  onApprovePlanStep?: (planId: string, stepId: string) => void;
  onRejectPlanStep?: (planId: string, stepId: string) => void;
  onModifyPlanStep?: (planId: string, stepId: string, newDescription: string) => void;
  onApproveAllPlanSteps?: (planId: string) => void;
  onRejectAllPlanSteps?: (planId: string) => void;
}

const MessageActionsContext = createContext<MessageActionsContextValue>({});

export function MessageActionsProvider({
  children,
  ...actions
}: MessageActionsContextValue & { children: ReactNode }) {
  const value = useMemo<MessageActionsContextValue>(
    () => ({
      backgroundTasks: actions.backgroundTasks,
      onCancelTask: actions.onCancelTask,
      onViewTaskResult: actions.onViewTaskResult,
      onAcceptDiff: actions.onAcceptDiff,
      onRejectDiff: actions.onRejectDiff,
      onApprovePlanStep: actions.onApprovePlanStep,
      onRejectPlanStep: actions.onRejectPlanStep,
      onModifyPlanStep: actions.onModifyPlanStep,
      onApproveAllPlanSteps: actions.onApproveAllPlanSteps,
      onRejectAllPlanSteps: actions.onRejectAllPlanSteps,
    }),
    [
      actions.backgroundTasks,
      actions.onCancelTask,
      actions.onViewTaskResult,
      actions.onAcceptDiff,
      actions.onRejectDiff,
      actions.onApprovePlanStep,
      actions.onRejectPlanStep,
      actions.onModifyPlanStep,
      actions.onApproveAllPlanSteps,
      actions.onRejectAllPlanSteps,
    ],
  );

  return <MessageActionsContext.Provider value={value}>{children}</MessageActionsContext.Provider>;
}

export function useMessageActions(): MessageActionsContextValue {
  return useContext(MessageActionsContext);
}
