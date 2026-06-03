import type {
  ChatMessage,
  CreativeEntityOccurrenceProjection,
  CreativeEntityRef,
  CreativeEntityRelationshipProjection,
  CreativeEntityRepresentationHint,
  NpcProfileFact,
  NpcProfileSource,
  NpcTranscriptArtifact,
  NpcTranscriptMessage,
} from '@neko/shared';
import { NPC_TRANSCRIPT_ARTIFACT_VERSION } from '@neko/shared';
import type { AgentToolPolicy, ModelTier } from '../subagent/types';
import { renderCharacterEvidenceBundle, type CharacterEvidenceBundle } from './character-evidence';

export type EmbodyCharacterFeedbackClassification =
  | 'confirmed'
  | 'inferred'
  | 'unknown'
  | 'out-of-scope'
  | 'mode-boundary';

export interface EmbodyCharacterCapabilityPolicy {
  readonly kind: 'character-feedback-readonly';
}

export interface EmbodyCharacterSessionConfig {
  readonly toolPolicy: AgentToolPolicy;
  readonly capabilityPolicy: EmbodyCharacterCapabilityPolicy;
  readonly modelTier: ModelTier;
  readonly maxIterations: number;
}

export interface EmbodyCharacterEvidenceSnapshot {
  readonly relationships: readonly CreativeEntityRelationshipProjection[];
  readonly occurrences: readonly CreativeEntityOccurrenceProjection[];
  readonly representationHints: readonly CreativeEntityRepresentationHint[];
  readonly scriptContextFacts: readonly NpcProfileFact[];
}

export interface EmbodyCharacterResponderInput {
  readonly sessionId: string;
  readonly entityRef: CreativeEntityRef;
  readonly profileSnapshot: NpcProfileSource;
  readonly evidenceSnapshot: EmbodyCharacterEvidenceSnapshot;
  readonly systemPrompt: string;
  readonly turnEvidence?: CharacterEvidenceBundle;
  readonly transcript: readonly NpcTranscriptMessage[];
  readonly userMessage: NpcTranscriptMessage;
  readonly config: EmbodyCharacterSessionConfig;
  readonly signal: AbortSignal;
}

export interface EmbodyCharacterResponderResult {
  readonly content: string;
  readonly classifications?: readonly EmbodyCharacterFeedbackClassification[];
  readonly metadata?: Readonly<Record<string, string | number | boolean | null>>;
}

export type EmbodyCharacterResponder = (
  input: EmbodyCharacterResponderInput,
) => Promise<EmbodyCharacterResponderResult>;

export interface EmbodyCharacterSessionOptions {
  readonly id: string;
  readonly entityRef: CreativeEntityRef;
  readonly profileSnapshot: NpcProfileSource;
  readonly evidenceSnapshot: EmbodyCharacterEvidenceSnapshot;
  readonly responder: EmbodyCharacterResponder;
  readonly systemPrompt?: string;
  readonly prompt?: string;
  readonly config?: Partial<EmbodyCharacterSessionConfig>;
  readonly now?: () => string;
  readonly createMessageId?: (role: NpcTranscriptMessage['role'], turnIndex: number) => string;
  readonly seedTranscript?: readonly NpcTranscriptMessage[];
}

export interface EmbodyCharacterSendUserMessageOptions {
  readonly turnEvidence?: CharacterEvidenceBundle;
}

export interface EmbodyCharacterTurn {
  readonly sessionId: string;
  readonly userMessage: NpcTranscriptMessage;
  readonly feedbackMessage: NpcTranscriptMessage;
  readonly transcript: readonly NpcTranscriptMessage[];
}

export interface EmbodyCharacterSessionSnapshot {
  readonly id: string;
  readonly entityRef: CreativeEntityRef;
  readonly profileSnapshot: NpcProfileSource;
  readonly evidenceSnapshot: EmbodyCharacterEvidenceSnapshot;
  readonly systemPrompt: string;
  readonly prompt?: string;
  readonly config: EmbodyCharacterSessionConfig;
  readonly transcript: readonly NpcTranscriptMessage[];
  readonly status: 'active' | 'disposed';
}

export const EMBODY_CHARACTER_DEFAULT_CONFIG: EmbodyCharacterSessionConfig = {
  toolPolicy: { kind: 'none' },
  capabilityPolicy: { kind: 'character-feedback-readonly' },
  modelTier: 'balanced',
  maxIterations: 8,
};

export const EMBODY_CHARACTER_BLOCKED_TOOL_NAMES = [
  'ActivateSkill',
  'DeactivateSkill',
  'Write',
  'Edit',
  'Bash',
  'CreateTask',
  'UpdateTask',
  'ApplyEntitySuggestion',
  'GenerateImage',
  'GenerateVideo',
  'GenerateAudio',
] as const;

export function isToolAllowedForEmbodyCharacter(toolName: string): boolean {
  return !EMBODY_CHARACTER_BLOCKED_TOOL_NAMES.includes(
    toolName as (typeof EMBODY_CHARACTER_BLOCKED_TOOL_NAMES)[number],
  );
}

export class EmbodyCharacterSession {
  readonly id: string;
  readonly entityRef: CreativeEntityRef;
  readonly profileSnapshot: NpcProfileSource;
  readonly evidenceSnapshot: EmbodyCharacterEvidenceSnapshot;
  readonly systemPrompt: string;
  readonly prompt?: string;
  readonly config: EmbodyCharacterSessionConfig;

  private readonly responder: EmbodyCharacterResponder;
  private readonly now: () => string;
  private readonly createMessageId: (
    role: NpcTranscriptMessage['role'],
    turnIndex: number,
  ) => string;
  private readonly transcript: NpcTranscriptMessage[] = [];
  private activeTurn: AbortController | undefined;
  private turnIndex = 0;
  private disposed = false;

  constructor(options: EmbodyCharacterSessionOptions) {
    this.id = options.id;
    this.entityRef = options.entityRef;
    this.profileSnapshot = options.profileSnapshot;
    this.evidenceSnapshot = options.evidenceSnapshot;
    this.prompt = options.prompt;
    this.systemPrompt =
      options.systemPrompt ??
      projectEmbodyCharacterFeedbackPrompt({
        profile: options.profileSnapshot,
        evidence: options.evidenceSnapshot,
        prompt: options.prompt,
      });
    this.config = {
      ...EMBODY_CHARACTER_DEFAULT_CONFIG,
      ...(options.config ?? {}),
      toolPolicy: options.config?.toolPolicy ?? EMBODY_CHARACTER_DEFAULT_CONFIG.toolPolicy,
      capabilityPolicy:
        options.config?.capabilityPolicy ?? EMBODY_CHARACTER_DEFAULT_CONFIG.capabilityPolicy,
    };
    this.responder = options.responder;
    this.now = options.now ?? (() => new Date().toISOString());
    this.createMessageId =
      options.createMessageId ??
      ((role, turnIndex) => `embody-character-msg-${this.id}-${turnIndex}-${role}`);
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

  async sendUserMessage(
    content: string,
    options: EmbodyCharacterSendUserMessageOptions = {},
  ): Promise<EmbodyCharacterTurn> {
    this.assertActive();
    if (this.activeTurn) {
      throw new Error(`Embody Character session is already responding: ${this.id}`);
    }

    const trimmed = content.trim();
    if (!trimmed) {
      throw new Error('Embody Character user message cannot be empty.');
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
        evidenceSnapshot: this.evidenceSnapshot,
        systemPrompt: buildEmbodyCharacterTurnSystemPrompt({
          baseSystemPrompt: this.systemPrompt,
          turnEvidence: options.turnEvidence,
        }),
        ...(options.turnEvidence ? { turnEvidence: options.turnEvidence } : {}),
        transcript: this.getTranscript(),
        userMessage,
        config: this.config,
        signal: abortController.signal,
      });
      const feedbackMessage: NpcTranscriptMessage = {
        id: this.createMessageId('evaluator', turnIndex),
        role: 'evaluator',
        content: result.content,
        createdAt: this.now(),
        turnIndex,
        speakerName: 'Character feedback',
        metadata: {
          capabilityPolicy: this.config.capabilityPolicy.kind,
          toolPolicy: this.config.toolPolicy.kind,
          ...(result.classifications ? { classifications: result.classifications.join(',') } : {}),
          ...(result.metadata ?? {}),
        },
      };
      this.transcript.push(feedbackMessage);

      return {
        sessionId: this.id,
        userMessage,
        feedbackMessage,
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
      mode: 'consult',
      profileSnapshot: this.profileSnapshot,
      transcript: this.getTranscript(),
      sessionId: this.id,
      ...(input.profileHash ? { profileHash: input.profileHash } : {}),
    };
  }

  snapshot(): EmbodyCharacterSessionSnapshot {
    return {
      id: this.id,
      entityRef: this.entityRef,
      profileSnapshot: this.profileSnapshot,
      evidenceSnapshot: this.evidenceSnapshot,
      systemPrompt: this.systemPrompt,
      ...(this.prompt ? { prompt: this.prompt } : {}),
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
      throw new Error(`Embody Character session has been disposed: ${this.id}`);
    }
  }
}

export function projectEmbodyCharacterTranscriptToChatMessages(input: {
  readonly systemPrompt: string;
  readonly transcript: readonly NpcTranscriptMessage[];
}): ChatMessage[] {
  const messages: ChatMessage[] = [{ role: 'system', content: input.systemPrompt }];

  for (const message of input.transcript) {
    if (message.role === 'user') {
      messages.push({ role: 'user', content: message.content });
    }
    if (message.role === 'evaluator') {
      messages.push({ role: 'assistant', content: message.content });
    }
  }

  return messages;
}

export function projectEmbodyCharacterFeedbackPrompt(input: {
  readonly profile: NpcProfileSource;
  readonly evidence: EmbodyCharacterEvidenceSnapshot;
  readonly prompt?: string;
}): string {
  const lines = [
    `You are a read-only character embodiment coach for ${input.profile.displayName}.`,
    'The user is embodying the character. You stay out-of-character and must not play, impersonate, or speak as the character.',
    'Help the user understand who they are embodying, what the character can know, and whether their roleplay fits project evidence.',
    'Answer like a normal conversation partner in the same language as the user. Be concise, direct, and warm.',
    'Default to second-person phrasing such as "你今天去了..." and "你遇到了...", not report-like headings or audit language.',
    'Do not repeat the embodied identity on every turn. Say "你现在代入的是..." only for identity questions, first-turn clarification, or when the user seems confused.',
    'Do not lead with labels such as "已确认依据", "根据证据", "分类", or "评估". Mention evidence, uncertainty, or contradictions only when it changes the answer.',
    'Prefer one short paragraph for simple knowledge questions. Use bullets only when the user asks for a list or the answer would otherwise be hard to scan.',
    '',
    'Request handling:',
    '- Identity/current-role questions: state the embodied character briefly, then answer the actual question.',
    '- Character knowledge questions: answer the question first from loaded project evidence; briefly qualify possible or unconfirmed details after the main answer.',
    '- Roleplay consistency checks: respond conversationally with what fits, what does not fit, and one or two small adjustment suggestions.',
    '- Creative execution or project-state requests: do not write, record, create, mutate, generate media, activate skills, create tasks, or save diary entries. Reframe the request as read-only role-knowledge or consistency feedback.',
    'Do not activate skills, write files, mutate character settings, create tasks, generate media, or record diary entries.',
    '',
    'Confirmed facts:',
    ...formatFacts(input.profile.facts.filter((fact) => fact.authority === 'confirmed')),
    '',
    'Suggested or inferred facts:',
    ...formatFacts(input.profile.facts.filter((fact) => fact.authority === 'suggested')),
    '',
    `Relationships available: ${input.evidence.relationships.length}.`,
    `Occurrences available: ${input.evidence.occurrences.length}.`,
    `Script context facts available: ${input.evidence.scriptContextFacts.length}.`,
    ...formatFacts(input.evidence.scriptContextFacts),
  ];
  if (input.prompt?.trim()) {
    lines.push('', `User setup note: ${input.prompt.trim()}`);
  }
  return lines.join('\n');
}

export function buildEmbodyCharacterTurnSystemPrompt(input: {
  readonly baseSystemPrompt: string;
  readonly turnEvidence?: CharacterEvidenceBundle;
}): string {
  if (!input.turnEvidence) return input.baseSystemPrompt;
  return [
    input.baseSystemPrompt,
    '',
    renderCharacterEvidenceBundle(input.turnEvidence),
    '',
    'Use this evidence only for read-only feedback on the current user roleplay turn. Do not activate skills, mutate project state, or claim access to project files beyond the loaded evidence.',
  ].join('\n');
}

function formatFacts(facts: readonly NpcProfileFact[]): string[] {
  if (facts.length === 0) return ['- none'];
  return facts.slice(0, 24).map((fact) => `- ${fact.key}: ${JSON.stringify(fact.value)}`);
}
