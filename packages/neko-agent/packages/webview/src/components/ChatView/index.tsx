import { useState, useCallback } from 'react';
import { Message, ShellExecutionMode, PromptMode, AgentState } from '@/components/types';
import type { ChatModelOption } from '@neko/shared';
import { MessageList } from '@/components/ChatView/MessageList';
import { InputArea, ProjectFile, AttachedFile } from '@/components/ChatView/InputArea';
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
import type { SlashCommand, SkillSummary } from '@/components/ChatView/InputArea/types';
import type { QueuedMessage } from '@/hooks/useMessageQueue';

interface ChatViewProps {
  messages: Message[];
  inputValue: string;
  isThinking: boolean;
  streamingMessageId: string | null;
  selectedModel: string;
  availableModels: ChatModelOption[];
  projectFiles?: ProjectFile[];
  executionMode: ShellExecutionMode;
  promptMode: PromptMode;
  /** Skills loaded from Extension Host */
  skills?: SkillSummary[];
  /** Pending skill confirmation request */
  pendingSkillConfirm?: SkillConfirmRequest | null;
  /** Active skill indicator */
  activeSkill?: ActiveSkillIndicator | null;
  /** Skill confirmation handlers */
  onConfirmSkill?: () => void;
  onDeclineSkill?: () => void;
  onClearActiveSkill?: () => void;
  // 后台任务相关
  backgroundTasks?: BackgroundTask[];
  onCancelTask?: (taskId: string) => void;
  onViewTaskResult?: (taskId: string) => void;
  // P1: Code diff actions
  onAcceptDiff?: (filePath: string) => void;
  onRejectDiff?: (filePath: string) => void;
  // P1: Plan review actions
  onApprovePlanStep?: (planId: string, stepId: string) => void;
  onRejectPlanStep?: (planId: string, stepId: string) => void;
  onModifyPlanStep?: (planId: string, stepId: string, newDescription: string) => void;
  onApproveAllPlanSteps?: (planId: string) => void;
  onRejectAllPlanSteps?: (planId: string) => void;
  // 其他回调
  onInputChange: (value: string) => void;
  onSend: (attachments?: AttachedFile[]) => void;
  // P2: Cancel current message generation
  onCancel?: () => void;
  onModelSelect: (modelId: string) => void;
  onSlashCommand?: (command: SlashCommand) => void;
  onRequestFiles?: (filter: string) => void;
  onExecutionModeChange: (mode: ShellExecutionMode) => void;
  onPromptModeChange: (mode: PromptMode) => void;
  /** Queued messages for preview */
  queuedMessages?: QueuedMessage[];
  /** Remove a queued message */
  onRemoveQueuedMessage?: (id: string) => void;
  /** Clear all queued messages */
  onClearQueue?: () => void;
  /** Session-bound attached files (managed by parent) */
  attachedFiles?: AttachedFile[];
  /** Callback to update attached files */
  onAttachedFilesChange?: (files: AttachedFile[]) => void;
  /** Current context token count */
  contextTokenCount?: number;
  /** Whether context compression is in progress */
  isCompressing?: boolean;
  /** Callback to trigger context compression */
  onCompressContext?: () => Promise<void>;
  /** Current agent execution state (null when idle) */
  agentState?: AgentState | null;
}

export function ChatView({
  messages,
  inputValue,
  isThinking,
  streamingMessageId,
  selectedModel,
  availableModels,
  projectFiles,
  executionMode,
  promptMode,
  skills,
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
  onModelSelect,
  onSlashCommand,
  onRequestFiles,
  onExecutionModeChange,
  onPromptModeChange,
  queuedMessages,
  onRemoveQueuedMessage,
  onClearQueue,
  attachedFiles,
  onAttachedFilesChange,
  contextTokenCount,
  isCompressing,
  onCompressContext,
  agentState,
}: ChatViewProps) {
  const isEmpty = messages.length === 0 && !isThinking;

  // P2: Dropped files state for DropZone integration
  const [droppedFiles, setDroppedFiles] = useState<AttachedFile[]>([]);

  const handleFilesDropped = useCallback((files: AttachedFile[]) => {
    setDroppedFiles(files);
  }, []);

  const handleDroppedFilesProcessed = useCallback(() => {
    setDroppedFiles([]);
  }, []);

  return (
    <DropZone
      onFilesDropped={handleFilesDropped}
      disabled={isThinking}
    >
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
          <SkillIndicator
            skill={activeSkill}
            onClear={onClearActiveSkill}
          />
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
          <MessageList
            messages={messages}
            isThinking={isThinking}
            streamingMessageId={streamingMessageId}
            backgroundTasks={backgroundTasks}
            onCancelTask={onCancelTask}
            onViewTaskResult={onViewTaskResult}
            onAcceptDiff={onAcceptDiff}
            onRejectDiff={onRejectDiff}
            onApprovePlanStep={onApprovePlanStep}
            onRejectPlanStep={onRejectPlanStep}
            onModifyPlanStep={onModifyPlanStep}
            onApproveAllPlanSteps={onApproveAllPlanSteps}
            onRejectAllPlanSteps={onRejectAllPlanSteps}
          />
        )}

        {/* Input Area */}
        <InputArea
          inputValue={inputValue}
          isThinking={isThinking}
          messageCount={messages.length}
          selectedModel={selectedModel}
          availableModels={availableModels}
          projectFiles={projectFiles}
          executionMode={executionMode}
          promptMode={promptMode}
          skills={skills}
          droppedFiles={droppedFiles}
          onDroppedFilesProcessed={handleDroppedFilesProcessed}
          onInputChange={onInputChange}
          onSend={onSend}
          onCancel={onCancel}
          onModelSelect={onModelSelect}
          onSlashCommand={onSlashCommand}
          onRequestFiles={onRequestFiles}
          onExecutionModeChange={onExecutionModeChange}
          onPromptModeChange={onPromptModeChange}
          queuedMessages={queuedMessages}
          onRemoveQueuedMessage={onRemoveQueuedMessage}
          onClearQueue={onClearQueue}
          attachedFiles={attachedFiles}
          onAttachedFilesChange={onAttachedFilesChange}
          contextTokenCount={contextTokenCount}
          isCompressing={isCompressing}
          onCompressContext={onCompressContext}
        />
      </div>
    </DropZone>
  );
}
