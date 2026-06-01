import type { ConversationKind, SessionMode } from '@/components/types';

export interface InputAreaUiProjectionInput {
  inputValue: string;
  attachedFileCount: number;
  contextChipCount: number;
  ambientNodeCount: number;
  mediaModelCallCount: number;
  isThinking: boolean;
  disabled: boolean;
  sessionMode: SessionMode;
  conversationKind?: ConversationKind;
}

export interface InputAreaUiProjection {
  hasText: boolean;
  hasAttachments: boolean;
  hasContextChips: boolean;
  hasAmbientNodes: boolean;
  canSend: boolean;
  canCancel: boolean;
  showSuggestionChips: boolean;
  showContextChips: boolean;
  showAmbientNodes: boolean;
  showMediaCallCount: boolean;
  showExecutionModeSelector: boolean;
  showChatModelSelector: boolean;
  showSessionMediaModelSelector: boolean;
  showSessionModeSelector: boolean;
  showGenerationParams: boolean;
  inputPlaceholderKey: 'chat.input.placeholder' | 'chat.input.thinkingPlaceholder';
}

export function projectInputAreaUi(input: InputAreaUiProjectionInput): InputAreaUiProjection {
  const hasText = input.inputValue.trim().length > 0;
  const hasAttachments = input.attachedFileCount > 0;
  const hasContextChips = input.contextChipCount > 0;
  const hasAmbientNodes = input.ambientNodeCount > 0;
  const isNpcTest = input.conversationKind === 'npc-test';
  const isAgentMode = input.sessionMode === 'agent';

  return {
    hasText,
    hasAttachments,
    hasContextChips,
    hasAmbientNodes,
    canSend: !input.disabled && (hasText || hasAttachments || hasContextChips),
    canCancel: input.isThinking && !input.disabled,
    showSuggestionChips: hasContextChips,
    showContextChips: hasContextChips,
    showAmbientNodes: hasAmbientNodes,
    showMediaCallCount: !isNpcTest && input.mediaModelCallCount > 0,
    showExecutionModeSelector: !isNpcTest && isAgentMode,
    showChatModelSelector: !isNpcTest && isAgentMode,
    showSessionMediaModelSelector: !isNpcTest && !isAgentMode,
    showSessionModeSelector: !isNpcTest,
    showGenerationParams: !isNpcTest,
    inputPlaceholderKey: input.isThinking
      ? 'chat.input.thinkingPlaceholder'
      : 'chat.input.placeholder',
  };
}
