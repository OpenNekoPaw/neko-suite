import {
  createCreativeAiDiagnostic,
  validateAgentInternalInvocation,
  validateExternalCreativeAiInvocation,
  type AgentInternalInvocation,
  type CreativeAiConversationState,
  type CreativeAiDiagnostic,
  type CreativeAiDocumentRef,
  type CreativeAiRoutingDecision,
  type CreativeAiRoutingReason,
  type CreativeAiSourceRef,
  type ExternalCreativeAiInvocation,
} from '@neko/shared/types/creative-ai-invocation';

const ASSOCIATION_STORAGE_KEY = 'nekoAgent.creativeAiConversationAssociations';
const ASSOCIATION_INDEX_VERSION = 1 as const;

export interface CreativeAiConversationAssociationRecord {
  readonly conversationId: string;
  readonly sourcePackage: string;
  readonly associationKey: string;
  readonly state: CreativeAiConversationState;
  readonly documentRef?: CreativeAiDocumentRef;
  readonly sourceRef?: CreativeAiSourceRef;
  readonly documentLabel?: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  readonly lastActivityAt: number;
}

export interface CreativeAiConversationAssociationIndex {
  readonly version: typeof ASSOCIATION_INDEX_VERSION;
  readonly records: readonly CreativeAiConversationAssociationRecord[];
}

export interface CreativeAiConversationAssociationStorage {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): void | Promise<void>;
}

export interface CreativeAiBackgroundConversationCreateInput {
  readonly sourcePackage: string;
  readonly associationKey: string;
  readonly title: string;
  readonly documentLabel?: string;
}

export interface CreativeAiConversationRoutingPort {
  getSelectedAgentConversationId(): string | null;
  hasConversation(conversationId: string): boolean;
  createBackgroundConversation(input: CreativeAiBackgroundConversationCreateInput): string;
}

export interface CreativeAiConversationRoutingServiceOptions {
  readonly conversations: CreativeAiConversationRoutingPort;
  readonly storage?: CreativeAiConversationAssociationStorage;
  readonly now?: () => number;
}

export type CreativeAiConversationRoutingResult =
  | {
      readonly ok: true;
      readonly decision: CreativeAiRoutingDecision;
      readonly association?: CreativeAiConversationAssociationRecord;
    }
  | {
      readonly ok: false;
      readonly diagnostics: readonly CreativeAiDiagnostic[];
    };

export class CreativeAiConversationRoutingService {
  private associations: CreativeAiConversationAssociationRecord[] | undefined;

  constructor(private readonly options: CreativeAiConversationRoutingServiceOptions) {}

  async routeAgentInternalInvocation(
    invocation: unknown,
  ): Promise<CreativeAiConversationRoutingResult> {
    const validation = validateAgentInternalInvocation(invocation);
    if (!validation.valid || !validation.value) {
      return { ok: false, diagnostics: validation.diagnostics };
    }
    const request: AgentInternalInvocation = validation.value;

    const selectedConversationId = this.options.conversations.getSelectedAgentConversationId();
    if (!selectedConversationId) {
      return {
        ok: false,
        diagnostics: [
          diagnostic(
            'creative-ai-routing-missing-selected-conversation',
            'Agent-internal creative AI invocation requires a selected Agent conversation.',
            'conversationId',
          ),
          prohibitedCrossDomainFallbackDiagnostic('agent-internal'),
        ],
      };
    }

    if (request.conversationId !== selectedConversationId) {
      return {
        ok: false,
        diagnostics: [
          diagnostic(
            'creative-ai-routing-selected-conversation-mismatch',
            'Agent-internal creative AI invocation conversationId must match the selected Agent conversation.',
            'conversationId',
          ),
          prohibitedCrossDomainFallbackDiagnostic('agent-internal'),
        ],
      };
    }

    if (!this.options.conversations.hasConversation(selectedConversationId)) {
      return {
        ok: false,
        diagnostics: [
          diagnostic(
            'creative-ai-routing-conversation-unavailable',
            'Selected Agent conversation is unavailable.',
            'conversationId',
          ),
        ],
      };
    }

    return {
      ok: true,
      decision: {
        conversationId: selectedConversationId,
        domain: 'agent-internal',
        routingReason: 'selected-agent-conversation',
        diagnostics: [],
      },
    };
  }

  async routeExternalInvocation(invocation: unknown): Promise<CreativeAiConversationRoutingResult> {
    const validation = validateExternalCreativeAiInvocation(invocation);
    if (!validation.valid || !validation.value) {
      return {
        ok: false,
        diagnostics: [
          ...validation.diagnostics,
          ...diagnosticsForInvalidExternalRouting(validation.diagnostics),
        ],
      };
    }
    const request: ExternalCreativeAiInvocation = validation.value;

    const associationKey = resolveAssociationKey(request);
    if (!associationKey) {
      return {
        ok: false,
        diagnostics: [
          diagnostic(
            'creative-ai-routing-missing-association',
            'External creative AI invocation requires a document/source association key.',
            'routing.associationKey',
          ),
          prohibitedCrossDomainFallbackDiagnostic('external-creative-package'),
        ],
      };
    }

    const explicitConversationId =
      request.routing?.userSelectedConversationId ?? request.routing?.requestedConversationId;
    if (explicitConversationId) {
      return this.routeExternalToExplicitConversation(
        request,
        associationKey,
        explicitConversationId,
      );
    }

    const associations = await this.loadAssociations();
    const diagnostics: CreativeAiDiagnostic[] = [];
    const matching = associations
      .filter(
        (record) =>
          record.sourcePackage === request.sourcePackage &&
          record.associationKey === associationKey,
      )
      .sort((a, b) => b.lastActivityAt - a.lastActivityAt);

    for (const record of matching) {
      if (record.state !== 'active') {
        diagnostics.push(skippedConversationDiagnostic(record));
        continue;
      }
      if (!this.options.conversations.hasConversation(record.conversationId)) {
        diagnostics.push(unavailableConversationDiagnostic(record.conversationId));
        await this.upsertAssociation({ ...record, state: 'unavailable' });
        continue;
      }

      const updated = await this.touchAssociation(record, request);
      return {
        ok: true,
        decision: decision(
          record.conversationId,
          'external-creative-package',
          'recent-associated-conversation',
          associationKey,
          request.sourcePackage,
          diagnostics,
        ),
        association: updated,
      };
    }

    const conversationId = this.options.conversations.createBackgroundConversation({
      sourcePackage: request.sourcePackage,
      associationKey,
      title: buildBackgroundConversationTitle(request),
      documentLabel: resolveDocumentLabel(request),
    });
    const association = await this.upsertAssociation(
      createAssociationRecord({
        conversationId,
        invocation: request,
        associationKey,
        now: this.now(),
      }),
    );

    return {
      ok: true,
      decision: decision(
        conversationId,
        'external-creative-package',
        'created-new-background-conversation',
        associationKey,
        request.sourcePackage,
        diagnostics,
      ),
      association,
    };
  }

  async getAssociations(): Promise<readonly CreativeAiConversationAssociationRecord[]> {
    return [...(await this.loadAssociations())];
  }

  async markConversationState(
    conversationId: string,
    state: CreativeAiConversationState,
  ): Promise<void> {
    const associations = await this.loadAssociations();
    const now = this.now();
    let changed = false;
    const next = associations.map((record) => {
      if (record.conversationId !== conversationId) return record;
      changed = true;
      return {
        ...record,
        state,
        updatedAt: now,
      };
    });
    if (!changed) return;
    this.associations = next;
    await this.persistAssociations();
  }

  private async routeExternalToExplicitConversation(
    invocation: ExternalCreativeAiInvocation,
    associationKey: string,
    conversationId: string,
  ): Promise<CreativeAiConversationRoutingResult> {
    const associations = await this.loadAssociations();
    const existing = associations.find((record) => record.conversationId === conversationId);
    if (existing && existing.state !== 'active') {
      return {
        ok: false,
        diagnostics: [skippedConversationDiagnostic(existing)],
      };
    }
    if (!this.options.conversations.hasConversation(conversationId)) {
      return {
        ok: false,
        diagnostics: [unavailableConversationDiagnostic(conversationId)],
      };
    }

    const association = await this.upsertAssociation(
      createAssociationRecord({
        conversationId,
        invocation,
        associationKey,
        now: this.now(),
      }),
    );

    return {
      ok: true,
      decision: decision(
        conversationId,
        'external-creative-package',
        'user-selected-conversation',
        associationKey,
        invocation.sourcePackage,
        [],
      ),
      association,
    };
  }

  private async touchAssociation(
    record: CreativeAiConversationAssociationRecord,
    invocation: ExternalCreativeAiInvocation,
  ): Promise<CreativeAiConversationAssociationRecord> {
    const now = this.now();
    return this.upsertAssociation({
      ...record,
      documentRef: invocation.documentRef ?? invocation.sourceRef.documentRef ?? record.documentRef,
      sourceRef: invocation.sourceRef,
      documentLabel: resolveDocumentLabel(invocation) ?? record.documentLabel,
      updatedAt: now,
      lastActivityAt: now,
    });
  }

  private async upsertAssociation(
    record: CreativeAiConversationAssociationRecord,
  ): Promise<CreativeAiConversationAssociationRecord> {
    const associations = await this.loadAssociations();
    const existingIndex = associations.findIndex(
      (item) =>
        item.conversationId === record.conversationId &&
        item.sourcePackage === record.sourcePackage &&
        item.associationKey === record.associationKey,
    );
    const next =
      existingIndex === -1
        ? [...associations, record]
        : associations.map((item, index) => (index === existingIndex ? record : item));
    this.associations = next;
    await this.persistAssociations();
    return record;
  }

  private async loadAssociations(): Promise<readonly CreativeAiConversationAssociationRecord[]> {
    if (this.associations) {
      return this.associations;
    }
    const index =
      this.options.storage?.get<CreativeAiConversationAssociationIndex>(ASSOCIATION_STORAGE_KEY);
    this.associations = isAssociationIndex(index) ? [...index.records] : [];
    return this.associations;
  }

  private async persistAssociations(): Promise<void> {
    if (!this.options.storage) return;
    await this.options.storage.update(ASSOCIATION_STORAGE_KEY, {
      version: ASSOCIATION_INDEX_VERSION,
      records: this.associations ?? [],
    } satisfies CreativeAiConversationAssociationIndex);
  }

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }
}

export function createMemoryCreativeAiAssociationStorage(
  initial?: CreativeAiConversationAssociationIndex,
): CreativeAiConversationAssociationStorage & {
  readonly store: Map<string, unknown>;
} {
  const store = new Map<string, unknown>();
  if (initial) {
    store.set(ASSOCIATION_STORAGE_KEY, initial);
  }
  return {
    store,
    get: <T>(key: string) => store.get(key) as T | undefined,
    update: (key: string, value: unknown) => {
      store.set(key, value);
    },
  };
}

export function resolveCreativeAiAssociationKey(
  invocation: ExternalCreativeAiInvocation,
): string | null {
  return resolveAssociationKey(invocation);
}

function createAssociationRecord(input: {
  readonly conversationId: string;
  readonly invocation: ExternalCreativeAiInvocation;
  readonly associationKey: string;
  readonly now: number;
}): CreativeAiConversationAssociationRecord {
  return {
    conversationId: input.conversationId,
    sourcePackage: input.invocation.sourcePackage,
    associationKey: input.associationKey,
    state: 'active',
    documentRef: input.invocation.documentRef ?? input.invocation.sourceRef.documentRef,
    sourceRef: input.invocation.sourceRef,
    documentLabel: resolveDocumentLabel(input.invocation),
    createdAt: input.now,
    updatedAt: input.now,
    lastActivityAt: input.now,
  };
}

function resolveAssociationKey(invocation: ExternalCreativeAiInvocation): string | null {
  if (invocation.routing?.associationKey) {
    return invocation.routing.associationKey;
  }

  const documentRef = invocation.documentRef ?? invocation.sourceRef.documentRef;
  if (!documentRef) return null;
  if (documentRef.documentId) {
    return `${invocation.sourcePackage}:document:${documentRef.packageId}:${documentRef.documentId}`;
  }
  if (documentRef.projectRelativePath) {
    return `${invocation.sourcePackage}:document:${documentRef.packageId}:${documentRef.projectRelativePath}`;
  }
  if (documentRef.variablePath) {
    return `${invocation.sourcePackage}:document:${documentRef.packageId}:${documentRef.variablePath}`;
  }
  return null;
}

function buildBackgroundConversationTitle(invocation: ExternalCreativeAiInvocation): string {
  const label =
    resolveDocumentLabel(invocation) ?? invocation.sourceRef.label ?? invocation.sourceRef.id;
  return `${invocation.sourcePackage} AI: ${label}`;
}

function resolveDocumentLabel(invocation: ExternalCreativeAiInvocation): string | undefined {
  const documentRef = invocation.documentRef ?? invocation.sourceRef.documentRef;
  return documentRef?.label ?? documentRef?.projectRelativePath ?? documentRef?.documentId;
}

function decision(
  conversationId: string,
  domain: CreativeAiRoutingDecision['domain'],
  routingReason: CreativeAiRoutingReason,
  associationKey: string | undefined,
  sourcePackage: string | undefined,
  diagnostics: readonly CreativeAiDiagnostic[],
): CreativeAiRoutingDecision {
  return {
    conversationId,
    domain,
    routingReason,
    ...(associationKey ? { associationKey } : {}),
    ...(sourcePackage ? { sourcePackage } : {}),
    conversationState: 'active',
    diagnostics,
  };
}

function diagnosticsForInvalidExternalRouting(
  validationDiagnostics: readonly CreativeAiDiagnostic[],
): readonly CreativeAiDiagnostic[] {
  const codes = new Set(validationDiagnostics.map((item) => item.code));
  if (
    !codes.has('creative-ai-missing-source-ref') &&
    !codes.has('creative-ai-missing-target-ref') &&
    !codes.has('creative-ai-missing-association-identity')
  ) {
    return [];
  }
  return [prohibitedCrossDomainFallbackDiagnostic('external-creative-package')];
}

function skippedConversationDiagnostic(
  record: CreativeAiConversationAssociationRecord,
): CreativeAiDiagnostic {
  const code =
    record.state === 'archived'
      ? 'creative-ai-routing-conversation-archived'
      : record.state === 'deleted'
        ? 'creative-ai-routing-conversation-deleted'
        : 'creative-ai-routing-conversation-unavailable';
  return {
    ...diagnostic(
      'creative-ai-routing-skipped-associated-conversation',
      `Associated conversation ${record.conversationId} is ${record.state} and cannot be used for default routing.`,
      'conversationId',
      'warning',
    ),
    code,
    metadata: {
      conversationId: record.conversationId,
      state: record.state,
      associationKey: record.associationKey,
    },
  };
}

function unavailableConversationDiagnostic(conversationId: string): CreativeAiDiagnostic {
  return {
    ...diagnostic(
      'creative-ai-routing-conversation-unavailable',
      `Conversation ${conversationId} is not available.`,
      'conversationId',
    ),
    metadata: { conversationId },
  };
}

function prohibitedCrossDomainFallbackDiagnostic(
  domain: CreativeAiRoutingDecision['domain'],
): CreativeAiDiagnostic {
  return diagnostic(
    'creative-ai-routing-prohibited-cross-domain-fallback',
    domain === 'agent-internal'
      ? 'Agent-internal invocation must not fall back to recent creative-package background conversations.'
      : 'External creative-package invocation must not fall back to the selected Agent panel conversation.',
    'conversationId',
  );
}

function diagnostic(
  code: string,
  message: string,
  target?: string,
  severity: CreativeAiDiagnostic['severity'] = 'error',
): CreativeAiDiagnostic {
  return createCreativeAiDiagnostic(severity, code, message, target);
}

function isAssociationIndex(value: unknown): value is CreativeAiConversationAssociationIndex {
  if (!isRecord(value) || value['version'] !== ASSOCIATION_INDEX_VERSION) return false;
  return Array.isArray(value['records']) && value['records'].every(isAssociationRecord);
}

function isAssociationRecord(value: unknown): value is CreativeAiConversationAssociationRecord {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value['conversationId']) &&
    isNonEmptyString(value['sourcePackage']) &&
    isNonEmptyString(value['associationKey']) &&
    isConversationState(value['state']) &&
    typeof value['createdAt'] === 'number' &&
    typeof value['updatedAt'] === 'number' &&
    typeof value['lastActivityAt'] === 'number'
  );
}

function isConversationState(value: unknown): value is CreativeAiConversationState {
  return (
    value === 'active' || value === 'archived' || value === 'deleted' || value === 'unavailable'
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
