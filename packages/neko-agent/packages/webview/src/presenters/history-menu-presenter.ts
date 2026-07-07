import type {
  AgentState,
  ConversationStreamingState,
  ConversationSummary,
  CreativeAiConversationProjection,
  OpenTab,
} from '@neko-agent/types';
import type { ConversationLifecycleAction } from '@neko/shared/types/creative-ai-invocation';

export type HistoryConversationExecutionStatus = 'running' | 'completed';
export type HistoryConversationLifecycleTone = 'neutral' | 'warning' | 'danger';
export type HistoryConversationProtectedReason = 'open' | 'running' | 'background';

export interface HistoryConversationLifecycleActionItem {
  readonly action: ConversationLifecycleAction;
  readonly enabled: boolean;
  readonly labelKey: string;
  readonly titleKey: string;
  readonly tone: HistoryConversationLifecycleTone;
  readonly diagnostic?: string;
}

export interface HistoryConversationItem extends ConversationSummary {
  readonly isOpen: boolean;
  readonly isActive: boolean;
  readonly isBackground: boolean;
  readonly executionStatus?: HistoryConversationExecutionStatus;
  readonly lifecycleState?: CreativeAiConversationProjection['lifecycleState'];
  readonly sourcePackage?: string;
  readonly documentLabel?: string;
  readonly associationKey?: string;
  readonly activeRunSummary?: CreativeAiConversationProjection['activeRunSummary'];
  readonly lifecycleActions: readonly HistoryConversationLifecycleActionItem[];
  readonly canDelete: boolean;
  readonly protectedReason?: HistoryConversationProtectedReason;
}

export interface ProjectHistoryConversationItemsInput {
  readonly conversations: readonly ConversationSummary[];
  readonly openTabs: readonly OpenTab[];
  readonly activeConversationId: string | null;
  readonly activeStreaming: ConversationStreamingState;
  readonly streamingByConversation: ReadonlyMap<string, ConversationStreamingState>;
  readonly agentStateByConversation: ReadonlyMap<string, AgentState>;
}

export interface ProjectHistoryCleanupInput {
  readonly historyItems: readonly HistoryConversationItem[];
}

export interface ProjectHistoryCleanupResult {
  readonly deletableConversationIds: readonly string[];
  readonly protectedConversationCount: number;
}

export function projectHistoryConversationItems(
  input: ProjectHistoryConversationItemsInput,
): HistoryConversationItem[] {
  const openConversationIds = new Set(input.openTabs.map((tab) => tab.conversationId));

  return input.conversations.map((conversation) => {
    const creativeAi = conversation.creativeAi;
    const isActive = conversation.id === input.activeConversationId;
    const isOpen = openConversationIds.has(conversation.id) || isActive;
    const streaming = isActive
      ? input.activeStreaming
      : input.streamingByConversation.get(conversation.id);
    const agentState = input.agentStateByConversation.get(conversation.id);
    const hasActiveCreativeWork = hasActiveCreativeAiWork(creativeAi);
    const executionStatus = resolveHistoryExecutionStatus({
      messageCount: conversation.messageCount,
      streaming,
      agentState,
      hasActiveCreativeWork,
    });
    const isRunning = executionStatus === 'running';
    const isBackground = creativeAi !== undefined;
    const protectedReason = isRunning
      ? 'running'
      : isBackground
        ? 'background'
        : isOpen || isActive
          ? 'open'
          : undefined;

    return {
      ...conversation,
      isOpen,
      isActive,
      isBackground,
      ...(executionStatus ? { executionStatus } : {}),
      ...(creativeAi
        ? {
            lifecycleState: creativeAi.lifecycleState,
            sourcePackage: creativeAi.sourcePackage,
            documentLabel:
              creativeAi.documentLabel ?? creativeAi.sourceLabel ?? creativeAi.associationKey,
            associationKey: creativeAi.associationKey,
            ...(creativeAi.activeRunSummary
              ? { activeRunSummary: creativeAi.activeRunSummary }
              : {}),
            lifecycleActions: projectLifecycleActions(creativeAi, hasActiveCreativeWork),
          }
        : { lifecycleActions: [] }),
      canDelete: !protectedReason,
      ...(protectedReason ? { protectedReason } : {}),
    };
  });
}

export function projectHistoryCleanup(
  input: ProjectHistoryCleanupInput,
): ProjectHistoryCleanupResult {
  const deletableConversationIds = input.historyItems
    .filter((item) => item.canDelete)
    .map((item) => item.id);

  return {
    deletableConversationIds,
    protectedConversationCount: input.historyItems.length - deletableConversationIds.length,
  };
}

function resolveHistoryExecutionStatus(input: {
  readonly messageCount: number;
  readonly streaming?: ConversationStreamingState;
  readonly agentState?: AgentState;
  readonly hasActiveCreativeWork?: boolean;
}): HistoryConversationExecutionStatus | undefined {
  if (input.hasActiveCreativeWork) {
    return 'running';
  }
  if (input.streaming?.isThinking || input.streaming?.streamingMessageId) {
    return 'running';
  }
  if (input.agentState && input.agentState.phase !== 'idle') {
    return 'running';
  }
  if (input.messageCount > 0) {
    return 'completed';
  }
  return undefined;
}

function hasActiveCreativeAiWork(
  creativeAi: CreativeAiConversationProjection | undefined,
): boolean {
  if (!creativeAi?.activeRunSummary) return false;
  const summary = creativeAi.activeRunSummary;
  if (summary.activeRunCount > 0 || summary.activeWorkItemCount > 0) return true;
  return summary.latestRunStatus === 'accepted' || summary.latestRunStatus === 'running';
}

function projectLifecycleActions(
  creativeAi: CreativeAiConversationProjection,
  hasActiveWork: boolean,
): readonly HistoryConversationLifecycleActionItem[] {
  const actions =
    creativeAi.availableLifecycleActions ?? defaultLifecycleActions(creativeAi, hasActiveWork);
  return actions.map((action) => projectLifecycleAction(action, hasActiveWork));
}

function defaultLifecycleActions(
  creativeAi: CreativeAiConversationProjection,
  hasActiveWork: boolean,
): readonly ConversationLifecycleAction[] {
  if (creativeAi.lifecycleState === 'archived') {
    return hasActiveWork ? ['restore', 'delete', 'stop-and-delete'] : ['restore', 'delete'];
  }
  if (creativeAi.lifecycleState !== 'active') {
    return [];
  }
  return hasActiveWork
    ? ['archive', 'delete', 'stop-and-archive', 'stop-and-delete']
    : ['archive', 'delete'];
}

function projectLifecycleAction(
  action: ConversationLifecycleAction,
  hasActiveWork: boolean,
): HistoryConversationLifecycleActionItem {
  const disabledByActiveWork = hasActiveWork && (action === 'archive' || action === 'delete');
  const disabledStopAction = !hasActiveWork && action.startsWith('stop-and-');
  const enabled = !disabledByActiveWork && !disabledStopAction;
  return {
    action,
    enabled,
    labelKey: `history.lifecycle.${action}`,
    titleKey: enabled
      ? `history.lifecycle.${action}`
      : disabledByActiveWork
        ? 'history.lifecycleDisabled.activeWork'
        : 'history.lifecycleDisabled.noActiveWork',
    tone:
      action === 'delete' || action === 'stop-and-delete'
        ? 'danger'
        : action === 'stop-and-archive'
          ? 'warning'
          : 'neutral',
    ...(!enabled
      ? {
          diagnostic: disabledByActiveWork
            ? 'Active creative AI work is running. Use a stop action first.'
            : 'No active creative AI work is running.',
        }
      : {}),
  };
}
