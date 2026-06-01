import type {
  ChatMessage,
  CreativeEntityRef,
  NpcProfileSource,
  NpcTestMode,
  NpcTranscriptArtifact,
  NpcTranscriptMessage,
} from '@neko/shared';
import { NPC_TRANSCRIPT_ARTIFACT_VERSION } from '@neko/shared';
import { projectNpcSystemPrompt } from '../prompt/npc-profile-projector';
import type { AgentToolPolicy, ModelTier } from '../subagent/types';

export interface NpcConversationSessionConfig {
  readonly toolPolicy: AgentToolPolicy;
  readonly modelTier: ModelTier;
  readonly maxIterations: number;
}

export interface NpcConversationResponderInput {
  readonly sessionId: string;
  readonly entityRef: CreativeEntityRef;
  readonly profileSnapshot: NpcProfileSource;
  readonly mode: NpcTestMode;
  readonly systemPrompt: string;
  readonly transcript: readonly NpcTranscriptMessage[];
  readonly userMessage: NpcTranscriptMessage;
  readonly config: NpcConversationSessionConfig;
  readonly signal: AbortSignal;
}

export interface NpcConversationResponderResult {
  readonly content: string;
  readonly metadata?: Readonly<Record<string, string | number | boolean | null>>;
}

export type NpcConversationResponder = (
  input: NpcConversationResponderInput,
) => Promise<NpcConversationResponderResult>;

export interface NpcConversationSessionOptions {
  readonly id: string;
  readonly entityRef: CreativeEntityRef;
  readonly profileSnapshot: NpcProfileSource;
  readonly mode: NpcTestMode;
  readonly responder: NpcConversationResponder;
  readonly systemPrompt?: string;
  readonly config?: Partial<NpcConversationSessionConfig>;
  readonly now?: () => string;
  readonly createMessageId?: (role: NpcTranscriptMessage['role'], turnIndex: number) => string;
  readonly seedTranscript?: readonly NpcTranscriptMessage[];
}

export interface NpcConversationTurn {
  readonly sessionId: string;
  readonly userMessage: NpcTranscriptMessage;
  readonly npcMessage: NpcTranscriptMessage;
  readonly transcript: readonly NpcTranscriptMessage[];
}

export interface NpcConversationSessionSnapshot {
  readonly id: string;
  readonly entityRef: CreativeEntityRef;
  readonly profileSnapshot: NpcProfileSource;
  readonly mode: NpcTestMode;
  readonly systemPrompt: string;
  readonly config: NpcConversationSessionConfig;
  readonly transcript: readonly NpcTranscriptMessage[];
  readonly status: 'active' | 'disposed';
}

export const NPC_CONVERSATION_DEFAULT_CONFIG: NpcConversationSessionConfig = {
  toolPolicy: { kind: 'none' },
  modelTier: 'balanced',
  maxIterations: 12,
};

export class NpcConversationSession {
  readonly id: string;
  readonly entityRef: CreativeEntityRef;
  readonly profileSnapshot: NpcProfileSource;
  readonly mode: NpcTestMode;
  readonly systemPrompt: string;
  readonly config: NpcConversationSessionConfig;

  private readonly responder: NpcConversationResponder;
  private readonly now: () => string;
  private readonly createMessageId: (
    role: NpcTranscriptMessage['role'],
    turnIndex: number,
  ) => string;
  private readonly transcript: NpcTranscriptMessage[] = [];
  private activeTurn: AbortController | undefined;
  private turnIndex = 0;
  private disposed = false;

  constructor(options: NpcConversationSessionOptions) {
    this.id = options.id;
    this.entityRef = options.entityRef;
    this.profileSnapshot = options.profileSnapshot;
    this.mode = options.mode;
    this.systemPrompt =
      options.systemPrompt ??
      projectNpcSystemPrompt(options.profileSnapshot, { mode: options.mode });
    this.config = {
      ...NPC_CONVERSATION_DEFAULT_CONFIG,
      ...(options.config ?? {}),
      toolPolicy: options.config?.toolPolicy ?? NPC_CONVERSATION_DEFAULT_CONFIG.toolPolicy,
    };
    this.responder = options.responder;
    this.now = options.now ?? (() => new Date().toISOString());
    this.createMessageId =
      options.createMessageId ?? ((role, turnIndex) => `npc-msg-${this.id}-${turnIndex}-${role}`);
    if (options.seedTranscript) {
      this.transcript.push(...options.seedTranscript);
      this.turnIndex = Math.max(
        0,
        ...options.seedTranscript.map((message) => message.turnIndex ?? 0),
      );
    }
  }

  get status(): 'active' | 'disposed' {
    return this.disposed ? 'disposed' : 'active';
  }

  async sendUserMessage(content: string): Promise<NpcConversationTurn> {
    this.assertActive();
    if (this.activeTurn) {
      throw new Error(`NPC session is already responding: ${this.id}`);
    }

    const trimmed = content.trim();
    if (!trimmed) {
      throw new Error('NPC user message cannot be empty.');
    }

    const turnIndex = ++this.turnIndex;
    const userMessage: NpcTranscriptMessage = {
      id: this.createMessageId('user', turnIndex),
      role: 'user',
      content: trimmed,
      createdAt: this.now(),
      turnIndex,
    };
    this.transcript.push(userMessage);

    const abortController = new AbortController();
    this.activeTurn = abortController;

    try {
      const result = await this.responder({
        sessionId: this.id,
        entityRef: this.entityRef,
        profileSnapshot: this.profileSnapshot,
        mode: this.mode,
        systemPrompt: this.systemPrompt,
        transcript: this.getTranscript(),
        userMessage,
        config: this.config,
        signal: abortController.signal,
      });
      const npcMessage: NpcTranscriptMessage = {
        id: this.createMessageId('npc', turnIndex),
        role: 'npc',
        content: result.content,
        createdAt: this.now(),
        turnIndex,
        speakerName: this.profileSnapshot.displayName,
        ...(result.metadata ? { metadata: result.metadata } : {}),
      };
      this.transcript.push(npcMessage);

      return {
        sessionId: this.id,
        userMessage,
        npcMessage,
        transcript: this.getTranscript(),
      };
    } catch (error) {
      const failedUserMessageIndex = this.transcript.findIndex(
        (message) => message.id === userMessage.id,
      );
      if (failedUserMessageIndex >= 0) {
        this.transcript.splice(failedUserMessageIndex, 1);
      }
      throw error;
    } finally {
      this.activeTurn = undefined;
    }
  }

  getTranscript(): readonly NpcTranscriptMessage[] {
    return this.transcript.map((message) => ({ ...message }));
  }

  toArtifact(
    input: { readonly createdAt?: string; readonly profileHash?: string } = {},
  ): NpcTranscriptArtifact {
    return {
      version: NPC_TRANSCRIPT_ARTIFACT_VERSION,
      createdAt: input.createdAt ?? this.now(),
      entityRef: this.entityRef,
      mode: this.mode,
      profileSnapshot: this.profileSnapshot,
      transcript: this.getTranscript(),
      sessionId: this.id,
      ...(input.profileHash ? { profileHash: input.profileHash } : {}),
    };
  }

  snapshot(): NpcConversationSessionSnapshot {
    return {
      id: this.id,
      entityRef: this.entityRef,
      profileSnapshot: this.profileSnapshot,
      mode: this.mode,
      systemPrompt: this.systemPrompt,
      config: this.config,
      transcript: this.getTranscript(),
      status: this.status,
    };
  }

  cancel(): void {
    this.activeTurn?.abort();
    this.activeTurn = undefined;
  }

  dispose(): void {
    this.cancel();
    this.disposed = true;
  }

  private assertActive(): void {
    if (this.disposed) {
      throw new Error(`NPC session has been disposed: ${this.id}`);
    }
  }
}

export function projectNpcTranscriptToChatMessages(input: {
  readonly systemPrompt: string;
  readonly transcript: readonly NpcTranscriptMessage[];
}): ChatMessage[] {
  const messages: ChatMessage[] = [{ role: 'system', content: input.systemPrompt }];

  for (const message of input.transcript) {
    if (message.role === 'user') {
      messages.push({ role: 'user', content: message.content });
    }
    if (message.role === 'npc') {
      messages.push({ role: 'assistant', content: message.content });
    }
  }

  return messages;
}
