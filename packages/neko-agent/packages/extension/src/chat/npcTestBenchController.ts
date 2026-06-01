import * as path from 'node:path';
import * as vscode from 'vscode';
import { toSharedService, type Platform } from '@neko/platform';
import type {
  CreativeEntityOccurrenceProjection,
  CreativeEntityRef,
  CreativeEntityRelationshipProjection,
  CreativeEntityRepresentationHint,
  CreativeEntitySourceKind,
  DashboardCreativeEntityDetail,
  DashboardCreativeEntityOccurrenceRef,
  DashboardCreativeEntityRef,
  DashboardCreativeEntityRelationshipSummary,
  DashboardCreativeEntitySource,
  NpcProfileFact,
  NpcProfileRelationshipValue,
  NpcSerializableValue,
  NpcEvaluationReport,
  NpcEvaluationSuggestion,
  NpcProfileSource,
  NpcTestBenchLaunchRequest,
  NpcTestMode,
  NpcTranscriptArtifact,
  NpcTranscriptMessage,
  ServiceResponse,
} from '@neko/shared';
import {
  NPC_TRANSCRIPT_ARTIFACT_VERSION,
  isCreativeEntityRef,
  isNpcSerializableValue,
} from '@neko/shared';
import {
  DASHBOARD_CREATIVE_ENTITY_SOURCE_COMMAND,
  DASHBOARD_NEUTRAL_CREATIVE_ENTITY_SOURCE_COMMAND,
  isDashboardCreativeEntityDetail,
  isDashboardCreativeEntitySource,
  type DashboardCreativeEntitySourceRequest,
} from '@neko/shared/types/dashboard-creative-entity';
import {
  NpcConversationSession,
  projectNpcTranscriptToChatMessages,
  type NpcConversationResponder,
} from '@neko/agent/runtime';
import { parseNpcEvaluationReportOutput, projectNpcEvaluationPrompt } from '@neko/agent';
import type {
  AssembleNpcProfileInput,
  NpcProfileAssemblerReaders,
  NpcProfileAssemblyResult,
} from '@neko/entity/projections';
import { NpcProfileAssembler } from '@neko/entity/projections';
import { createVSCodeEntityServices } from '@neko/entity/host-vscode';
import {
  buildErrorMessage,
  buildNpcSessionExitedMessage,
  buildNpcSessionStartedMessage,
  buildStreamCompleteMessage,
  buildStreamTextMessage,
  buildThinkingMessage,
  type ModelRef,
  type NpcSessionProjection,
  type OpenTab,
} from '@neko-agent/types';
import { getLogger } from '../base';

export interface NpcTestBenchControllerDeps {
  readonly getWebview: () => vscode.Webview | undefined;
  readonly getProjectRoot: () => string | undefined;
  readonly createAssembler?: (projectRoot: string) => NpcProfileAssemblerPort;
  readonly createResponder?: (
    input: NpcConversationResponderFactoryInput,
  ) => NpcConversationResponder;
  readonly getPlatform?: () => Platform | undefined;
  readonly getSelectedChatModel?: () => ModelRef<'llm'> | undefined;
  readonly updateTabState: (openTabs: OpenTab[], activeTabId: string | null) => void;
  readonly getTabState: () => {
    readonly openTabs: readonly OpenTab[];
    readonly activeTabId: string | null;
  };
  readonly sendTabState: () => void;
  readonly getActiveConversationId?: () => string | null;
  readonly resolveEntityRef?: (
    input: NpcEntityResolutionInput,
  ) => Promise<CreativeEntityRef | null>;
  readonly pickEntityRef?: (input: NpcEntityPickerInput) => Promise<CreativeEntityRef | null>;
  readonly chooseThinProfileAction?: (
    input: NpcThinProfileActionInput,
  ) => Promise<NpcThinProfileAction>;
  readonly enrichProfile?: (
    input: NpcProfileEnrichmentInput,
  ) => Promise<NpcProfileEnrichmentResult>;
  readonly promptUserSupplement?: (input: NpcManualSupplementInput) => Promise<string | undefined>;
  readonly evaluateTranscript?: (input: NpcEvaluationInput) => Promise<NpcEvaluationReport>;
  readonly chooseSavePolicy?: (input: NpcSavePolicyInput) => Promise<NpcTranscriptSavePolicy>;
  readonly saveTranscriptArtifact?: (
    input: NpcTranscriptArtifactSaveInput,
  ) => Promise<NpcTranscriptArtifactSaveResult | null>;
  readonly confirmSuggestionApply?: (
    input: NpcSuggestionApplyConfirmationInput,
  ) => Promise<boolean>;
  readonly applySuggestion?: (input: NpcSuggestionApplyInput) => Promise<NpcSuggestionApplyResult>;
  readonly now?: () => string;
  readonly createSessionId?: (entityRef: CreativeEntityRef) => string;
  readonly createMessageId?: (role: NpcTranscriptMessage['role'], turnIndex: number) => string;
  readonly logger?: Pick<ReturnType<typeof getLogger>, 'warn' | 'debug'>;
}

export interface NpcConversationResponderFactoryInput {
  readonly platform: Platform | undefined;
  readonly chatModel?: ModelRef<'llm'>;
  readonly now: () => string;
}

export interface NpcProfileAssemblerPort {
  assembleProfile(input: AssembleNpcProfileInput): Promise<NpcProfileAssemblyResult>;
}

export interface NpcEntityResolutionInput {
  readonly token: string;
  readonly projectRoot: string;
}

export interface NpcEntityPickerInput {
  readonly projectRoot: string;
}

export type NpcThinProfileAction = 'start-now' | 'enrich-project' | 'manual-supplement';
export type NpcTranscriptSavePolicy = 'ask' | 'always' | 'never';

export interface NpcThinProfileActionInput {
  readonly projectRoot: string;
  readonly profile: NpcProfileSource;
  readonly request: NpcTestBenchLaunchRequest;
}

export interface NpcProfileEnrichmentInput {
  readonly projectRoot: string;
  readonly profile: NpcProfileSource;
  readonly request: NpcTestBenchLaunchRequest;
}

export interface NpcProfileEnrichmentResult {
  readonly profile: NpcProfileSource;
}

export interface NpcManualSupplementInput {
  readonly projectRoot: string;
  readonly profile: NpcProfileSource;
}

export interface NpcEvaluationInput {
  readonly artifact: NpcTranscriptArtifact;
  readonly projectRoot: string;
}

export interface NpcSavePolicyInput {
  readonly artifact: NpcTranscriptArtifact;
  readonly projectRoot: string;
  readonly reason: NpcSessionExitReason;
}

export interface NpcTranscriptArtifactSaveInput {
  readonly artifact: NpcTranscriptArtifact;
  readonly projectRoot: string;
}

export interface NpcTranscriptArtifactSaveResult {
  readonly path: string;
}

export interface NpcSuggestionApplyConfirmationInput {
  readonly suggestion: NpcEvaluationSuggestion;
  readonly projectRoot: string;
}

export interface NpcSuggestionApplyInput {
  readonly suggestion: NpcEvaluationSuggestion;
  readonly projectRoot: string;
}

export interface NpcSuggestionApplyResult {
  readonly applied: boolean;
  readonly message?: string;
}

export type NpcSessionExitReason = 'user' | 'cancelled' | 'disposed';

export interface NpcSessionLaunchResult {
  readonly sessionId: string;
  readonly tab: OpenTab;
  readonly session: NpcSessionProjection;
}

export interface NpcSessionExitResult {
  readonly sessionId: string;
  readonly artifact: NpcTranscriptArtifact;
  readonly savedPath?: string;
}

const logger = getLogger('NpcTestBenchController');

export class NpcTestBenchController implements vscode.Disposable {
  private readonly sessions = new Map<string, NpcConversationSession>();
  private readonly deps: NpcTestBenchControllerDeps;

  constructor(deps: NpcTestBenchControllerDeps) {
    this.deps = deps;
  }

  hasSession(sessionId: string): boolean {
    return this.sessions.has(sessionId);
  }

  async launch(request: NpcTestBenchLaunchRequest): Promise<NpcSessionLaunchResult | null> {
    const projectRoot = this.resolveProjectRoot(request);
    if (!projectRoot) {
      this.postGlobalError('Open a workspace before starting an NPC test session.');
      return null;
    }

    const entityRef = this.normalizeEntityRef(request.entityRef, projectRoot);
    const assembler =
      this.deps.createAssembler?.(projectRoot) ?? createDefaultNpcProfileAssembler(projectRoot);
    const assembly = await assembler.assembleProfile({
      entityRef,
      ...(request.userSupplements ? { userSupplements: request.userSupplements } : {}),
    });
    if (assembly.status !== 'assembled') {
      this.postGlobalError(assembly.reason);
      return null;
    }

    const profile = await this.prepareProfileForLaunch({
      profile: assembly.profile,
      projectRoot,
      request,
    });
    if (!profile) return null;

    const mode = request.mode ?? 'roleplay';
    const sessionId = this.deps.createSessionId?.(entityRef) ?? createNpcSessionId(entityRef);
    const session = new NpcConversationSession({
      id: sessionId,
      entityRef,
      profileSnapshot: profile,
      mode,
      responder: this.createResponder(),
      now: this.now,
      ...(this.deps.createMessageId ? { createMessageId: this.deps.createMessageId } : {}),
    });
    this.sessions.set(sessionId, session);

    const projection = projectNpcSession(session, { projectRoot, startedAt: this.now() });
    const tab: OpenTab = {
      id: `tab-${sessionId}`,
      title: `NPC: ${projection.displayName}`,
      conversationId: sessionId,
      kind: 'npc-test',
      npcSession: projection,
    };
    const openTabs = upsertNpcTab(this.deps.getTabState().openTabs, tab);
    this.deps.updateTabState(openTabs, tab.id);
    this.deps
      .getWebview()
      ?.postMessage(buildNpcSessionStartedMessage({ tab, session: projection }));
    this.deps.sendTabState();

    if (request.initialUserMessage?.trim()) {
      await this.routeUserMessage(sessionId, request.initialUserMessage);
    }

    return { sessionId, tab, session: projection };
  }

  async routeUserMessage(sessionId: string, message: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    const webview = this.deps.getWebview();
    const trimmed = message.trim();
    if (!trimmed) {
      return true;
    }

    webview?.postMessage(buildThinkingMessage(sessionId));

    try {
      const turn = await session.sendUserMessage(trimmed);
      webview?.postMessage(
        buildStreamTextMessage({
          conversationId: sessionId,
          messageId: turn.npcMessage.id,
          content: turn.npcMessage.content,
        }),
      );
      webview?.postMessage(
        buildStreamCompleteMessage({
          conversationId: sessionId,
          messageId: turn.npcMessage.id,
        }),
      );
    } catch (error) {
      webview?.postMessage(
        buildErrorMessage({
          conversationId: sessionId,
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }

    return true;
  }

  cancel(sessionId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) return false;
    session.cancel();
    return true;
  }

  async exit(
    sessionId: string,
    reason: NpcSessionExitReason = 'user',
  ): Promise<NpcSessionExitResult | null> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    const projectRoot = session.entityRef.projectRoot ?? this.deps.getProjectRoot();
    const initialArtifact = session.toArtifact();
    const artifact =
      projectRoot && reason !== 'disposed'
        ? await this.evaluateArtifact(initialArtifact, projectRoot)
        : initialArtifact;
    const saved = projectRoot
      ? await this.maybeSaveArtifact({
          artifact,
          projectRoot,
          reason,
        })
      : null;
    session.dispose();
    this.sessions.delete(sessionId);
    this.markTabExited(sessionId);
    this.deps.getWebview()?.postMessage(
      buildNpcSessionExitedMessage({
        sessionId,
        artifact,
        ...(saved?.path ? { savedPath: saved.path } : {}),
      }),
    );
    return {
      sessionId,
      artifact,
      ...(saved?.path ? { savedPath: saved.path } : {}),
    };
  }

  async exitActive(fallbackConversationId?: string): Promise<NpcSessionExitResult | null> {
    const tabState = this.deps.getTabState();
    const activeTab = tabState.activeTabId
      ? tabState.openTabs.find((tab) => tab.id === tabState.activeTabId)
      : undefined;
    const sessionId =
      activeTab?.kind === 'npc-test'
        ? activeTab.conversationId
        : fallbackConversationId && this.hasSession(fallbackConversationId)
          ? fallbackConversationId
          : undefined;
    if (!sessionId) {
      this.postGlobalError('No active NPC session to exit.');
      return null;
    }
    return this.exit(sessionId);
  }

  async applyEvaluationSuggestion(input: {
    readonly suggestion: NpcEvaluationSuggestion;
    readonly projectRoot?: string;
  }): Promise<NpcSuggestionApplyResult> {
    const projectRoot =
      input.projectRoot ??
      (input.suggestion.applyTarget.kind === 'entity-metadata'
        ? input.suggestion.applyTarget.entityRef.projectRoot
        : undefined);
    const resolvedProjectRoot = projectRoot ?? this.deps.getProjectRoot();
    if (!resolvedProjectRoot) {
      return { applied: false, message: 'Open a workspace before applying NPC suggestions.' };
    }

    const confirmed =
      (await this.deps.confirmSuggestionApply?.({
        suggestion: input.suggestion,
        projectRoot: resolvedProjectRoot,
      })) ?? false;
    if (!confirmed) {
      return { applied: false, message: 'NPC suggestion was not confirmed.' };
    }

    return (
      this.deps.applySuggestion?.({
        suggestion: input.suggestion,
        projectRoot: resolvedProjectRoot,
      }) ??
      defaultApplyNpcSuggestion({
        suggestion: input.suggestion,
        projectRoot: resolvedProjectRoot,
      })
    );
  }

  async launchFromSlash(input: {
    readonly args?: string;
    readonly conversationId?: string;
  }): Promise<NpcSessionLaunchResult | null> {
    const projectRoot = this.deps.getProjectRoot();
    if (!projectRoot) {
      this.postGlobalError('Open a workspace before starting an NPC test session.');
      return null;
    }

    const parsed = parseNpcSlashArgs(input.args);
    const entityRef =
      parsed.entityRef ??
      (parsed.entityToken
        ? await this.resolveEntityRef(parsed.entityToken, projectRoot)
        : await this.pickEntityRef(projectRoot));
    if (!entityRef) {
      this.postGlobalError('Choose a project character before starting an NPC test.');
      return null;
    }

    return this.launch({
      entityRef,
      source: 'slash-command',
      mode: parsed.mode,
      ...(parsed.enrichment ? { enrichment: parsed.enrichment } : {}),
      projectRoot,
      ...(parsed.initialUserMessage ? { initialUserMessage: parsed.initialUserMessage } : {}),
    });
  }

  private async prepareProfileForLaunch(input: {
    readonly profile: NpcProfileSource;
    readonly projectRoot: string;
    readonly request: NpcTestBenchLaunchRequest;
  }): Promise<NpcProfileSource | null> {
    if (input.profile.sparsity !== 'thin') {
      return input.profile;
    }

    const action = await this.resolveThinProfileAction(input);
    if (action === 'start-now') {
      return input.profile;
    }

    if (action === 'enrich-project') {
      const enriched =
        (await this.deps.enrichProfile?.(input)) ??
        (await this.createDefaultProfileEnrichment(input));
      return enriched.profile;
    }

    const supplement = await this.deps.promptUserSupplement?.({
      projectRoot: input.projectRoot,
      profile: input.profile,
    });
    if (supplement === undefined) {
      this.postGlobalError('NPC test launch cancelled before manual profile supplement.');
      return null;
    }
    return appendUserSupplement(input.profile, supplement);
  }

  private async resolveThinProfileAction(input: {
    readonly profile: NpcProfileSource;
    readonly projectRoot: string;
    readonly request: NpcTestBenchLaunchRequest;
  }): Promise<NpcThinProfileAction> {
    switch (input.request.enrichment) {
      case 'skip':
        return 'start-now';
      case 'auto':
        return 'enrich-project';
      case 'manual':
        return 'manual-supplement';
      case 'ask':
      case undefined:
        return (
          (await this.deps.chooseThinProfileAction?.(input)) ??
          (await defaultChooseThinProfileAction(input.profile))
        );
    }
  }

  private async evaluateArtifact(
    artifact: NpcTranscriptArtifact,
    projectRoot: string,
  ): Promise<NpcTranscriptArtifact> {
    const evaluation =
      (await this.deps.evaluateTranscript?.({ artifact, projectRoot })) ??
      (await this.createDefaultEvaluationReport(artifact));
    return { ...artifact, evaluation };
  }

  private async createDefaultEvaluationReport(
    artifact: NpcTranscriptArtifact,
  ): Promise<NpcEvaluationReport> {
    const platform = this.deps.getPlatform?.();
    if (platform) {
      try {
        const prompts = projectNpcEvaluationPrompt(artifact);
        const service = toSharedService(platform.createService());
        const response = await service.chat(
          [
            { role: 'system', content: prompts.systemPrompt },
            { role: 'user', content: prompts.userPrompt },
          ],
          {
            modelId: this.deps.getSelectedChatModel?.()?.modelId,
            tools: [],
            toolChoice: 'none',
            maxTokens: 2000,
          },
        );
        const parsed = parseNpcEvaluationReportOutput(extractResponseText(response));
        if (parsed.status === 'parsed') {
          return parsed.report;
        }
        (this.deps.logger ?? logger).warn('NPC evaluator output was invalid', {
          reason: parsed.reason,
        });
      } catch (error) {
        (this.deps.logger ?? logger).warn('NPC evaluator failed; using fallback report', {
          error,
        });
      }
    }

    return createFallbackNpcEvaluationReport(artifact, this.now());
  }

  private async createDefaultProfileEnrichment(
    input: NpcProfileEnrichmentInput,
  ): Promise<NpcProfileEnrichmentResult> {
    return defaultEnrichNpcProfile({
      ...input,
      platform: this.deps.getPlatform?.(),
      chatModel: this.deps.getSelectedChatModel?.(),
      now: this.now,
      logger: this.deps.logger ?? logger,
    });
  }

  private async maybeSaveArtifact(input: {
    readonly artifact: NpcTranscriptArtifact;
    readonly projectRoot: string;
    readonly reason: NpcSessionExitReason;
  }): Promise<NpcTranscriptArtifactSaveResult | null> {
    const policy =
      (await this.deps.chooseSavePolicy?.(input)) ??
      (await defaultChooseTranscriptSavePolicy(input));
    if (policy === 'never') {
      return null;
    }

    const save =
      this.deps.saveTranscriptArtifact ?? ((saveInput) => defaultSaveTranscriptArtifact(saveInput));
    return save({ artifact: input.artifact, projectRoot: input.projectRoot });
  }

  dispose(): void {
    for (const sessionId of [...this.sessions.keys()]) {
      void this.exit(sessionId, 'disposed');
    }
  }

  private createResponder(): NpcConversationResponder {
    return (
      this.deps.createResponder?.({
        platform: this.deps.getPlatform?.(),
        chatModel: this.deps.getSelectedChatModel?.(),
        now: this.now,
      }) ??
      createPlatformNpcResponder({
        platform: this.deps.getPlatform?.(),
        chatModel: this.deps.getSelectedChatModel?.(),
      })
    );
  }

  private resolveProjectRoot(request: NpcTestBenchLaunchRequest): string | undefined {
    return request.projectRoot ?? request.entityRef.projectRoot ?? this.deps.getProjectRoot();
  }

  private normalizeEntityRef(entityRef: CreativeEntityRef, projectRoot: string): CreativeEntityRef {
    return {
      ...entityRef,
      projectRoot,
      source: entityRef.source ?? 'neko-entity',
    };
  }

  private async resolveEntityRef(
    token: string,
    projectRoot: string,
  ): Promise<CreativeEntityRef | null> {
    const configured = await this.deps.resolveEntityRef?.({ token, projectRoot });
    if (configured) return this.normalizeEntityRef(configured, projectRoot);
    const normalized = normalizeMentionToken(token);
    if (!normalized) return null;
    const services = createVSCodeEntityServices({ projectRoot, logger });
    const entity = await services.service.resolveByName(normalized, 'character');
    if (entity) {
      return this.normalizeEntityRef(
        {
          entityId: entity.id,
          entityKind: entity.kind,
          projectRoot,
          source: 'neko-entity',
        },
        projectRoot,
      );
    }
    const candidate = (await services.service.listCandidates()).find(
      (item) =>
        item.id === normalized || item.name === normalized || item.aliases?.includes(normalized),
    );
    if (candidate) {
      return this.normalizeEntityRef(
        {
          entityId: candidate.resolvedEntityRef?.entityId ?? candidate.id,
          entityKind: candidate.kind,
          projectRoot,
          source: 'neko-entity',
        },
        projectRoot,
      );
    }
    return null;
  }

  private async pickEntityRef(projectRoot: string): Promise<CreativeEntityRef | null> {
    const configured = await this.deps.pickEntityRef?.({ projectRoot });
    if (configured) return this.normalizeEntityRef(configured, projectRoot);

    const services = createVSCodeEntityServices({ projectRoot, logger });
    const [entities, candidates] = await Promise.all([
      services.service.list({ kind: 'character' }),
      services.service.listCandidates('open'),
    ]);
    const items = [
      ...entities.map((entity) => ({
        label: entity.displayName ?? entity.canonicalName,
        description: entity.aliases.join(', '),
        ref: {
          entityId: entity.id,
          entityKind: entity.kind,
          projectRoot,
          source: 'neko-entity',
        } satisfies CreativeEntityRef,
      })),
      ...candidates
        .filter((candidate) => candidate.kind === 'character')
        .map((candidate) => ({
          label: candidate.name,
          description: 'candidate',
          ref: {
            entityId: candidate.resolvedEntityRef?.entityId ?? candidate.id,
            entityKind: candidate.kind,
            projectRoot,
            source: 'neko-entity',
          } satisfies CreativeEntityRef,
        })),
    ];
    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: 'Choose a project character to test as an NPC',
      matchOnDescription: true,
    });
    return picked?.ref ?? null;
  }

  private markTabExited(sessionId: string): void {
    const tabState = this.deps.getTabState();
    const openTabs = tabState.openTabs.map((tab) =>
      tab.conversationId === sessionId && tab.npcSession
        ? {
            ...tab,
            npcSession: {
              ...tab.npcSession,
              status: 'exited' as const,
            },
          }
        : tab,
    );
    this.deps.updateTabState(openTabs, tabState.activeTabId);
    this.deps.sendTabState();
  }

  private postGlobalError(message: string): void {
    this.deps.getWebview()?.postMessage({ type: 'globalError', message });
    (this.deps.logger ?? logger).warn('NPC test bench launch failed', { message });
  }

  private readonly now = (): string => this.deps.now?.() ?? new Date().toISOString();
}

export function createDefaultNpcProfileAssembler(projectRoot: string): NpcProfileAssembler {
  const services = createVSCodeEntityServices({ projectRoot, logger });
  const evidenceReader = createDashboardNpcProfileEvidenceReader(projectRoot);
  const readers: NpcProfileAssemblerReaders = {
    getEntity: (entityId) => services.service.get(entityId),
    getCandidate: async (candidateId) =>
      (await services.service.listCandidates()).find((candidate) => candidate.id === candidateId),
    listBindings: () => services.bindings.list(),
    listVisualDrafts: () => services.drafts.list(),
    listRelationships: (entityRef) => evidenceReader.listRelationships(entityRef),
    listOccurrences: (entityRef) => evidenceReader.listOccurrences(entityRef),
    listRepresentationHints: (entityRef) => evidenceReader.listRepresentationHints(entityRef),
  };
  return new NpcProfileAssembler(readers);
}

export interface NpcProfileEvidenceReader {
  listRelationships(
    entityRef: CreativeEntityRef,
  ): Promise<readonly CreativeEntityRelationshipProjection[]>;
  listOccurrences(
    entityRef: CreativeEntityRef,
  ): Promise<readonly CreativeEntityOccurrenceProjection[]>;
  listRepresentationHints(
    entityRef: CreativeEntityRef,
  ): Promise<readonly CreativeEntityRepresentationHint[]>;
}

export interface DefaultNpcProfileEnrichmentInput extends NpcProfileEnrichmentInput {
  readonly platform?: Platform;
  readonly chatModel?: ModelRef<'llm'>;
  readonly now: () => string;
  readonly logger?: Pick<ReturnType<typeof getLogger>, 'warn' | 'debug'>;
}

export function createDashboardNpcProfileEvidenceReader(
  projectRoot: string,
): NpcProfileEvidenceReader {
  const loadDetails = createDashboardCreativeEntityDetailLoader(projectRoot);
  return {
    async listRelationships(entityRef) {
      const details = await loadDetails(entityRef);
      return dedupeByKey(
        details.flatMap((detail) =>
          detail.relationships.map((relationship) =>
            dashboardRelationshipToProjection(entityRef, relationship, detail.ref),
          ),
        ),
        relationshipProjectionKey,
      );
    },
    async listOccurrences(entityRef) {
      const details = await loadDetails(entityRef);
      return dedupeByKey(
        details.flatMap((detail) =>
          detail.occurrences.map((occurrence) =>
            dashboardOccurrenceToProjection(entityRef, occurrence, detail.ref),
          ),
        ),
        occurrenceProjectionKey,
      );
    },
    async listRepresentationHints() {
      return [];
    },
  };
}

export async function defaultEnrichNpcProfile(
  input: DefaultNpcProfileEnrichmentInput,
): Promise<NpcProfileEnrichmentResult> {
  const deterministicFacts = collectProjectEvidenceEnrichmentFacts(input.profile, input.now());
  const inferredFacts = await inferNpcProfileFactsFromProjectEvidence(input);
  const facts = mergeNpcProfileFacts(input.profile.facts, deterministicFacts, inferredFacts);
  return {
    profile: {
      ...input.profile,
      facts,
      sparsity: facts.length > input.profile.facts.length ? 'partial' : input.profile.sparsity,
      sparsityScore: projectEnrichedSparsityScore(input.profile, facts),
    },
  };
}

function collectProjectEvidenceEnrichmentFacts(
  profile: NpcProfileSource,
  observedAt: string,
): readonly NpcProfileFact[] {
  const facts: NpcProfileFact[] = [];
  for (const sample of profile.dialogueSamples ?? []) {
    facts.push({
      key: 'dialogue.sample',
      value: sample,
      source: 'script-extraction',
      authority: 'suggested',
      observedAt,
    });
  }
  for (const scene of profile.sceneAppearances ?? []) {
    facts.push({
      key: 'occurrence.sceneAppearance',
      value: scene,
      source: 'script-extraction',
      authority: 'suggested',
      observedAt,
    });
  }
  for (const relationship of profile.relationships ?? []) {
    facts.push({
      key: `relationship.suggested.${relationship.value.entityRef?.entityId ?? relationship.value.name}.${relationship.value.relation}`,
      value: serializeNpcRelationshipValue(relationship.value),
      source: 'relationship-graph',
      authority: 'suggested',
      ...(relationship.confidence !== undefined ? { confidence: relationship.confidence } : {}),
      ...(relationship.sourceRef ? { sourceRef: relationship.sourceRef } : {}),
      ...(relationship.providerId ? { providerId: relationship.providerId } : {}),
      observedAt,
    });
  }
  return facts;
}

function serializeNpcRelationshipValue(value: NpcProfileRelationshipValue): NpcSerializableValue {
  const serialized: Record<string, NpcSerializableValue> = {
    name: value.name,
    relation: value.relation,
  };
  if (value.summary) {
    serialized.summary = value.summary;
  }
  if (value.entityRef) {
    serialized.entityRef = serializeCreativeEntityRef(value.entityRef);
  }
  return serialized;
}

function serializeCreativeEntityRef(ref: CreativeEntityRef): NpcSerializableValue {
  const serialized: Record<string, NpcSerializableValue> = {
    entityId: ref.entityId,
    entityKind: ref.entityKind,
  };
  if (ref.projectRoot) {
    serialized.projectRoot = ref.projectRoot;
  }
  if (ref.source) {
    serialized.source = ref.source;
  }
  return serialized;
}

async function inferNpcProfileFactsFromProjectEvidence(
  input: DefaultNpcProfileEnrichmentInput,
): Promise<readonly NpcProfileFact[]> {
  const platform = input.platform;
  if (!platform || !hasProjectEvidenceForInference(input.profile)) {
    return [];
  }

  try {
    const service = toSharedService(platform.createService());
    const response = await service.chat(
      [
        {
          role: 'system',
          content: [
            'Extract tentative NPC profile facts from project-scoped evidence.',
            'Return JSON only: an array of objects with key, value, confidence, and optional label.',
            'Only infer personality, speechPattern, catchphrase, goals, or relationshipNotes when directly supported by the evidence.',
            'Do not invent biography, hidden story context, project files, tools, or global memory.',
          ].join('\n'),
        },
        {
          role: 'user',
          content: JSON.stringify(
            {
              entityRef: input.profile.entityRef,
              displayName: input.profile.displayName,
              aliases: input.profile.aliases,
              confirmedFacts: input.profile.facts.filter((fact) => fact.authority === 'confirmed'),
              dialogueSamples: input.profile.dialogueSamples ?? [],
              sceneAppearances: input.profile.sceneAppearances ?? [],
              relationships: input.profile.relationships ?? [],
            },
            null,
            2,
          ),
        },
      ],
      {
        modelId: input.chatModel?.modelId,
        tools: [],
        toolChoice: 'none',
        maxTokens: 1000,
      },
    );
    return parseNpcProfileEnrichmentFacts(extractResponseText(response), input.now());
  } catch (error) {
    input.logger?.warn('NPC profile enrichment failed; using deterministic evidence only', {
      error,
    });
    return [];
  }
}

function hasProjectEvidenceForInference(profile: NpcProfileSource): boolean {
  return Boolean(
    (profile.dialogueSamples?.length ?? 0) > 0 ||
    (profile.sceneAppearances?.length ?? 0) > 0 ||
    (profile.relationships?.length ?? 0) > 0,
  );
}

function parseNpcProfileEnrichmentFacts(
  output: string,
  observedAt: string,
): readonly NpcProfileFact[] {
  const json = extractJsonValuePayload(output);
  if (!json) return [];

  try {
    const parsed = JSON.parse(json) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item): NpcProfileFact | undefined => {
        if (!isRecord(item)) return undefined;
        const key = typeof item['key'] === 'string' ? item['key'].trim() : '';
        const value = item['value'];
        if (!key || !isNpcSerializableValue(value)) return undefined;
        const confidence = readConfidence(item['confidence']);
        return {
          key: key.startsWith('agent.') ? key : `agent.${key}`,
          value,
          source: 'agent-inferred',
          authority: 'suggested',
          ...(confidence !== undefined ? { confidence } : {}),
          ...(typeof item['label'] === 'string' ? { label: item['label'] } : {}),
          observedAt,
        };
      })
      .filter((fact): fact is NpcProfileFact => fact !== undefined);
  } catch {
    return [];
  }
}

function mergeNpcProfileFacts(
  existing: readonly NpcProfileFact[],
  ...groups: readonly (readonly NpcProfileFact[])[]
): readonly NpcProfileFact[] {
  const facts: NpcProfileFact[] = [];
  const seen = new Set<string>();
  for (const fact of [...existing, ...groups.flat()]) {
    const key = `${fact.key}\u0000${JSON.stringify(fact.value)}\u0000${fact.source}`;
    if (seen.has(key)) continue;
    seen.add(key);
    facts.push(fact);
  }
  return facts;
}

function projectEnrichedSparsityScore(
  profile: NpcProfileSource,
  facts: readonly NpcProfileFact[],
): NpcProfileSource['sparsityScore'] {
  const confirmedFactCount = facts.filter((fact) => fact.authority === 'confirmed').length;
  const suggestedFactCount = facts.filter((fact) => fact.authority === 'suggested').length;
  const relationshipCount = profile.relationships?.length ?? 0;
  const dialogueSampleCount = profile.dialogueSamples?.length ?? 0;
  const score =
    (profile.sparsityScore?.score ?? (profile.sparsity === 'thin' ? 0.2 : 0.5)) +
    Math.min(
      0.35,
      suggestedFactCount * 0.05 + relationshipCount * 0.08 + dialogueSampleCount * 0.08,
    );
  const level = score < 0.34 ? 'thin' : score < 0.67 ? 'partial' : 'rich';
  return {
    level,
    score,
    confirmedFactCount,
    suggestedFactCount,
    relationshipCount,
    dialogueSampleCount,
    missingFactKeys: profile.sparsityScore?.missingFactKeys?.filter(
      (key) =>
        !(key === 'relationships' && relationshipCount > 0) &&
        !(key === 'dialogueSamples' && dialogueSampleCount > 0) &&
        !(key === 'sceneAppearances' && (profile.sceneAppearances?.length ?? 0) > 0),
    ),
  };
}

function createDashboardCreativeEntityDetailLoader(
  projectRoot: string,
): (entityRef: CreativeEntityRef) => Promise<readonly DashboardCreativeEntityDetail[]> {
  const detailByEntityId = new Map<string, Promise<readonly DashboardCreativeEntityDetail[]>>();
  return (entityRef) => {
    const existing = detailByEntityId.get(entityRef.entityId);
    if (existing) return existing;
    const promise = loadDashboardCreativeEntityDetails(projectRoot, entityRef);
    detailByEntityId.set(entityRef.entityId, promise);
    return promise;
  };
}

async function loadDashboardCreativeEntityDetails(
  projectRoot: string,
  entityRef: CreativeEntityRef,
): Promise<readonly DashboardCreativeEntityDetail[]> {
  const sources = await loadDashboardCreativeEntitySources({ projectRoot });
  const details: DashboardCreativeEntityDetail[] = [];
  for (const source of orderDashboardSourcesForEntityRef(sources, entityRef)) {
    const detail = await loadDashboardCreativeEntityDetailFromSource(
      source,
      projectRoot,
      entityRef,
    );
    if (detail) details.push(detail);
  }
  return details;
}

async function loadDashboardCreativeEntitySources(
  request: DashboardCreativeEntitySourceRequest,
): Promise<readonly DashboardCreativeEntitySource[]> {
  const commands = [
    DASHBOARD_NEUTRAL_CREATIVE_ENTITY_SOURCE_COMMAND,
    DASHBOARD_CREATIVE_ENTITY_SOURCE_COMMAND,
  ] as const;
  const sources: DashboardCreativeEntitySource[] = [];

  for (const command of commands) {
    try {
      const candidate = await vscode.commands.executeCommand<unknown>(command, request);
      if (isDashboardCreativeEntitySource(candidate)) {
        sources.push(candidate);
      }
    } catch (error) {
      logger.debug('NPC profile evidence source unavailable', {
        command,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return sources;
}

function orderDashboardSourcesForEntityRef(
  sources: readonly DashboardCreativeEntitySource[],
  entityRef: CreativeEntityRef,
): readonly DashboardCreativeEntitySource[] {
  return [...sources].sort((left, right) => {
    const leftRank = sourceRankForEntityRef(left.source, entityRef);
    const rightRank = sourceRankForEntityRef(right.source, entityRef);
    return leftRank - rightRank || left.source.localeCompare(right.source);
  });
}

function sourceRankForEntityRef(source: string, entityRef: CreativeEntityRef): number {
  if (entityRef.source && source === entityRef.source) return 0;
  if (source === 'neko-story') return 1;
  if (source === 'neko-entity') return 2;
  return 3;
}

async function loadDashboardCreativeEntityDetailFromSource(
  source: DashboardCreativeEntitySource,
  projectRoot: string,
  entityRef: CreativeEntityRef,
): Promise<DashboardCreativeEntityDetail | undefined> {
  const candidates = dashboardRefsForNpcEntity(projectRoot, source.source, entityRef);
  for (const ref of candidates) {
    try {
      const detail = await source.getDetail(ref);
      if (isDashboardCreativeEntityDetail(detail)) {
        return detail;
      }
    } catch (error) {
      logger.debug('NPC profile evidence detail unavailable', {
        source: source.source,
        entityId: entityRef.entityId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return undefined;
}

function dashboardRefsForNpcEntity(
  projectRoot: string,
  source: string,
  entityRef: CreativeEntityRef,
): readonly DashboardCreativeEntityRef[] {
  const base = {
    source,
    entityId: entityRef.entityId,
    entityKind: entityRef.entityKind,
  } satisfies Omit<DashboardCreativeEntityRef, 'sourceEntityId'>;
  return [
    { ...base, sourceEntityId: `entity:${entityRef.entityId}` },
    { ...base, sourceEntityId: entityRef.entityId },
    { ...base, sourceEntityId: `candidate:${entityRef.entityKind}:${entityRef.entityId}` },
  ];
}

function dashboardRelationshipToProjection(
  entityRef: CreativeEntityRef,
  relationship: DashboardCreativeEntityRelationshipSummary,
  sourceRef: DashboardCreativeEntityRef,
): CreativeEntityRelationshipProjection {
  const fromId = relationship.from || entityRef.entityId;
  const toId = relationship.to || entityRef.entityId;
  return {
    from: {
      entityId: fromId,
      entityKind: fromId === entityRef.entityId ? entityRef.entityKind : 'character',
      ...(entityRef.projectRoot ? { projectRoot: entityRef.projectRoot } : {}),
      source: sourceRef.source,
    },
    to: {
      entityId: toId,
      entityKind: toId === entityRef.entityId ? entityRef.entityKind : 'character',
      ...(entityRef.projectRoot ? { projectRoot: entityRef.projectRoot } : {}),
      source: sourceRef.source,
    },
    type: relationship.type,
    strength: relationship.strength,
    source: {
      sourceId: sourceRef.source,
      sourceKind: dashboardSourceKind(sourceRef.source),
      sourceRef: relationship.provenance,
      providerId: sourceRef.source,
      freshness: 'fresh',
    },
    ...(relationship.confidence !== undefined ? { confidence: relationship.confidence } : {}),
  };
}

function dashboardOccurrenceToProjection(
  entityRef: CreativeEntityRef,
  occurrence: DashboardCreativeEntityOccurrenceRef,
  sourceRef: DashboardCreativeEntityRef,
): CreativeEntityOccurrenceProjection {
  return {
    entityRef,
    label: occurrence.label,
    source: {
      sourceId: sourceRef.source,
      sourceKind: dashboardOccurrenceSourceKind(occurrence.source),
      sourceRef: occurrence.location,
      providerId: sourceRef.source,
      freshness: 'fresh',
    },
    role: occurrence.role,
    location: occurrence.location,
    ...(occurrence.detail !== undefined ? { detail: occurrence.detail } : {}),
  };
}

function dashboardOccurrenceSourceKind(
  source: DashboardCreativeEntityOccurrenceRef['source'],
): CreativeEntityOccurrenceProjection['source']['sourceKind'] {
  switch (source) {
    case 'registry':
      return 'registry';
    case 'script':
      return 'story';
    case 'asset':
      return 'asset';
    case 'generated-asset':
      return 'generated';
    case 'canvas':
    case 'canvas-comment':
    case 'canvas-container':
    case 'canvas-text':
      return 'canvas';
  }
}

function dashboardSourceKind(source: string): CreativeEntitySourceKind {
  if (source === 'neko-story') return 'story';
  if (source === 'neko-entity') return 'registry';
  if (source.includes('canvas')) return 'canvas';
  if (source.includes('asset')) return 'asset';
  return 'agent';
}

function relationshipProjectionKey(relationship: CreativeEntityRelationshipProjection): string {
  return [
    relationship.from.entityId,
    relationship.to.entityId,
    relationship.type,
    relationship.source.sourceRef ?? '',
    relationship.source.providerId ?? '',
  ].join('\u0000');
}

function occurrenceProjectionKey(occurrence: CreativeEntityOccurrenceProjection): string {
  return [
    occurrence.entityRef.entityId,
    occurrence.source.sourceRef ?? occurrence.location,
    occurrence.role,
    occurrence.label,
    occurrence.source.providerId ?? '',
  ].join('\u0000');
}

function dedupeByKey<T>(items: readonly T[], getKey: (item: T) => string): readonly T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];
  for (const item of items) {
    const key = getKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(item);
  }
  return deduped;
}

export function createPlatformNpcResponder(input: {
  readonly platform?: Platform;
  readonly chatModel?: ModelRef<'llm'>;
}): NpcConversationResponder {
  return async ({ systemPrompt, transcript, config, signal }) => {
    const platform = input.platform;
    if (!platform) {
      throw new Error('No AI platform is available for NPC test sessions.');
    }

    const service = toSharedService(platform.createService());
    const messages = projectNpcTranscriptToChatMessages({ systemPrompt, transcript });
    const response = await service.chat(messages, {
      modelId: input.chatModel?.modelId,
      tools: [],
      toolChoice: 'none',
      maxTokens: 1200,
      signal,
    });

    return {
      content: extractResponseText(response),
      metadata: {
        model: response.model,
        toolPolicy: config.toolPolicy.kind,
      },
    };
  };
}

export function projectNpcSession(
  session: Pick<NpcConversationSession, 'id' | 'entityRef' | 'profileSnapshot' | 'mode' | 'status'>,
  input: { readonly projectRoot?: string; readonly startedAt: string },
): NpcSessionProjection {
  return {
    sessionId: session.id,
    entityId: session.entityRef.entityId,
    displayName: session.profileSnapshot.displayName,
    mode: session.mode,
    profile: session.profileSnapshot,
    summary: summarizeNpcProfile(session.profileSnapshot),
    startedAt: input.startedAt,
    ...(input.projectRoot ? { projectRoot: input.projectRoot } : {}),
    status: session.status === 'disposed' ? 'exited' : 'active',
  };
}

export function resolveNpcEntityRefFromSlashArgs(input: {
  readonly args?: string;
  readonly projectRoot?: string;
}): CreativeEntityRef | null {
  const parsed = parseNpcSlashArgs(input.args);
  if (parsed.entityRef) {
    return parsed.entityRef;
  }
  if (!parsed.entityToken) {
    return null;
  }
  return {
    entityId: normalizeMentionToken(parsed.entityToken),
    entityKind: 'character',
    ...(input.projectRoot ? { projectRoot: input.projectRoot } : {}),
    source: 'slash-command',
  };
}

export interface ParsedNpcSlashArgs {
  readonly entityToken?: string;
  readonly entityRef?: CreativeEntityRef;
  readonly mode: NpcTestMode;
  readonly enrichment?: NpcTestBenchLaunchRequest['enrichment'];
  readonly initialUserMessage?: string;
}

export function parseNpcSlashArgs(args: string | undefined): ParsedNpcSlashArgs {
  const tokens = tokenizeSlashArgs(args ?? '');
  let entityToken: string | undefined;
  let entityRef: CreativeEntityRef | undefined;
  let mode: NpcTestMode = 'roleplay';
  let enrichment: NpcTestBenchLaunchRequest['enrichment'];
  const messageParts: string[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === '--consult') {
      mode = 'consult';
      continue;
    }
    if (token === '--roleplay') {
      mode = 'roleplay';
      continue;
    }
    if (token.startsWith('--enrichment=')) {
      enrichment = parseEnrichmentMode(token.slice('--enrichment='.length));
      continue;
    }
    if (token === '--enrichment') {
      const next = tokens[index + 1];
      enrichment = parseEnrichmentMode(next);
      if (next && !next.startsWith('--')) {
        index += 1;
      }
      continue;
    }
    if (token === '--auto-enrich') {
      enrichment = 'auto';
      continue;
    }
    if (token === '--manual') {
      enrichment = 'manual';
      continue;
    }
    if (token === '--skip-enrich') {
      enrichment = 'skip';
      continue;
    }
    if (!entityToken && token.startsWith('@')) {
      entityToken = token;
      continue;
    }
    if (!entityToken && token.startsWith('entity:')) {
      entityToken = token;
      continue;
    }
    if (!entityRef && looksLikeCreativeEntityRef(token)) {
      const parsedRef = parseCreativeEntityRefJson(token);
      if (parsedRef) {
        entityRef = parsedRef;
        continue;
      }
    }
    messageParts.push(token);
  }

  return {
    ...(entityToken ? { entityToken } : {}),
    ...(entityRef ? { entityRef } : {}),
    mode,
    ...(enrichment ? { enrichment } : {}),
    ...(messageParts.length > 0 ? { initialUserMessage: messageParts.join(' ') } : {}),
  };
}

function upsertNpcTab(openTabs: readonly OpenTab[], tab: OpenTab): OpenTab[] {
  return [...openTabs.filter((candidate) => candidate.id !== tab.id), tab];
}

async function defaultChooseThinProfileAction(
  profile: NpcProfileSource,
): Promise<NpcThinProfileAction> {
  const picked = await vscode.window.showQuickPick(
    [
      {
        label: 'Start now',
        action: 'start-now' as const,
      },
      {
        label: 'Extract project evidence',
        action: 'enrich-project' as const,
      },
      {
        label: 'Add manual supplement',
        action: 'manual-supplement' as const,
      },
    ],
    {
      placeHolder: `NPC profile for ${profile.displayName} is thin.`,
    },
  );
  return picked?.action ?? 'start-now';
}

function appendUserSupplement(profile: NpcProfileSource, supplement: string): NpcProfileSource {
  const trimmed = supplement.trim();
  if (!trimmed) {
    return profile;
  }
  return {
    ...profile,
    facts: [
      ...profile.facts,
      {
        key: 'userSupplement.notes',
        value: trimmed,
        source: 'user-supplement',
        authority: 'suggested',
      },
    ],
    userSupplements: [profile.userSupplements, trimmed]
      .filter((value): value is string => Boolean(value?.trim()))
      .join('\n'),
  };
}

function createFallbackNpcEvaluationReport(
  artifact: NpcTranscriptArtifact,
  createdAt: string,
): NpcEvaluationReport {
  const hasNpcReply = artifact.transcript.some((message) => message.role === 'npc');
  const hasUserTurn = artifact.transcript.some((message) => message.role === 'user');
  return {
    version: NPC_TRANSCRIPT_ARTIFACT_VERSION,
    createdAt,
    entityRef: artifact.entityRef,
    summary: hasNpcReply
      ? 'NPC transcript captured for project-scoped validation.'
      : 'NPC transcript has no NPC response to evaluate yet.',
    scores: [
      {
        dimension: 'persona-consistency',
        score: hasNpcReply ? 0.5 : 0,
        summary: hasNpcReply ? 'Manual review required.' : 'No NPC response was captured.',
      },
      {
        dimension: 'dialogue-voice-fit',
        score: hasUserTurn && hasNpcReply ? 0.5 : 0,
        summary: 'Fallback evaluation did not infer voice changes.',
      },
      {
        dimension: 'knowledge-boundary',
        score: 1,
        summary: 'Fallback evaluation found no automated knowledge leakage evidence.',
      },
    ],
    findings: [],
    suggestions: [],
  };
}

async function defaultChooseTranscriptSavePolicy(
  input: NpcSavePolicyInput,
): Promise<NpcTranscriptSavePolicy> {
  if (input.reason === 'disposed') {
    return 'never';
  }
  const picked = await vscode.window.showInformationMessage(
    `Save NPC test evidence for ${input.artifact.profileSnapshot.displayName}?`,
    'Save',
    'Discard',
  );
  return picked === 'Save' ? 'always' : 'never';
}

async function defaultSaveTranscriptArtifact(
  input: NpcTranscriptArtifactSaveInput,
): Promise<NpcTranscriptArtifactSaveResult> {
  const relativePath = buildNpcTranscriptArtifactRelativePath(input.artifact);
  const target = vscode.Uri.file(path.join(input.projectRoot, relativePath));
  const targetFsPath = target.fsPath ?? path.join(input.projectRoot, relativePath);
  await vscode.workspace.fs.createDirectory(vscode.Uri.file(path.dirname(targetFsPath)));
  await vscode.workspace.fs.writeFile(
    target,
    Buffer.from(`${JSON.stringify(input.artifact, null, 2)}\n`, 'utf-8'),
  );
  return { path: relativePath };
}

function buildNpcTranscriptArtifactRelativePath(artifact: NpcTranscriptArtifact): string {
  const timestamp = artifact.createdAt.replace(/[:.]/g, '-');
  const entityId = artifact.entityRef.entityId.replace(/[^a-zA-Z0-9_.-]+/g, '-');
  return path.posix.join('.neko', 'npc-tests', `${entityId}-${timestamp}.json`);
}

async function defaultApplyNpcSuggestion(
  input: NpcSuggestionApplyInput,
): Promise<NpcSuggestionApplyResult> {
  const { suggestion, projectRoot } = input;
  if (suggestion.applyTarget.kind === 'entity-metadata') {
    const services = createVSCodeEntityServices({ projectRoot, logger });
    await services.service.updateMetadata(suggestion.applyTarget.entityRef.entityId, {
      [suggestion.applyTarget.metadataKey]: suggestion.proposedValue,
    });
    return { applied: true };
  }

  if (suggestion.applyTarget.kind === 'relationship') {
    await vscode.commands.executeCommand('neko.entity.applyRelationshipSuggestion', {
      from: suggestion.applyTarget.from,
      to: suggestion.applyTarget.to,
      relationshipType: suggestion.applyTarget.relationshipType,
      proposedValue: suggestion.proposedValue,
      suggestionId: suggestion.id,
    });
    return { applied: true };
  }

  return {
    applied: false,
    message: 'Profile fact suggestions require an entity-owned apply command.',
  };
}

function summarizeNpcProfile(profile: NpcProfileSource): string {
  const facts = new Map(profile.facts.map((fact) => [fact.key, String(fact.value)]));
  return [
    facts.get('metadata.role'),
    facts.get('metadata.age') ?? facts.get('metadata.ageRange'),
    facts.get('metadata.personality'),
  ]
    .filter((value): value is string => Boolean(value))
    .join(' · ');
}

function createNpcSessionId(entityRef: CreativeEntityRef): string {
  const suffix = Date.now().toString(36);
  return `npc-${entityRef.entityId}-${suffix}`;
}

function extractResponseText(response: ServiceResponse): string {
  const content = response.message.content;
  if (typeof content === 'string') {
    return content;
  }
  return content
    .filter(
      (part): part is Extract<(typeof content)[number], { type: 'text' }> => part.type === 'text',
    )
    .map((part) => part.text)
    .join('');
}

function extractJsonValuePayload(output: string): string | undefined {
  const trimmed = output.trim();
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed)?.[1]?.trim();
  if (fenced) return fenced;

  const firstObjectBrace = trimmed.indexOf('{');
  const firstArrayBracket = trimmed.indexOf('[');
  const startsWithArray =
    firstArrayBracket >= 0 && (firstObjectBrace < 0 || firstArrayBracket < firstObjectBrace);
  const start = startsWithArray ? firstArrayBracket : firstObjectBrace;
  const end = startsWithArray ? trimmed.lastIndexOf(']') : trimmed.lastIndexOf('}');
  if (start < 0 || end <= start) return undefined;
  return trimmed.slice(start, end + 1);
}

function readConfidence(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(0, Math.min(1, value))
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function tokenizeSlashArgs(input: string): string[] {
  return input.match(/"[^"]*"|'[^']*'|\S+/g)?.map(unquoteToken) ?? [];
}

function unquoteToken(token: string): string {
  if (
    (token.startsWith('"') && token.endsWith('"')) ||
    (token.startsWith("'") && token.endsWith("'"))
  ) {
    return token.slice(1, -1);
  }
  return token;
}

function normalizeMentionToken(token: string): string {
  return token.replace(/^@/, '').replace(/^entity:/, '');
}

function parseEnrichmentMode(value: string | undefined): NpcTestBenchLaunchRequest['enrichment'] {
  return value === 'ask' || value === 'skip' || value === 'auto' || value === 'manual'
    ? value
    : undefined;
}

function looksLikeCreativeEntityRef(value: string): boolean {
  return value.startsWith('{') && value.includes('entityId');
}

function parseCreativeEntityRefJson(value: string): CreativeEntityRef | undefined {
  try {
    const parsed = JSON.parse(value) as unknown;
    return isCreativeEntityRef(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}
