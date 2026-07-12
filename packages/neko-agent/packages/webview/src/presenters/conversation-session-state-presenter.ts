import type {
  AgentState,
  AgentWorkItem,
  AgentWorkItemStore,
  ConversationStreamingState,
  Message,
  PromptMode,
} from '@neko-agent/types';
import type {
  MessageAttachment,
  SelectedFileReference,
} from '@/components/ChatView/InputArea/types';
import type { ActiveSkillIndicator } from '@/components/ChatView/SkillIndicator';
import type { ActivationProgressTimeline } from './activation-progress-presenter';

export interface ConversationAmbientNode {
  readonly nodeId: string;
  readonly type: string;
  readonly summary: string;
}

export type ConversationSessionStreamingState = ConversationStreamingState;

export type ConversationSessionActiveSkill = ActiveSkillIndicator & {
  readonly conversationId: string;
};

export interface ConversationSessionSkillProjection {
  readonly activeSkill: ConversationSessionActiveSkill | null;
  readonly activationProgress: readonly ActivationProgressTimeline[];
}

export interface ConversationSessionContextProjection {
  readonly ambientNodes: readonly ConversationAmbientNode[];
  readonly tokenCount: number;
  readonly isCompressing: boolean;
}

export interface ConversationSessionInputState {
  readonly inputValue: string;
  readonly attachedFiles: readonly MessageAttachment[];
  readonly selectedFileReferences: readonly SelectedFileReference[];
}

export interface ConversationSessionState {
  readonly conversationId: string;
  readonly messages: readonly Message[];
  readonly streaming: ConversationSessionStreamingState;
  readonly promptMode: PromptMode;
  readonly skill: ConversationSessionSkillProjection;
  readonly context: ConversationSessionContextProjection;
  readonly agentState: AgentState | null;
  readonly workItems: readonly AgentWorkItem[];
  readonly input: ConversationSessionInputState;
}

export type ConversationSessionStateMap = ReadonlyMap<string, ConversationSessionState>;

export interface ProjectConversationSessionStateInput {
  readonly conversationId: string;
  readonly messagesByConversation: ReadonlyMap<string, readonly Message[]>;
  readonly streamingByConversation: ReadonlyMap<string, ConversationSessionStreamingState>;
  readonly promptModeByConversation?: ReadonlyMap<string, PromptMode>;
  readonly activeSkillByConversation?: ReadonlyMap<string, ConversationSessionActiveSkill | null>;
  readonly activationProgressByConversation?: ReadonlyMap<
    string,
    readonly ActivationProgressTimeline[]
  >;
  readonly ambientNodesByConversation?: ReadonlyMap<string, readonly ConversationAmbientNode[]>;
  readonly tokenCountByConversation?: ReadonlyMap<string, number>;
  readonly compressingByConversation?: ReadonlyMap<string, boolean>;
  readonly agentStateByConversation?: ReadonlyMap<string, AgentState>;
  readonly workItemsByConversation?: AgentWorkItemStore;
  readonly inputByConversation?: ReadonlyMap<string, ConversationSessionInputState>;
  readonly defaultPromptMode?: PromptMode;
}

export function projectConversationSessionState(
  input: ProjectConversationSessionStateInput,
): ConversationSessionState {
  const conversationId = input.conversationId;
  return {
    conversationId,
    messages: [...(input.messagesByConversation.get(conversationId) ?? [])],
    streaming: normalizeSessionStreamingState(input.streamingByConversation.get(conversationId)),
    promptMode:
      input.promptModeByConversation?.get(conversationId) ?? input.defaultPromptMode ?? 'default',
    skill: {
      activeSkill: input.activeSkillByConversation?.get(conversationId) ?? null,
      activationProgress: [...(input.activationProgressByConversation?.get(conversationId) ?? [])],
    },
    context: {
      ambientNodes: [...(input.ambientNodesByConversation?.get(conversationId) ?? [])],
      tokenCount: input.tokenCountByConversation?.get(conversationId) ?? 0,
      isCompressing: input.compressingByConversation?.get(conversationId) ?? false,
    },
    agentState: input.agentStateByConversation?.get(conversationId) ?? null,
    workItems: [...(input.workItemsByConversation?.get(conversationId)?.values() ?? [])],
    input: {
      ...emptyConversationInputState(),
      ...(input.inputByConversation?.get(conversationId) ?? {}),
    },
  };
}

export function projectConversationSessionActiveSkillMap(input: {
  readonly activeSkillByConversation: ReadonlyMap<string, ConversationSessionActiveSkill>;
  readonly visibleConversationId: string | null;
  readonly value:
    | ConversationSessionActiveSkill
    | null
    | ((current: ConversationSessionActiveSkill | null) => ConversationSessionActiveSkill | null);
}): Map<string, ConversationSessionActiveSkill> {
  const visibleConversationId = input.visibleConversationId;
  const currentValue = visibleConversationId
    ? (input.activeSkillByConversation.get(visibleConversationId) ?? null)
    : null;
  const nextValue = typeof input.value === 'function' ? input.value(currentValue) : input.value;
  const targetConversationId = nextValue?.conversationId ?? visibleConversationId;
  if (!targetConversationId) {
    return new Map(input.activeSkillByConversation);
  }

  const next = new Map(input.activeSkillByConversation);
  if (nextValue) {
    next.set(targetConversationId, nextValue);
  } else {
    next.delete(targetConversationId);
  }
  return next;
}

export function normalizeSessionStreamingState(
  streaming: ConversationSessionStreamingState | undefined,
): ConversationSessionStreamingState {
  if (!streaming) {
    return idleSessionStreamingState();
  }
  return {
    streamingMessageId: streaming.streamingMessageId,
    isThinking: streaming.isThinking,
    queuedMessageCount: streaming.queuedMessageCount ?? 0,
    queuedMessages: streaming.queuedMessages ? [...streaming.queuedMessages] : [],
    ...(streaming.messageQueueVersion !== undefined
      ? { messageQueueVersion: streaming.messageQueueVersion }
      : {}),
  };
}

export function idleSessionStreamingState(): ConversationSessionStreamingState {
  return {
    streamingMessageId: null,
    isThinking: false,
    queuedMessageCount: 0,
    queuedMessages: [],
  };
}

function emptyConversationInputState(): ConversationSessionInputState {
  return {
    inputValue: '',
    attachedFiles: [],
    selectedFileReferences: [],
  };
}
