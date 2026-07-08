import type {
  ActiveSkillLifecycleRecordProjection,
  AgentCapabilityAvailabilityDiagnostic,
  AgentCapabilityProviderAvailabilitySummary,
} from '@neko/shared';
import type { AgentMessageQueueSnapshot, AgentPhase } from '@neko-agent/types';
import { getConversationWorkDirHash } from './conversation-id';

export type AgentWorkspaceRuntimeStateSource = 'extension' | 'tui' | 'cli';
export type AgentWorkspaceRuntimeStatus =
  | 'idle'
  | 'running'
  | 'waiting_confirmation'
  | 'error'
  | 'interactive';
export type AgentWorkspaceRuntimeExecutionMode = 'plan' | 'ask' | 'auto';
export type AgentWorkspaceRuntimeSessionMode = 'agent' | 'image' | 'video' | 'audio';
export type AgentWorkspaceRuntimeMediaCategory = 'image' | 'video' | 'audio';

export interface AgentWorkspaceRuntimeTokenUsage {
  readonly input: number;
  readonly output: number;
  readonly total: number;
}

export interface AgentWorkspaceRuntimeModelSelection {
  readonly providerId: string;
  readonly modelId: string;
}

export interface AgentWorkspaceRuntimeConversationState {
  readonly conversationId: string;
  readonly updatedAt: number;
  readonly updatedBy: AgentWorkspaceRuntimeStateSource;
  readonly status: AgentWorkspaceRuntimeStatus;
  readonly phase?: AgentPhase;
  readonly toolName?: string;
  readonly startedAt?: number;
  readonly executionMode?: AgentWorkspaceRuntimeExecutionMode;
  readonly sessionMode?: AgentWorkspaceRuntimeSessionMode;
  readonly tokenUsage?: AgentWorkspaceRuntimeTokenUsage;
  readonly contextTokenCount?: number;
  readonly messageQueue?: AgentMessageQueueSnapshot;
  readonly chatModel?: AgentWorkspaceRuntimeModelSelection;
  readonly mediaModels?: Partial<Record<AgentWorkspaceRuntimeMediaCategory, string>>;
  readonly llmParameterSummary?: string;
  readonly activeSkills?: readonly ActiveSkillLifecycleRecordProjection[];
  readonly capabilityProviders?: readonly AgentCapabilityProviderAvailabilitySummary[];
  readonly capabilityDiagnostics?: readonly AgentCapabilityAvailabilityDiagnostic[];
  readonly errorMessage?: string;
}

export interface AgentWorkspaceRuntimeState {
  readonly version: 1;
  readonly workDir: string;
  readonly updatedAt: number;
  readonly updatedBy: AgentWorkspaceRuntimeStateSource;
  readonly activeConversationId?: string | null;
  readonly conversations: Record<string, AgentWorkspaceRuntimeConversationState>;
}

export interface AgentWorkspaceRuntimeStatePatch {
  readonly activeConversationId?: string | null;
  readonly conversation?: Omit<
    Partial<AgentWorkspaceRuntimeConversationState>,
    'conversationId' | 'updatedAt' | 'updatedBy'
  > & {
    readonly conversationId: string;
  };
}

export interface AgentWorkspaceRuntimeStateFsOps {
  readFile(path: string): Promise<string>;
  writeFile(path: string, content: string): Promise<void>;
  exists(path: string): Promise<boolean>;
}

export interface AgentWorkspaceRuntimeStateRuntimeOptions {
  readonly workDir: string;
  readonly source: AgentWorkspaceRuntimeStateSource;
  readonly filePath: string;
  readonly fs: AgentWorkspaceRuntimeStateFsOps;
  readonly now?: () => number;
}

export interface AgentWorkspaceRuntimeStateRuntime {
  readonly filePath: string;
  read(): Promise<AgentWorkspaceRuntimeState>;
  patch(input: AgentWorkspaceRuntimeStatePatch): Promise<AgentWorkspaceRuntimeState>;
  clearConversation(conversationId: string): Promise<AgentWorkspaceRuntimeState>;
}

export class FileAgentWorkspaceRuntimeStateRuntime
  implements AgentWorkspaceRuntimeStateRuntime
{
  readonly filePath: string;

  constructor(private readonly options: AgentWorkspaceRuntimeStateRuntimeOptions) {
    this.filePath = options.filePath;
  }

  async read(): Promise<AgentWorkspaceRuntimeState> {
    return this.readState();
  }

  async patch(input: AgentWorkspaceRuntimeStatePatch): Promise<AgentWorkspaceRuntimeState> {
    const current = await this.readState();
    const now = this.readNow();
    const conversations = { ...current.conversations };

    if (input.conversation) {
      const previous = conversations[input.conversation.conversationId];
      const next: AgentWorkspaceRuntimeConversationState = {
        ...previous,
        ...input.conversation,
        conversationId: input.conversation.conversationId,
        updatedAt: now,
        updatedBy: this.options.source,
        status: input.conversation.status ?? previous?.status ?? 'idle',
      };
      conversations[next.conversationId] = next;
    }

    const nextState: AgentWorkspaceRuntimeState = {
      version: 1,
      workDir: this.options.workDir,
      updatedAt: now,
      updatedBy: this.options.source,
      activeConversationId:
        input.activeConversationId !== undefined
          ? input.activeConversationId
          : current.activeConversationId,
      conversations,
    };
    await this.writeState(nextState);
    return nextState;
  }

  async clearConversation(conversationId: string): Promise<AgentWorkspaceRuntimeState> {
    const current = await this.readState();
    const conversations = { ...current.conversations };
    delete conversations[conversationId];
    const now = this.readNow();
    const nextState: AgentWorkspaceRuntimeState = {
      version: 1,
      workDir: this.options.workDir,
      updatedAt: now,
      updatedBy: this.options.source,
      activeConversationId:
        current.activeConversationId === conversationId ? null : current.activeConversationId,
      conversations,
    };
    await this.writeState(nextState);
    return nextState;
  }

  private async readState(): Promise<AgentWorkspaceRuntimeState> {
    if (!(await this.options.fs.exists(this.options.filePath))) {
      return createEmptyAgentWorkspaceRuntimeState({
        workDir: this.options.workDir,
        source: this.options.source,
        now: this.readNow(),
      });
    }

    const raw = await this.options.fs.readFile(this.options.filePath);
    const parsed = JSON.parse(raw) as unknown;
    return parseAgentWorkspaceRuntimeState(parsed, this.options.workDir);
  }

  private async writeState(state: AgentWorkspaceRuntimeState): Promise<void> {
    await this.options.fs.writeFile(this.options.filePath, `${JSON.stringify(state, null, 2)}\n`);
  }

  private readNow(): number {
    return this.options.now?.() ?? Date.now();
  }
}

export function createAgentWorkspaceRuntimeStateRuntime(
  options: AgentWorkspaceRuntimeStateRuntimeOptions,
): AgentWorkspaceRuntimeStateRuntime {
  return new FileAgentWorkspaceRuntimeStateRuntime(options);
}

export function createFileAgentWorkspaceRuntimeStateRuntime(options: {
  readonly workDir: string;
  readonly source: AgentWorkspaceRuntimeStateSource;
  readonly now?: () => number;
}): AgentWorkspaceRuntimeStateRuntime {
  const fs = require('fs') as typeof import('fs');
  const path = require('path') as typeof import('path');

  return createAgentWorkspaceRuntimeStateRuntime({
    ...options,
    filePath: getAgentWorkspaceRuntimeStateFilePath(options.workDir),
    fs: {
      readFile: (filePath) => fs.promises.readFile(filePath, 'utf-8'),
      writeFile: async (filePath, content) => {
        await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
        await fs.promises.writeFile(filePath, content, 'utf-8');
      },
      exists: async (filePath) => {
        try {
          await fs.promises.access(filePath);
          return true;
        } catch {
          return false;
        }
      },
    },
  });
}

export function getAgentWorkspaceRuntimeStateFilePath(workDir: string): string {
  const path = require('path') as typeof import('path');
  const os = require('os') as typeof import('os');
  const workspaceHash = getConversationWorkDirHash(workDir);
  return path.join(os.homedir(), '.neko', 'workspaces', workspaceHash, 'agent-runtime-state.json');
}

export function createEmptyAgentWorkspaceRuntimeState(input: {
  readonly workDir: string;
  readonly source: AgentWorkspaceRuntimeStateSource;
  readonly now: number;
}): AgentWorkspaceRuntimeState {
  return {
    version: 1,
    workDir: input.workDir,
    updatedAt: input.now,
    updatedBy: input.source,
    activeConversationId: null,
    conversations: {},
  };
}

function parseAgentWorkspaceRuntimeState(
  value: unknown,
  expectedWorkDir: string,
): AgentWorkspaceRuntimeState {
  if (!isRecord(value)) {
    throw new Error('Agent workspace runtime state must be an object');
  }
  if (value.version !== 1) {
    throw new Error('Unsupported agent workspace runtime state version');
  }
  if (value.workDir !== expectedWorkDir) {
    throw new Error('Agent workspace runtime state workDir mismatch');
  }
  if (!isFiniteNumber(value.updatedAt)) {
    throw new Error('Agent workspace runtime state updatedAt must be a finite number');
  }
  if (!isRuntimeSource(value.updatedBy)) {
    throw new Error('Agent workspace runtime state updatedBy is invalid');
  }
  if (
    value.activeConversationId !== undefined &&
    value.activeConversationId !== null &&
    typeof value.activeConversationId !== 'string'
  ) {
    throw new Error('Agent workspace runtime state activeConversationId is invalid');
  }
  if (!isRecord(value.conversations)) {
    throw new Error('Agent workspace runtime state conversations must be an object');
  }

  const conversations: Record<string, AgentWorkspaceRuntimeConversationState> = {};
  for (const [conversationId, conversation] of Object.entries(value.conversations)) {
    conversations[conversationId] = parseConversationState(conversationId, conversation);
  }

  return {
    version: 1,
    workDir: expectedWorkDir,
    updatedAt: value.updatedAt,
    updatedBy: value.updatedBy,
    activeConversationId:
      value.activeConversationId === undefined ? null : value.activeConversationId,
    conversations,
  };
}

function parseConversationState(
  key: string,
  value: unknown,
): AgentWorkspaceRuntimeConversationState {
  if (!isRecord(value)) {
    throw new Error(`Agent workspace runtime conversation "${key}" must be an object`);
  }
  if (value.conversationId !== key) {
    throw new Error(`Agent workspace runtime conversation key mismatch: ${key}`);
  }
  if (!isFiniteNumber(value.updatedAt)) {
    throw new Error(`Agent workspace runtime conversation "${key}" updatedAt is invalid`);
  }
  if (!isRuntimeSource(value.updatedBy)) {
    throw new Error(`Agent workspace runtime conversation "${key}" updatedBy is invalid`);
  }
  if (!isRuntimeStatus(value.status)) {
    throw new Error(`Agent workspace runtime conversation "${key}" status is invalid`);
  }
  if (value.executionMode !== undefined && !isExecutionMode(value.executionMode)) {
    throw new Error(`Agent workspace runtime conversation "${key}" executionMode is invalid`);
  }
  if (value.sessionMode !== undefined && !isSessionMode(value.sessionMode)) {
    throw new Error(`Agent workspace runtime conversation "${key}" sessionMode is invalid`);
  }

  const tokenUsage = parseTokenUsage(value.tokenUsage);
  const messageQueue = parseMessageQueueSnapshot(value.messageQueue);
  const chatModel = parseModelSelection(value.chatModel);
  const mediaModels = parseMediaModels(value.mediaModels);
  const activeSkills = parseActiveSkills(value.activeSkills);
  const capabilityProviders = parseCapabilityProviders(value.capabilityProviders);
  const capabilityDiagnostics = parseCapabilityDiagnostics(value.capabilityDiagnostics);

  return {
    conversationId: key,
    updatedAt: value.updatedAt,
    updatedBy: value.updatedBy,
    status: value.status,
    ...(isAgentPhase(value.phase) ? { phase: value.phase } : {}),
    ...(typeof value.toolName === 'string' ? { toolName: value.toolName } : {}),
    ...(isFiniteNumber(value.startedAt) ? { startedAt: value.startedAt } : {}),
    ...(isExecutionMode(value.executionMode) ? { executionMode: value.executionMode } : {}),
    ...(isSessionMode(value.sessionMode) ? { sessionMode: value.sessionMode } : {}),
    ...(tokenUsage ? { tokenUsage } : {}),
    ...(isFiniteNumber(value.contextTokenCount)
      ? { contextTokenCount: value.contextTokenCount }
      : {}),
    ...(messageQueue ? { messageQueue } : {}),
    ...(chatModel ? { chatModel } : {}),
    ...(mediaModels ? { mediaModels } : {}),
    ...(typeof value.llmParameterSummary === 'string'
      ? { llmParameterSummary: value.llmParameterSummary }
      : {}),
    ...(activeSkills ? { activeSkills } : {}),
    ...(capabilityProviders ? { capabilityProviders } : {}),
    ...(capabilityDiagnostics ? { capabilityDiagnostics } : {}),
    ...(typeof value.errorMessage === 'string' ? { errorMessage: value.errorMessage } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isRuntimeSource(value: unknown): value is AgentWorkspaceRuntimeStateSource {
  return value === 'extension' || value === 'tui' || value === 'cli';
}

function isRuntimeStatus(value: unknown): value is AgentWorkspaceRuntimeStatus {
  return (
    value === 'idle' ||
    value === 'running' ||
    value === 'waiting_confirmation' ||
    value === 'error' ||
    value === 'interactive'
  );
}

function isExecutionMode(value: unknown): value is AgentWorkspaceRuntimeExecutionMode {
  return value === 'plan' || value === 'ask' || value === 'auto';
}

function isSessionMode(value: unknown): value is AgentWorkspaceRuntimeSessionMode {
  return value === 'agent' || value === 'image' || value === 'video' || value === 'audio';
}

function isAgentPhase(value: unknown): value is AgentPhase {
  return value === 'idle' || value === 'thinking' || value === 'acting' || value === 'streaming';
}

function parseTokenUsage(value: unknown): AgentWorkspaceRuntimeTokenUsage | undefined {
  if (!isRecord(value)) return undefined;
  if (
    !isFiniteNumber(value.input) ||
    !isFiniteNumber(value.output) ||
    !isFiniteNumber(value.total)
  ) {
    return undefined;
  }
  return {
    input: value.input,
    output: value.output,
    total: value.total,
  };
}

function parseMessageQueueSnapshot(value: unknown): AgentMessageQueueSnapshot | undefined {
  if (!isRecord(value)) return undefined;
  if (
    typeof value.conversationId !== 'string' ||
    !Array.isArray(value.items) ||
    !isFiniteNumber(value.pendingCount) ||
    !isFiniteNumber(value.version)
  ) {
    return undefined;
  }

  const items = value.items
    .map(parseQueuedMessageItem)
    .filter((item): item is AgentMessageQueueSnapshot['items'][number] => Boolean(item));
  if (items.length !== value.items.length) {
    return undefined;
  }

  return {
    conversationId: value.conversationId,
    items,
    pendingCount: value.pendingCount,
    version: value.version,
  };
}

function parseQueuedMessageItem(
  value: unknown,
): AgentMessageQueueSnapshot['items'][number] | undefined {
  if (!isRecord(value)) return undefined;
  if (
    typeof value.id !== 'string' ||
    typeof value.conversationId !== 'string' ||
    typeof value.content !== 'string' ||
    !isFiniteNumber(value.createdAt) ||
    !isQueuedMessageSource(value.source)
  ) {
    return undefined;
  }
  return {
    id: value.id,
    conversationId: value.conversationId,
    content: value.content,
    createdAt: value.createdAt,
    source: value.source,
    ...(isFiniteNumber(value.updatedAt) ? { updatedAt: value.updatedAt } : {}),
  };
}

function isQueuedMessageSource(
  value: unknown,
): value is AgentMessageQueueSnapshot['items'][number]['source'] {
  return value === 'composer' || value === 'task-result-observation';
}

function parseModelSelection(value: unknown): AgentWorkspaceRuntimeModelSelection | undefined {
  if (!isRecord(value)) return undefined;
  if (typeof value.providerId !== 'string' || typeof value.modelId !== 'string') {
    return undefined;
  }
  return {
    providerId: value.providerId,
    modelId: value.modelId,
  };
}

function parseMediaModels(
  value: unknown,
): Partial<Record<AgentWorkspaceRuntimeMediaCategory, string>> | undefined {
  if (!isRecord(value)) return undefined;
  const mediaModels: Partial<Record<AgentWorkspaceRuntimeMediaCategory, string>> = {};
  for (const category of ['image', 'video', 'audio'] as const) {
    if (typeof value[category] === 'string') {
      mediaModels[category] = value[category];
    }
  }
  return Object.keys(mediaModels).length > 0 ? mediaModels : undefined;
}

function parseActiveSkills(
  value: unknown,
): readonly ActiveSkillLifecycleRecordProjection[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const records = value
    .map(parseActiveSkill)
    .filter((record): record is ActiveSkillLifecycleRecordProjection => Boolean(record));
  return records.length === value.length ? records : undefined;
}

function parseActiveSkill(value: unknown): ActiveSkillLifecycleRecordProjection | undefined {
  if (!isRecord(value)) return undefined;
  if (
    typeof value.id !== 'string' ||
    typeof value.skillName !== 'string' ||
    !isSkillLifecycleSlot(value.slot) ||
    !isSkillLifecycleOwner(value.owner) ||
    typeof value.clearable !== 'boolean' ||
    !isSkillLifecycleRecordStatus(value.status)
  ) {
    return undefined;
  }
  return {
    id: value.id,
    skillName: value.skillName,
    slot: value.slot,
    owner: value.owner,
    clearable: value.clearable,
    status: value.status,
    ...(typeof value.lockedReason === 'string' ? { lockedReason: value.lockedReason } : {}),
    ...(typeof value.expires === 'string' ? { expires: value.expires } : {}),
  };
}

function parseCapabilityProviders(
  value: unknown,
): readonly AgentCapabilityProviderAvailabilitySummary[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const providers = value
    .map(parseCapabilityProvider)
    .filter(
      (provider): provider is AgentCapabilityProviderAvailabilitySummary => Boolean(provider),
    );
  return providers.length === value.length ? providers : undefined;
}

function parseCapabilityProvider(
  value: unknown,
): AgentCapabilityProviderAvailabilitySummary | undefined {
  if (!isRecord(value) || typeof value.providerId !== 'string') return undefined;
  if (!Array.isArray(value.loaded) || !Array.isArray(value.skipped)) return undefined;
  const loaded = value.loaded
    .map(parseCapabilityContributionSummary)
    .filter((entry): entry is NonNullable<ReturnType<typeof parseCapabilityContributionSummary>> =>
      Boolean(entry),
    );
  const skipped = parseCapabilityDiagnostics(value.skipped);
  if (loaded.length !== value.loaded.length || !skipped) return undefined;
  return {
    providerId: value.providerId,
    ...(typeof value.version === 'string' ? { version: value.version } : {}),
    loaded,
    skipped,
  };
}

function parseCapabilityContributionSummary(value: unknown):
  | AgentCapabilityProviderAvailabilitySummary['loaded'][number]
  | undefined {
  if (!isRecord(value)) return undefined;
  if (!isCapabilityContributionKind(value.kind) || typeof value.name !== 'string') {
    return undefined;
  }
  return { kind: value.kind, name: value.name };
}

function parseCapabilityDiagnostics(
  value: unknown,
): readonly AgentCapabilityAvailabilityDiagnostic[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const diagnostics = value
    .map(parseCapabilityDiagnostic)
    .filter((entry): entry is AgentCapabilityAvailabilityDiagnostic => Boolean(entry));
  return diagnostics.length === value.length ? diagnostics : undefined;
}

function parseCapabilityDiagnostic(
  value: unknown,
): AgentCapabilityAvailabilityDiagnostic | undefined {
  if (!isRecord(value)) return undefined;
  if (
    !isCapabilityDiagnosticLevel(value.level) ||
    typeof value.providerId !== 'string' ||
    !isCapabilityContributionKind(value.contributionKind) ||
    typeof value.code !== 'string' ||
    typeof value.reason !== 'string' ||
    typeof value.message !== 'string'
  ) {
    return undefined;
  }
  return {
    level: value.level,
    providerId: value.providerId,
    contributionKind: value.contributionKind,
    code: value.code,
    reason: value.reason,
    message: value.message,
    ...(typeof value.contributionName === 'string'
      ? { contributionName: value.contributionName }
      : {}),
    ...(typeof value.requirement === 'string' ? { requirement: value.requirement } : {}),
    ...(isCapabilityHost(value.host) ? { host: value.host } : {}),
  };
}

function isSkillLifecycleSlot(
  value: unknown,
): value is ActiveSkillLifecycleRecordProjection['slot'] {
  return (
    value === 'stagePersona' ||
    value === 'domainSkill' ||
    value === 'referenceSkill' ||
    value === 'ephemeralSkill' ||
    value === 'promptChainSkill'
  );
}

function isSkillLifecycleOwner(
  value: unknown,
): value is ActiveSkillLifecycleRecordProjection['owner'] {
  return value === 'user' || value === 'agent' || value === 'creation-profile' || value === 'runtime';
}

function isSkillLifecycleRecordStatus(
  value: unknown,
): value is ActiveSkillLifecycleRecordProjection['status'] {
  return value === 'active' || value === 'expiring' || value === 'expired' || value === 'blocked';
}

function isCapabilityContributionKind(
  value: unknown,
): value is AgentCapabilityProviderAvailabilitySummary['loaded'][number]['kind'] {
  return (
    value === 'provider' ||
    value === 'tool' ||
    value === 'skill' ||
    value === 'toolGroup' ||
    value === 'promptFragment' ||
    value === 'providerCard' ||
    value === 'referenceContributor'
  );
}

function isCapabilityDiagnosticLevel(
  value: unknown,
): value is AgentCapabilityAvailabilityDiagnostic['level'] {
  return value === 'info' || value === 'warn' || value === 'error';
}

function isCapabilityHost(value: unknown): value is AgentCapabilityAvailabilityDiagnostic['host'] {
  return value === 'vscode' || value === 'cli' || value === 'tui';
}
