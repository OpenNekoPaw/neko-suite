import { useState, useCallback } from 'react';
import { Message, AgentState } from '@/components/types';
import { MessageList } from '@/components/ChatView/MessageList';
import { MessageActionsProvider } from '@/components/ChatView/MessageActionsContext';
import { InputArea, ProjectFile, MessageAttachment } from '@/components/ChatView/InputArea';
import { EmptyState } from '@/components/ChatView/EmptyState';
import { DropZone } from '@/components/ChatView/DropZone';
import { BackgroundTask } from '@/components/TaskListView';
import {
  SkillConfirmBanner,
  SkillIndicator,
  type SkillConfirmRequest,
  type ActiveSkillIndicator,
} from '@/components/ChatView/SkillConfirmBanner';
import { AgentStateIndicatorCompact } from '@/components/ChatView/AgentStateIndicator';
interface ChatViewProps {
  messages: Message[];
  inputValue: string;
  isThinking: boolean;
  streamingMessageId: string | null;
  projectFiles?: ProjectFile[];
  /** Pending skill confirmation request */
  pendingSkillConfirm?: SkillConfirmRequest | null;
  /** Active skill indicator */
  activeSkill?: ActiveSkillIndicator | null;
  /** Skill confirmation handlers */
  onConfirmSkill?: () => void;
  onDeclineSkill?: () => void;
  onClearActiveSkill?: () => void;
  // Background tasks
  backgroundTasks?: BackgroundTask[];
  onCancelTask?: (taskId: string) => void;
  onViewTaskResult?: (taskId: string) => void;
  // Code diff actions
  onAcceptDiff?: (filePath: string) => void;
  onRejectDiff?: (filePath: string) => void;
  // Plan review actions
  onApprovePlanStep?: (planId: string, stepId: string) => void;
  onRejectPlanStep?: (planId: string, stepId: string) => void;
  onModifyPlanStep?: (planId: string, stepId: string, newDescription: string) => void;
  onApproveAllPlanSteps?: (planId: string) => void;
  onRejectAllPlanSteps?: (planId: string) => void;
  // Input callbacks
  onInputChange: (value: string) => void;
  onSend: (attachments?: MessageAttachment[]) => void;
  onCancel?: () => void;
  /** Session-bound attached files (managed by parent) */
  attachedFiles?: MessageAttachment[];
  /** Callback to update attached files */
  onAttachedFilesChange?: (files: MessageAttachment[]) => void;
  /** Current agent execution state (null when idle) */
  agentState?: AgentState | null;
}

export function ChatView({
  messages,
  inputValue,
  isThinking,
  streamingMessageId,
  projectFiles,
  pendingSkillConfirm,
  activeSkill,
  onConfirmSkill,
  onDeclineSkill,
  onClearActiveSkill,
  backgroundTasks,
  onCancelTask,
  onViewTaskResult,
  onAcceptDiff,
  onRejectDiff,
  onApprovePlanStep,
  onRejectPlanStep,
  onModifyPlanStep,
  onApproveAllPlanSteps,
  onRejectAllPlanSteps,
  onInputChange,
  onSend,
  onCancel,
  attachedFiles,
  onAttachedFilesChange,
  agentState,
}: ChatViewProps) {
  const isEmpty = messages.length === 0 && !isThinking;

  // P2: Dropped files state for DropZone integration
  const [droppedFiles, setDroppedFiles] = useState<MessageAttachment[]>([]);

  const handleFilesDropped = useCallback((files: MessageAttachment[]) => {
    setDroppedFiles(files);
  }, []);

  const handleDroppedFilesProcessed = useCallback(() => {
    setDroppedFiles([]);
  }, []);

  return (
    <DropZone onFilesDropped={handleFilesDropped} disabled={isThinking}>
      <div className="flex-1 flex flex-col overflow-hidden relative h-full">
        {/* Skill Confirmation Banner */}
        {pendingSkillConfirm && onConfirmSkill && onDeclineSkill && (
          <SkillConfirmBanner
            request={pendingSkillConfirm}
            onConfirm={onConfirmSkill}
            onDecline={onDeclineSkill}
          />
        )}

        {/* Active Skill Indicator */}
        {activeSkill && onClearActiveSkill && (
          <SkillIndicator skill={activeSkill} onClear={onClearActiveSkill} />
        )}

        {/* Agent State Indicator - shows when agent is thinking/acting/streaming */}
        {agentState && (
          <div className="px-3 py-1.5 border-b border-[var(--vscode-panel-border)] bg-[var(--vscode-sideBar-background)]">
            <AgentStateIndicatorCompact agentState={agentState} />
          </div>
        )}

        {/* Messages Container */}
        {isEmpty ? (
          <div className="flex-1 overflow-y-auto">
            <EmptyState />
          </div>
        ) : (
          <MessageActionsProvider
            onCancelTask={onCancelTask}
            onViewTaskResult={onViewTaskResult}
            onAcceptDiff={onAcceptDiff}
            onRejectDiff={onRejectDiff}
            onApprovePlanStep={onApprovePlanStep}
            onRejectPlanStep={onRejectPlanStep}
            onModifyPlanStep={onModifyPlanStep}
            onApproveAllPlanSteps={onApproveAllPlanSteps}
            onRejectAllPlanSteps={onRejectAllPlanSteps}
          >
            <MessageList
              messages={messages}
              isThinking={isThinking}
              streamingMessageId={streamingMessageId}
              backgroundTasks={backgroundTasks}
            />
          </MessageActionsProvider>
        )}

        {/* Input Area */}
        <InputArea
          inputValue={inputValue}
          isThinking={isThinking}
          projectFiles={projectFiles}
          droppedFiles={droppedFiles}
          onDroppedFilesProcessed={handleDroppedFilesProcessed}
          onInputChange={onInputChange}
          onSend={onSend}
          onCancel={onCancel}
          attachedFiles={attachedFiles}
          onAttachedFilesChange={onAttachedFilesChange}
        />
      </div>
    </DropZone>
  );
}
