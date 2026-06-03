import { useMemo, useState, useCallback } from 'react';
import {
  Message,
  AgentState,
  type ConversationKind,
  type CharacterDialogueSessionProjection,
  type EmbodyCharacterSessionProjection,
} from '@/components/types';
import { MessageList } from '@/components/ChatView/MessageList';
import { MessageActionsProvider } from '@/components/ChatView/MessageActionsContext';
import { InputArea, MessageAttachment } from '@/components/ChatView/InputArea';
import { EmptyState } from '@/components/ChatView/EmptyState';
import { DropZone } from '@/components/ChatView/DropZone';
import type { PluginsAvailable } from '@/components/ChatView/SendToMenu';
import type { AgentWorkItem } from '@/components/AgentWorkItem';
import type { AgentContextPayload } from '@neko/shared';
import type { AmbientCanvasNodeProjection } from '@/presenters/plugin-transfer-presenter';
import { SkillIndicator, type ActiveSkillIndicator } from '@/components/ChatView/SkillIndicator';
import { AgentStateIndicatorCompact } from '@/components/ChatView/AgentStateIndicator';
import { CharacterDialogueHeader } from '@/components/ChatView/CharacterDialogueHeader';
import { EmbodyCharacterHeader } from '@/components/ChatView/EmbodyCharacterHeader';
import { projectMessageIdentities } from '@/components/ChatView/message-identity';
interface ChatViewProps {
  messages: Message[];
  inputValue: string;
  isThinking: boolean;
  streamingMessageId: string | null;
  activeConversationId: string | null;
  conversationKind?: ConversationKind;
  characterDialogueSession?: CharacterDialogueSessionProjection;
  embodyCharacterSession?: EmbodyCharacterSessionProjection;
  isConversationSwitching?: boolean;
  /** Active skill indicator */
  activeSkill?: ActiveSkillIndicator | null;
  onClearActiveSkill?: () => void;
  // Unified work items
  workItems?: AgentWorkItem[];
  pluginsAvailable?: PluginsAvailable;
  contextChips?: readonly AgentContextPayload[];
  ambientNodes?: readonly AmbientCanvasNodeProjection[];
  onCancelTask?: (taskId: string) => void;
  onRetryTask?: (taskId: string) => void;
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
  onSend: (input?: {
    messageText?: string;
    attachments?: MessageAttachment[];
    contextPayloads?: AgentContextPayload[];
  }) => void;
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
  activeConversationId,
  conversationKind = 'chat',
  characterDialogueSession,
  embodyCharacterSession,
  isConversationSwitching = false,
  activeSkill,
  onClearActiveSkill,
  workItems,
  pluginsAvailable,
  contextChips,
  ambientNodes,
  onCancelTask,
  onRetryTask,
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
  const messageIdentities = useMemo(
    () =>
      projectMessageIdentities({
        conversationKind,
        characterDialogueSession,
        embodyCharacterSession,
      }),
    [characterDialogueSession, conversationKind, embodyCharacterSession],
  );

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

        {conversationKind === 'character-dialogue' && characterDialogueSession && (
          <CharacterDialogueHeader session={characterDialogueSession} />
        )}

        {conversationKind === 'embody-character' && embodyCharacterSession && (
          <EmbodyCharacterHeader session={embodyCharacterSession} />
        )}

        {/* Messages Container */}
        {isEmpty ? (
          <div className="flex-1 overflow-y-auto">
            {conversationKind === 'chat' ? <EmptyState onSuggestionClick={onInputChange} /> : null}
          </div>
        ) : (
          <MessageActionsProvider
            activeConversationId={activeConversationId}
            workItems={workItems}
            pluginsAvailable={pluginsAvailable}
            contextChips={contextChips}
            ambientNodes={ambientNodes}
            onCancelTask={onCancelTask}
            onRetryTask={onRetryTask}
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
              activeConversationId={activeConversationId}
              identities={messageIdentities}
            />
          </MessageActionsProvider>
        )}

        {/* Input Area */}
        <InputArea
          inputValue={inputValue}
          isThinking={isThinking}
          droppedFiles={droppedFiles}
          onDroppedFilesProcessed={handleDroppedFilesProcessed}
          onInputChange={onInputChange}
          onSend={onSend}
          onCancel={onCancel}
          disabled={isConversationSwitching}
          attachedFiles={attachedFiles}
          onAttachedFilesChange={onAttachedFilesChange}
        />
      </div>
    </DropZone>
  );
}
