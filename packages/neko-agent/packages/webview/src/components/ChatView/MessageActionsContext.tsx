/**
 * MessageActionsContext - Provides message action callbacks via React Context
 *
 * Eliminates prop drilling of 9 callback functions through
 * ChatView → MessageList → MessageItem/ContentBlockItem.
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { AgentWorkItem } from '@/components/AgentWorkItem';
import type { PluginsAvailable } from '@/components/ChatView/SendToMenu';

export interface MessageActionsContextValue {
  activeConversationId?: string | null;
  // Unified work items (media tasks, tool background tasks, subagents)
  workItems?: AgentWorkItem[];
  pluginsAvailable?: PluginsAvailable;
  // Task actions
  onCancelTask?: (taskId: string) => void;
  onRetryTask?: (taskId: string) => void;
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
      activeConversationId: actions.activeConversationId,
      workItems: actions.workItems,
      pluginsAvailable: actions.pluginsAvailable,
      onCancelTask: actions.onCancelTask,
      onRetryTask: actions.onRetryTask,
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
      actions.activeConversationId,
      actions.workItems,
      actions.pluginsAvailable,
      actions.onCancelTask,
      actions.onRetryTask,
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
