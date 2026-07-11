import type { AgentQueuedMessageItem, Message } from '@neko-agent/types';
import type { ActiveTurnTimelineState } from '@/presenters/active-turn-timeline-presenter';

export type ConversationVisibility = 'foreground' | 'background';
export type TimelineSynchronization = 'synchronized' | 'suspended' | 'unavailable';
export type ConversationRetention = 'retained' | 'disposed';

export interface ConversationViewportSnapshot {
  readonly followMode: 'follow-tail' | 'detached';
  readonly anchorMessageId?: string;
  readonly anchorOffset?: number;
}

export interface ConversationStreamingSnapshot {
  readonly streamingMessageId: string | null;
  readonly isThinking: boolean;
  readonly queuedMessageCount: number;
  readonly queuedMessages: readonly AgentQueuedMessageItem[];
  readonly messageQueueVersion?: number;
  readonly activeTurnTimeline: ActiveTurnTimelineState | null;
  readonly synchronization: TimelineSynchronization;
}

export interface ConversationRenderSnapshot {
  readonly conversationId: string;
  readonly revision: number;
  readonly messages: readonly Message[];
  readonly streaming: ConversationStreamingSnapshot;
  readonly viewport: ConversationViewportSnapshot;
  readonly visibility: ConversationVisibility;
  readonly retention: ConversationRetention;
}

interface RevisionedConversationMutation {
  readonly conversationId: string;
  readonly baseRevision: number;
}

export type ConversationRenderMutation =
  | (RevisionedConversationMutation & {
      readonly kind: 'host-snapshot';
      readonly messages: readonly Message[];
      readonly streaming: ConversationStreamingSnapshot;
      readonly viewport?: ConversationViewportSnapshot;
    })
  | (RevisionedConversationMutation & {
      readonly kind: 'timeline-commit';
      readonly messages: readonly Message[];
      readonly streaming: ConversationStreamingSnapshot;
    })
  | (RevisionedConversationMutation & {
      readonly kind: 'queue-status';
      readonly queuedMessageCount: number;
      readonly queuedMessages: readonly AgentQueuedMessageItem[];
      readonly messageQueueVersion?: number;
      readonly isThinking?: boolean;
    })
  | (RevisionedConversationMutation & {
      readonly kind: 'completion';
      readonly messages: readonly Message[];
    })
  | (RevisionedConversationMutation & {
      readonly kind: 'viewport-update';
      readonly viewport: ConversationViewportSnapshot;
    })
  | {
      readonly kind: 'activation';
      readonly conversationId: string;
      readonly source: ConversationActivationSource;
    }
  | {
      readonly kind: 'disposal';
      readonly conversationId: string;
      readonly reason: 'conversation-delete' | 'confirmed-empty-conversation';
    };

export type ConversationActivationSource =
  'ui-tab' | 'character-role-tab' | 'extension-tab-state' | 'extension-active-conversation';

export interface ConversationVisibleStatePort {
  commit(snapshot: ConversationRenderSnapshot): void;
  currentConversationId(): string | null;
}

export interface ConversationRenderPublication {
  publish(): void;
}

export interface ConversationMarkdownTimelineResourceOwner {
  prepare(snapshot: ConversationRenderSnapshot): ConversationRenderPublication;
  disposeConversation(conversationId: string): void;
}

export type ConversationRenderDiagnosticCode =
  | 'stale-revision'
  | 'conversation-identity-mismatch'
  | 'conversation-snapshot-unavailable'
  | 'conversation-disposed'
  | 'activation-already-committed'
  | 'visible-state-commit-mismatch'
  | 'markdown-resource-owner-missing'
  | 'background-visible-state-write'
  | 'activation-publication-order-invalid';

export interface ConversationRenderDiagnostic {
  readonly code: ConversationRenderDiagnosticCode;
  readonly message: string;
  readonly conversationId: string;
  readonly activationSource?: ConversationActivationSource;
  readonly currentRevision?: number;
  readonly targetRevision?: number;
  readonly messageId?: string;
  readonly turnId?: string;
}

export class ConversationRenderLifecycleError extends Error {
  constructor(readonly diagnostic: ConversationRenderDiagnostic) {
    super(`${diagnostic.code}: ${diagnostic.message}`);
    this.name = 'ConversationRenderLifecycleError';
  }
}

export interface ConversationActivationTransaction {
  readonly snapshot: ConversationRenderSnapshot;
  readonly source: ConversationActivationSource;
  commit(input: {
    readonly visibleState: ConversationVisibleStatePort;
    readonly markdown?: ConversationMarkdownTimelineResourceOwner;
  }): void;
}

export const DEFAULT_CONVERSATION_VIEWPORT: ConversationViewportSnapshot = {
  followMode: 'follow-tail',
};

export function createIdleConversationStreamingSnapshot(): ConversationStreamingSnapshot {
  return {
    streamingMessageId: null,
    isThinking: false,
    queuedMessageCount: 0,
    queuedMessages: [],
    activeTurnTimeline: null,
    synchronization: 'synchronized',
  };
}
