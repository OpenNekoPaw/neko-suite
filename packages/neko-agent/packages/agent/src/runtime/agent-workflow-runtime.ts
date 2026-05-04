import type {
  AgentWorkflowDefinition,
  AgentWorkflowIdentity,
  AgentLegacyWorkflowAdapterDeprecation,
  AgentLegacyWorkflowNodeMapping,
  AgentLegacyWorkflowTelemetry,
  AgentLegacyWorkflowValidationDiagnostic,
  AgentWorkflowNode,
  AgentWorkflowProjection,
  AgentWorkflowRun,
  AgentWorkflowStatus,
  AgentWorkflowTransition,
  IdcStage,
  StageTaskShape,
} from '@neko-agent/types';

export interface AgentWorkflowRuntimeOptions {
  readonly now?: () => number;
  readonly generateRunId?: (definition: AgentWorkflowDefinition, conversationId: string) => string;
  readonly onProjection?: (projection: AgentWorkflowProjection) => void;
}

export interface CreateAgentWorkflowRunInput {
  readonly definition: AgentWorkflowDefinition;
  readonly conversationId: string;
  readonly initialNodeId?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface AgentWorkflowRuntime {
  createRun(input: CreateAgentWorkflowRunInput): AgentWorkflowRun;
  getRun(runId: string): AgentWorkflowRun | undefined;
  activateNode(runId: string, nodeId: string, reason?: string): AgentWorkflowRun;
  transition(input: {
    readonly runId: string;
    readonly toNodeId: string;
    readonly fromNodeId?: string;
    readonly reason?: string;
  }): AgentWorkflowRun;
  cancel(runId: string, reason?: string): AgentWorkflowRun;
  complete(runId: string): AgentWorkflowRun;
  fail(runId: string, error: { readonly code: string; readonly message: string }): AgentWorkflowRun;
  toIdentity(runId: string, nodeId?: string): AgentWorkflowIdentity | undefined;
  listRuns(conversationId?: string): AgentWorkflowRun[];
}

export interface AgentLegacyWorkflowAdapterUsageInput {
  readonly deprecation?: AgentLegacyWorkflowAdapterDeprecation;
  readonly workflowDefinitionCandidate?: AgentWorkflowDefinition;
  readonly nodeMapping?: readonly AgentLegacyWorkflowNodeMapping[];
  readonly usedAt?: number;
}

export interface AgentLegacyWorkflowSunsetPolicy {
  readonly now?: number;
  readonly sunsetGateEnabled?: boolean;
  readonly compatibilityApprovalIds?: readonly string[];
  readonly isNewWorkflow?: boolean;
}

export interface AgentLegacyWorkflowUsageRecorder {
  record(input: AgentLegacyWorkflowAdapterUsageInput): AgentLegacyWorkflowTelemetry;
  get(adapterId: string): AgentLegacyWorkflowTelemetry | undefined;
  list(): readonly AgentLegacyWorkflowTelemetry[];
  validate(
    input: AgentLegacyWorkflowAdapterUsageInput,
    policy?: AgentLegacyWorkflowSunsetPolicy,
  ): readonly AgentLegacyWorkflowValidationDiagnostic[];
}

export const IDC_WORKFLOW_DEFINITION_ID = 'neko.workflow.idc.v1';

export function createAgentWorkflowRuntime(
  options: AgentWorkflowRuntimeOptions = {},
): AgentWorkflowRuntime {
  return new DefaultAgentWorkflowRuntime(options);
}

export function createIdcWorkflowDefinition(): AgentWorkflowDefinition {
  return {
    id: IDC_WORKFLOW_DEFINITION_ID,
    version: '1.0.0',
    title: 'IDC Creation',
    description: 'Draft, Plan, and Apply creative workflow profile.',
    nodes: [
      createIdcWorkflowNode('draft', 'Draft'),
      createIdcWorkflowNode('plan', 'Plan'),
      createIdcWorkflowNode('apply', 'Apply'),
    ],
    transitions: [
      { toNodeId: 'draft', reason: 'start', createdAt: 0 },
      { fromNodeId: 'draft', toNodeId: 'plan', reason: 'draft-complete', createdAt: 0 },
      { fromNodeId: 'plan', toNodeId: 'apply', reason: 'plan-complete', createdAt: 0 },
    ],
  };
}

export function selectIdcWorkflowEntryNode(input: {
  readonly planMode: boolean;
  readonly autoMode?: boolean;
  readonly taskShape?: StageTaskShape;
  readonly hasExistingDraft?: boolean;
  readonly hasExistingPlan?: boolean;
  readonly requestedStage?: IdcStage;
}): IdcStage {
  if (input.requestedStage) {
    return input.requestedStage;
  }
  if (input.planMode) {
    return 'draft';
  }
  // Keep this mapping aligned with StageTaskShape in
  // docs/architecture/agent-unified-workflow.md §3.2 and
  // packages/neko-agent/packages/agent-types/src/stage.ts.
  if (
    input.hasExistingPlan ||
    input.taskShape === 'single-write' ||
    input.taskShape === 'single-read'
  ) {
    return 'apply';
  }
  if (
    input.hasExistingDraft ||
    input.taskShape === 'multi-step' ||
    input.taskShape === 'plan-only'
  ) {
    return 'plan';
  }
  return input.autoMode ? 'draft' : 'apply';
}

export function buildWorkflowIdentity(input: {
  readonly definitionId: string;
  readonly runId: string;
  readonly nodeId?: string;
}): AgentWorkflowIdentity {
  return {
    workflowDefinitionId: input.definitionId,
    workflowRunId: input.runId,
    ...(input.nodeId ? { workflowNodeId: input.nodeId } : {}),
  };
}

export function createLegacyWorkflowUsageRecorder(): AgentLegacyWorkflowUsageRecorder {
  return new DefaultLegacyWorkflowUsageRecorder();
}

class DefaultAgentWorkflowRuntime implements AgentWorkflowRuntime {
  private readonly runs = new Map<string, AgentWorkflowRun>();
  private readonly definitionsByRunId = new Map<string, AgentWorkflowDefinition>();

  constructor(private readonly options: AgentWorkflowRuntimeOptions) {}

  createRun(input: CreateAgentWorkflowRunInput): AgentWorkflowRun {
    const now = this.now();
    const initialNodeId = input.initialNodeId ?? input.definition.nodes[0]?.id;
    assertNodeInDefinition(input.definition, initialNodeId);
    const runId =
      this.options.generateRunId?.(input.definition, input.conversationId) ??
      `${input.definition.id}:${input.conversationId}:${now}`;
    const run: AgentWorkflowRun = {
      id: runId,
      definitionId: input.definition.id,
      conversationId: input.conversationId,
      status: initialNodeId ? 'running' : 'pending',
      ...(initialNodeId ? { activeNodeId: initialNodeId } : {}),
      nodes: input.definition.nodes.map((node) =>
        node.id === initialNodeId
          ? withNodeStatus(node, 'running')
          : withNodeStatus(node, 'pending'),
      ),
      transitions: [],
      createdAt: now,
      updatedAt: now,
      ...(input.metadata ? { metadata: input.metadata } : {}),
    };
    this.definitionsByRunId.set(run.id, input.definition);
    this.runs.set(run.id, run);
    this.emit(run);
    return run;
  }

  getRun(runId: string): AgentWorkflowRun | undefined {
    return this.runs.get(runId);
  }

  activateNode(runId: string, nodeId: string, reason = 'activate-node'): AgentWorkflowRun {
    const current = this.requireRun(runId);
    return this.transition({
      runId,
      fromNodeId: current.activeNodeId,
      toNodeId: nodeId,
      reason,
    });
  }

  transition(input: {
    readonly runId: string;
    readonly toNodeId: string;
    readonly fromNodeId?: string;
    readonly reason?: string;
  }): AgentWorkflowRun {
    const current = this.requireRun(input.runId);
    assertNodeExists(current, input.toNodeId);
    const fromNodeId = input.fromNodeId ?? current.activeNodeId;
    if (fromNodeId && current.activeNodeId && fromNodeId !== current.activeNodeId) {
      throw new Error(`Workflow transition source is not active: ${fromNodeId}`);
    }
    if (fromNodeId === input.toNodeId) {
      throw new Error(`Workflow transition target is already active: ${input.toNodeId}`);
    }
    this.assertValidTransition(current.id, fromNodeId, input.toNodeId);
    const transition: AgentWorkflowTransition = {
      ...(fromNodeId ? { fromNodeId } : {}),
      toNodeId: input.toNodeId,
      reason: input.reason ?? 'transition',
      createdAt: this.now(),
    };
    const next = this.updateRun({
      ...current,
      status: 'running',
      activeNodeId: input.toNodeId,
      nodes: current.nodes.map((node) => {
        if (node.id === input.toNodeId) return withNodeStatus(node, 'running');
        if (node.id === fromNodeId && node.status === 'running') {
          return withNodeStatus(node, 'completed');
        }
        return node;
      }),
      transitions: [...current.transitions, transition],
      updatedAt: transition.createdAt,
    });
    return next;
  }

  cancel(runId: string, reason = 'cancelled'): AgentWorkflowRun {
    const current = this.requireRun(runId);
    const now = this.now();
    return this.updateRun({
      ...current,
      status: 'cancelled',
      nodes: current.nodes.map((node) =>
        node.status === 'running' ? withNodeStatus(node, 'cancelled') : node,
      ),
      transitions: current.activeNodeId
        ? [
            ...current.transitions,
            {
              fromNodeId: current.activeNodeId,
              toNodeId: current.activeNodeId,
              reason,
              createdAt: now,
            },
          ]
        : current.transitions,
      cancelledAt: now,
      updatedAt: now,
    });
  }

  complete(runId: string): AgentWorkflowRun {
    const current = this.requireRun(runId);
    const now = this.now();
    return this.updateRun({
      ...current,
      status: 'completed',
      nodes: current.nodes.map((node) =>
        node.status === 'running' ? withNodeStatus(node, 'completed') : node,
      ),
      completedAt: now,
      updatedAt: now,
    });
  }

  fail(
    runId: string,
    error: { readonly code: string; readonly message: string },
  ): AgentWorkflowRun {
    const current = this.requireRun(runId);
    const now = this.now();
    return this.updateRun({
      ...current,
      status: 'failed',
      nodes: current.nodes.map((node) =>
        node.status === 'running' ? withNodeStatus(node, 'failed') : node,
      ),
      error,
      updatedAt: now,
    });
  }

  toIdentity(runId: string, nodeId?: string): AgentWorkflowIdentity | undefined {
    const run = this.runs.get(runId);
    if (!run) return undefined;
    return buildWorkflowIdentity({
      definitionId: run.definitionId,
      runId: run.id,
      nodeId: nodeId ?? run.activeNodeId,
    });
  }

  listRuns(conversationId?: string): AgentWorkflowRun[] {
    return Array.from(this.runs.values()).filter(
      (run) => !conversationId || run.conversationId === conversationId,
    );
  }

  private updateRun(run: AgentWorkflowRun): AgentWorkflowRun {
    this.runs.set(run.id, run);
    this.emit(run);
    return run;
  }

  private requireRun(runId: string): AgentWorkflowRun {
    const run = this.runs.get(runId);
    if (!run) {
      throw new Error(`Workflow run not found: ${runId}`);
    }
    return run;
  }

  private emit(run: AgentWorkflowRun): void {
    this.options.onProjection?.({ conversationId: run.conversationId, run });
  }

  private assertValidTransition(
    runId: string,
    fromNodeId: string | undefined,
    toNodeId: string,
  ): void {
    const definition = this.definitionsByRunId.get(runId);
    if (!definition) return;
    assertValidWorkflowTransition(definition, fromNodeId, toNodeId);
  }

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }
}

function createIdcWorkflowNode(stage: IdcStage, title: string): AgentWorkflowNode {
  return {
    id: stage,
    kind: 'idc-stage',
    title,
    status: 'pending',
    stage,
    profile: stage === 'draft' ? 'idc-draft' : stage === 'plan' ? 'idc-plan' : 'idc-apply',
  };
}

function withNodeStatus(node: AgentWorkflowNode, status: AgentWorkflowStatus): AgentWorkflowNode {
  return { ...node, status };
}

function assertNodeInDefinition(
  definition: AgentWorkflowDefinition,
  nodeId: string | undefined,
): void {
  if (!nodeId) return;
  if (!definition.nodes.some((node) => node.id === nodeId)) {
    throw new Error(`Workflow node not found: ${nodeId}`);
  }
}

function assertNodeExists(run: AgentWorkflowRun, nodeId: string): void {
  if (!run.nodes.some((node) => node.id === nodeId)) {
    throw new Error(`Workflow node not found: ${nodeId}`);
  }
}

function assertValidWorkflowTransition(
  definition: AgentWorkflowDefinition,
  fromNodeId: string | undefined,
  toNodeId: string,
): void {
  const transitions = definition.transitions ?? [];
  if (transitions.length === 0) return;
  const isAllowed = transitions.some(
    (transition) => transition.fromNodeId === fromNodeId && transition.toNodeId === toNodeId,
  );
  if (!isAllowed) {
    const fromLabel = fromNodeId ?? '<start>';
    throw new Error(`Workflow transition is not allowed: ${fromLabel} -> ${toNodeId}`);
  }
}

class DefaultLegacyWorkflowUsageRecorder implements AgentLegacyWorkflowUsageRecorder {
  private readonly telemetryByAdapterId = new Map<string, AgentLegacyWorkflowTelemetry>();

  record(input: AgentLegacyWorkflowAdapterUsageInput): AgentLegacyWorkflowTelemetry {
    const diagnostics = this.validate(input, { sunsetGateEnabled: false });
    const blocking = diagnostics.find((diagnostic) => diagnostic.severity === 'failure');
    if (blocking) {
      throw new Error(blocking.message);
    }

    const deprecation = input.deprecation;
    if (!deprecation) {
      throw new Error('Legacy workflow adapter metadata is required.');
    }

    const previous = this.telemetryByAdapterId.get(deprecation.adapterId);
    const nodeMapping = input.nodeMapping ?? [];
    const unmappedStepIds = nodeMapping
      .filter((mapping) => !mapping.workflowNodeId)
      .map((mapping) => mapping.legacyStepId);
    const missingMigrationReasons = Array.from(
      new Set(
        nodeMapping
          .map((mapping) => mapping.missingMigrationReason)
          .filter((reason): reason is string => Boolean(reason)),
      ),
    );
    const telemetry: AgentLegacyWorkflowTelemetry = {
      adapterId: deprecation.adapterId,
      deprecation,
      ...(input.workflowDefinitionCandidate
        ? { workflowDefinitionCandidate: input.workflowDefinitionCandidate }
        : {}),
      nodeMapping,
      unmappedStepIds,
      missingMigrationReasons,
      usageCount: (previous?.usageCount ?? 0) + 1,
      lastUsedAt: input.usedAt ?? Date.now(),
    };
    this.telemetryByAdapterId.set(deprecation.adapterId, telemetry);
    return telemetry;
  }

  get(adapterId: string): AgentLegacyWorkflowTelemetry | undefined {
    return this.telemetryByAdapterId.get(adapterId);
  }

  list(): readonly AgentLegacyWorkflowTelemetry[] {
    return Array.from(this.telemetryByAdapterId.values());
  }

  validate(
    input: AgentLegacyWorkflowAdapterUsageInput,
    policy: AgentLegacyWorkflowSunsetPolicy = {},
  ): readonly AgentLegacyWorkflowValidationDiagnostic[] {
    const deprecation = input.deprecation;
    if (!deprecation) {
      return [
        {
          code: 'missing-deprecation-metadata',
          severity: 'failure',
          message: 'Legacy workflow adapter must include deprecation metadata.',
        },
      ];
    }

    const diagnostics: AgentLegacyWorkflowValidationDiagnostic[] =
      validateLegacyWorkflowDeprecationDates(deprecation);
    const expired = isLegacyWorkflowAdapterExpired(deprecation, policy.now ?? Date.now());
    const approved = policy.compatibilityApprovalIds?.includes(deprecation.adapterId) ?? false;
    if (expired && !approved) {
      diagnostics.push({
        code: 'legacy-adapter-expired',
        severity: deprecation.severityAfterSunset,
        adapterId: deprecation.adapterId,
        message: `Legacy workflow adapter ${deprecation.adapterId} expired; use ${deprecation.workflowNativeReplacement}.`,
      });
    }

    if (policy.sunsetGateEnabled && policy.isNewWorkflow && !input.workflowDefinitionCandidate) {
      diagnostics.push({
        code: 'new-pipeline-only-workflow',
        severity: 'failure',
        adapterId: deprecation.adapterId,
        message:
          'New multi-step agent workflows must provide an AgentWorkflowDefinition or workflow node profile.',
      });
    }

    return diagnostics;
  }
}

function isLegacyWorkflowAdapterExpired(
  deprecation: AgentLegacyWorkflowAdapterDeprecation,
  now: number,
): boolean {
  const expiresAt = Date.parse(`${deprecation.allowedCompatibilityWindow.expiresAt}T00:00:00.000Z`);
  if (Number.isNaN(expiresAt)) {
    return true;
  }
  const today = new Date(now);
  const validationDay = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return expiresAt < validationDay;
}

function validateLegacyWorkflowDeprecationDates(
  deprecation: AgentLegacyWorkflowAdapterDeprecation,
): AgentLegacyWorkflowValidationDiagnostic[] {
  const diagnostics: AgentLegacyWorkflowValidationDiagnostic[] = [];
  for (const [field, value] of [
    ['allowedCompatibilityWindow.startsAt', deprecation.allowedCompatibilityWindow.startsAt],
    ['allowedCompatibilityWindow.expiresAt', deprecation.allowedCompatibilityWindow.expiresAt],
  ] as const) {
    if (Number.isNaN(Date.parse(`${value}T00:00:00.000Z`))) {
      diagnostics.push({
        code: 'invalid-deprecation-date',
        severity: 'failure',
        adapterId: deprecation.adapterId,
        message: `Legacy workflow adapter ${deprecation.adapterId} has invalid ${field}.`,
      });
    }
  }
  return diagnostics;
}
