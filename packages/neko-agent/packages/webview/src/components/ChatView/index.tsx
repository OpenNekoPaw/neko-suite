import { useMemo, useState, useCallback } from 'react';
import {
  Message,
  AgentState,
  type ConversationKind,
  type CharacterDialogueSessionProjection,
  type EmbodyCharacterSessionProjection,
  type AgentLlmConfig,
  type AgentModelSlots,
} from '@neko-agent/types';
import { MessageList } from '@/components/ChatView/MessageList';
import { MessageActionsProvider } from '@/components/ChatView/MessageActionsContext';
import { InputArea, MessageAttachment } from '@/components/ChatView/InputArea';
import type { EntryPromptMenu, SelectedFileReference } from '@/components/ChatView/InputArea/types';
import { DropZone } from '@/components/ChatView/DropZone';
import type { PluginsAvailable } from '@/components/ChatView/SendToMenu';
import type { AgentWorkItem } from '@/components/AgentWorkItem';
import type { AgentContextPayload } from '@neko/shared';
import type { AmbientCanvasNodeProjection } from '@/presenters/plugin-transfer-presenter';
import type { ActiveSkillIndicator } from '@/components/ChatView/SkillIndicator';
import { CharacterDialogueHeader } from '@/components/ChatView/CharacterDialogueHeader';
import { EmbodyCharacterHeader } from '@/components/ChatView/EmbodyCharacterHeader';
import { projectMessageIdentities } from '@/components/ChatView/message-identity';
interface ChatViewProps {
  messages: Message[];
  inputValue: string;
  isThinking: boolean;
  queuedMessageCount?: number;
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
    displayMessageText?: string;
    attachments?: MessageAttachment[];
    contextPayloads?: AgentContextPayload[];
    fileReferences?: SelectedFileReference[];
    agentModels?: AgentModelSlots;
    llmConfig?: AgentLlmConfig;
  }) => void;
  onCancel?: () => void;
  entryPromptMenu?: EntryPromptMenu | null;
  onEntryPromptMenuChange?: (menu: EntryPromptMenu | null) => void;
  /** Session-bound attached files (managed by parent) */
  attachedFiles?: MessageAttachment[];
  /** Callback to update attached files */
  onAttachedFilesChange?: (files: MessageAttachment[]) => void;
  /** Session-bound @file references selected from the mention menu. */
  selectedFileReferences?: SelectedFileReference[];
  onSelectedFileReferencesChange?: (references: SelectedFileReference[]) => void;
  /** Current agent execution state (null when idle) */
  agentState?: AgentState | null;
}

export function ChatView({
  messages,
  inputValue,
  isThinking,
  queuedMessageCount = 0,
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
  entryPromptMenu,
  onEntryPromptMenuChange,
  attachedFiles,
  onAttachedFilesChange,
  selectedFileReferences,
  onSelectedFileReferencesChange,
  agentState: _agentState,
}: ChatViewProps) {
  const isEmpty = messages.length === 0 && !isThinking && !activeSkill;
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
      <div className="agent-chat-view flex-1 flex flex-col overflow-hidden relative h-full">
        {conversationKind === 'character-dialogue' && characterDialogueSession && (
          <CharacterDialogueHeader session={characterDialogueSession} />
        )}

        {conversationKind === 'embody-character' && embodyCharacterSession && (
          <EmbodyCharacterHeader session={embodyCharacterSession} />
        )}

        {/* Messages Container */}
        {isEmpty ? (
          <div className="agent-chat-empty-scroll flex-1 overflow-y-auto" />
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
              activeSkillNotice={activeSkill}
              onClearActiveSkill={onClearActiveSkill}
            />
          </MessageActionsProvider>
        )}

        {/* Input Area */}
        <InputArea
          inputValue={inputValue}
          isThinking={isThinking}
          queuedMessageCount={queuedMessageCount}
          droppedFiles={droppedFiles}
          onDroppedFilesProcessed={handleDroppedFilesProcessed}
          onInputChange={onInputChange}
          onSend={onSend}
          onCancel={onCancel}
          entryPromptMenu={entryPromptMenu}
          onEntryPromptMenuChange={onEntryPromptMenuChange}
          disabled={isConversationSwitching}
          attachedFiles={attachedFiles}
          onAttachedFilesChange={onAttachedFilesChange}
          selectedFileReferences={selectedFileReferences}
          onSelectedFileReferencesChange={onSelectedFileReferencesChange}
        />
      </div>
    </DropZone>
  );
}
