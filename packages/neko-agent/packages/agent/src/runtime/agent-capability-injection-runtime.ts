import type {
  AgentCapabilityContribution,
  AgentCapabilityDiagnostic,
  AgentCapabilityInjectionContext,
  AgentCapabilityPermissionRequirement,
  AgentCapabilityRegistryProjection,
  AgentCapabilitySlashCommandContribution,
  AgentCapabilitySource,
  AgentCapabilityTelemetryEvent,
  AgentCapabilityTelemetryEventKind,
  AgentCapabilityTelemetryReason,
  AgentCapabilityTelemetrySnapshot,
  AgentCapabilityWorkflowNodeRequirement,
  AgentCapabilityWorkflowFragmentContribution,
  AgentInjectedCapabilitySet,
} from '@neko-agent/types';
import type {
  AgentCapabilityHostRequirement,
  AgentCapabilityManifest,
  AgentCapabilityTrustLevel,
  PromptFragment,
  Skill,
  SkillSource,
} from '@neko/shared';

export interface NormalizeSkillCapabilityInput {
  readonly skill: Skill;
  readonly source: AgentCapabilitySource;
  readonly sourceId?: string;
  readonly trustLevel?: AgentCapabilityTrustLevel;
  readonly version?: string;
  readonly hostRequirements?: readonly AgentCapabilityHostRequirement[];
  readonly permissionRequirements?: readonly AgentCapabilityPermissionRequirement[];
  readonly workflowNodeRequirements?: readonly AgentCapabilityWorkflowNodeRequirement[];
}

export interface NormalizeSkillScanGroupInput {
  readonly skills?: readonly Skill[];
  readonly source: AgentCapabilitySource;
  readonly trustLevel?: AgentCapabilityTrustLevel;
}

export interface NormalizeSkillScanInput {
  readonly builtin?: readonly Skill[];
  readonly market?: readonly Skill[];
  readonly local?: readonly Skill[];
  readonly plugin?: readonly Skill[];
  readonly mcp?: readonly Skill[];
}

export interface AgentCapabilityInjectionRuntime {
  register(contribution: AgentCapabilityContribution): AgentCapabilityRegistryProjection;
  registerMany(
    contributions: readonly AgentCapabilityContribution[],
  ): AgentCapabilityRegistryProjection;
  listRegistered(): readonly AgentCapabilityContribution[];
  getDiagnostics(phase?: 'registration' | 'injection'): readonly AgentCapabilityDiagnostic[];
  inject(context: AgentCapabilityInjectionContext): AgentInjectedCapabilitySet;
  projectSlashCommandCatalog(
    context: AgentCapabilityInjectionContext,
  ): readonly AgentCapabilitySlashCommandContribution[];
  getTelemetrySnapshot(): AgentCapabilityTelemetrySnapshot;
  recordTelemetryEvent(
    event: Omit<AgentCapabilityTelemetryEvent, 'id' | 'createdAt'> & {
      readonly id?: string;
      readonly createdAt?: number;
    },
  ): AgentCapabilityTelemetryEvent;
}

export interface AgentCapabilityInjectionRuntimeRetentionOptions {
  readonly maxRegistrationDiagnostics?: number;
  readonly maxInjectionDiagnostics?: number;
  readonly maxTelemetryEvents?: number;
}

export interface AgentCapabilityInjectionRuntimeOptions {
  readonly retention?: AgentCapabilityInjectionRuntimeRetentionOptions;
}

const DEFAULT_MAX_REGISTRATION_DIAGNOSTICS = 500;
const DEFAULT_MAX_INJECTION_DIAGNOSTICS = 500;
const DEFAULT_MAX_TELEMETRY_EVENTS = 1_000;

export function createAgentCapabilityInjectionRuntime(
  options: AgentCapabilityInjectionRuntimeOptions = {},
): AgentCapabilityInjectionRuntime {
  return new DefaultAgentCapabilityInjectionRuntime(options);
}

export function normalizeSkillCapability(
  input: NormalizeSkillCapabilityInput,
): AgentCapabilityContribution {
  const skill = input.skill;
  const sourceId = input.sourceId ?? skill.name;
  const promptFragment: PromptFragment = {
    id: `skill:${skill.name}:prompt`,
    content: skill.content,
    priority: 75,
  };
  return {
    identity: {
      id: `skill:${skill.name}`,
      source: input.source,
      sourceId,
      trustLevel: input.trustLevel ?? defaultTrustForSource(input.source),
      ...(input.version ? { version: input.version } : {}),
    },
    displayName: skill.name,
    description: skill.description,
    ...(input.hostRequirements ? { hostRequirements: input.hostRequirements } : {}),
    ...(input.permissionRequirements
      ? { permissionRequirements: input.permissionRequirements }
      : {}),
    ...(input.workflowNodeRequirements
      ? { workflowNodeRequirements: input.workflowNodeRequirements }
      : {}),
    promptFragments: skill.content ? [promptFragment] : [],
    allowedTools: skill.allowedTools ?? [],
    slashCommands: [
      {
        id: `skill:${skill.name}:command`,
        name: skill.name,
        description: skill.description,
        skillId: `skill:${skill.name}`,
      },
    ],
    metadata: {
      skillSource: skill.source,
      ...(skill.version ? { version: skill.version } : {}),
      ...(skill.model ? { model: skill.model } : {}),
      ...(skill.domain ? { domain: skill.domain } : {}),
      ...(skill.command ? { command: skill.command } : {}),
      ...(skill.directoryPath ? { directoryPath: skill.directoryPath } : {}),
    },
  };
}

export function normalizeSkillScanCapabilities(
  input: NormalizeSkillScanInput,
): readonly AgentCapabilityContribution[] {
  return [
    ...normalizeSkillScanGroup({ skills: input.builtin, source: 'builtin', trustLevel: 'core' }),
    ...normalizeSkillScanGroup({ skills: input.market, source: 'market' }),
    ...normalizeSkillScanGroup({ skills: input.local, source: 'local' }),
    ...normalizeSkillScanGroup({ skills: input.plugin, source: 'plugin' }),
    ...normalizeSkillScanGroup({ skills: input.mcp, source: 'mcp', trustLevel: 'untrusted' }),
  ];
}

export function normalizeManifestCapability(
  manifest: AgentCapabilityManifest,
): AgentCapabilityContribution {
  return {
    identity: {
      id: `provider:${manifest.id}`,
      source: 'provider',
      sourceId: manifest.id,
      version: manifest.version,
      trustLevel: manifest.trustLevel ?? 'core',
    },
    displayName: manifest.displayName,
    hostRequirements: manifest.hostRequirements,
    toolNames: manifest.capabilities
      .filter((capability) => capability.type === 'tool')
      .map((capability) => capability.name),
    toolGroupNames: manifest.capabilities
      .filter((capability) => capability.type === 'toolGroup')
      .map((capability) => capability.name),
    metadata: {
      declarations: manifest.capabilities,
    },
  };
}

export function validateCapabilityContribution(
  contribution: AgentCapabilityContribution,
): readonly AgentCapabilityDiagnostic[] {
  const diagnostics: AgentCapabilityDiagnostic[] = [];
  const contributionId = contribution.identity.id;

  pushMissingStringDiagnostic(diagnostics, contributionId, contribution.identity.id, 'identity.id');
  pushMissingStringDiagnostic(
    diagnostics,
    contributionId,
    contribution.identity.sourceId,
    'identity.sourceId',
  );

  if (!isCapabilitySource(contribution.identity.source)) {
    diagnostics.push(validationDiagnostic(contributionId, 'invalid-source', 'identity.source'));
  }
  if (!isTrustLevel(contribution.identity.trustLevel)) {
    diagnostics.push(
      validationDiagnostic(contributionId, 'invalid-trust-level', 'identity.trustLevel'),
    );
  }
  if (
    contribution.identity.version !== undefined &&
    contribution.identity.version.trim().length === 0
  ) {
    diagnostics.push(validationDiagnostic(contributionId, 'invalid-version', 'identity.version'));
  }

  for (const fragment of contribution.promptFragments ?? []) {
    pushMissingStringDiagnostic(diagnostics, contributionId, fragment.id, 'promptFragments.id');
    pushMissingStringDiagnostic(
      diagnostics,
      contributionId,
      fragment.content,
      'promptFragments.content',
    );
  }
  for (const toolName of [
    ...(contribution.allowedTools ?? []),
    ...(contribution.toolNames ?? []),
  ]) {
    pushMissingStringDiagnostic(diagnostics, contributionId, toolName, 'toolName');
  }
  for (const command of contribution.slashCommands ?? []) {
    pushMissingStringDiagnostic(diagnostics, contributionId, command.id, 'slashCommands.id');
    pushMissingStringDiagnostic(diagnostics, contributionId, command.name, 'slashCommands.name');
  }
  for (const fragment of contribution.workflowFragments ?? []) {
    pushMissingStringDiagnostic(diagnostics, contributionId, fragment.id, 'workflowFragments.id');
  }
  for (const requirement of contribution.hostRequirements ?? []) {
    if (!isHost(requirement.host)) {
      diagnostics.push(
        validationDiagnostic(contributionId, 'invalid-host-requirement', 'hostRequirements.host'),
      );
    }
  }
  for (const requirement of contribution.permissionRequirements ?? []) {
    pushMissingStringDiagnostic(
      diagnostics,
      contributionId,
      requirement.scope,
      'permissionRequirements.scope',
    );
  }
  for (const requirement of contribution.workflowNodeRequirements ?? []) {
    if (
      (requirement.nodeIds?.length ?? 0) === 0 &&
      (requirement.nodeKinds?.length ?? 0) === 0 &&
      (requirement.stages?.length ?? 0) === 0
    ) {
      diagnostics.push(
        validationDiagnostic(
          contributionId,
          'empty-workflow-node-requirement',
          'workflowNodeRequirements',
        ),
      );
    }
  }

  return diagnostics;
}

class DefaultAgentCapabilityInjectionRuntime implements AgentCapabilityInjectionRuntime {
  private readonly contributions = new Map<string, AgentCapabilityContribution>();
  private readonly registrationDiagnostics: AgentCapabilityDiagnostic[] = [];
  private readonly injectionDiagnostics: AgentCapabilityDiagnostic[] = [];
  private readonly telemetryEvents: AgentCapabilityTelemetryEvent[] = [];
  private readonly maxRegistrationDiagnostics: number;
  private readonly maxInjectionDiagnostics: number;
  private readonly maxTelemetryEvents: number;
  private telemetryEventSequence = 0;

  constructor(options: AgentCapabilityInjectionRuntimeOptions = {}) {
    this.maxRegistrationDiagnostics = normalizeRetentionLimit(
      options.retention?.maxRegistrationDiagnostics,
      DEFAULT_MAX_REGISTRATION_DIAGNOSTICS,
    );
    this.maxInjectionDiagnostics = normalizeRetentionLimit(
      options.retention?.maxInjectionDiagnostics,
      DEFAULT_MAX_INJECTION_DIAGNOSTICS,
    );
    this.maxTelemetryEvents = normalizeRetentionLimit(
      options.retention?.maxTelemetryEvents,
      DEFAULT_MAX_TELEMETRY_EVENTS,
    );
  }

  register(contribution: AgentCapabilityContribution): AgentCapabilityRegistryProjection {
    this.registerOne(contribution);
    return this.projectRegistry();
  }

  registerMany(
    contributions: readonly AgentCapabilityContribution[],
  ): AgentCapabilityRegistryProjection {
    for (const contribution of contributions) {
      this.registerOne(contribution);
    }
    return this.projectRegistry();
  }

  listRegistered(): readonly AgentCapabilityContribution[] {
    return Array.from(this.contributions.values());
  }

  getDiagnostics(phase?: 'registration' | 'injection'): readonly AgentCapabilityDiagnostic[] {
    if (phase === 'registration') return [...this.registrationDiagnostics];
    if (phase === 'injection') return [...this.injectionDiagnostics];
    return [...this.registrationDiagnostics, ...this.injectionDiagnostics];
  }

  inject(context: AgentCapabilityInjectionContext): AgentInjectedCapabilitySet {
    const injected = buildInjectedCapabilitySet(this.contributions.values(), context);
    const diagnostics = [...injected.diagnostics];
    this.recordInjectionDiagnostics(diagnostics);
    this.recordInjectionTelemetry(injected, diagnostics);
    return injected;
  }

  projectSlashCommandCatalog(
    context: AgentCapabilityInjectionContext,
  ): readonly AgentCapabilitySlashCommandContribution[] {
    return projectSlashCommandCatalog(this.contributions.values(), context);
  }

  private registerOne(contribution: AgentCapabilityContribution): void {
    const existing = this.contributions.get(contribution.identity.id);
    this.recordRegistrationDiagnostics(validateCapabilityContribution(contribution));

    if (existing) {
      this.recordRegistrationDiagnostics([
        {
          phase: 'registration',
          code: 'agent.capability.registration.id-collision',
          contributionId: contribution.identity.id,
          reason: 'id-collision',
          message: 'Replacing an existing capability contribution with the same id.',
          metadata: {
            previousSource: existing.identity.source,
            nextSource: contribution.identity.source,
          },
        },
      ]);
    }

    this.recordRegistrationDiagnostics(
      findRegistrationCollisions(contribution, this.contributions.values()),
    );
    this.contributions.set(contribution.identity.id, contribution);
    this.recordRegistrationTelemetry(contribution);
  }

  private projectRegistry(): AgentCapabilityRegistryProjection {
    return {
      contributions: this.listRegistered(),
      diagnostics: this.getDiagnostics('registration'),
    };
  }

  getTelemetrySnapshot(): AgentCapabilityTelemetrySnapshot {
    const fieldCounts = createTelemetryReasonCounts();
    for (const event of this.telemetryEvents) {
      fieldCounts[event.reason] += 1;
    }
    return {
      events: [...this.telemetryEvents],
      fieldCounts,
      updatedAt: this.telemetryEvents.at(-1)?.createdAt ?? Date.now(),
    };
  }

  recordTelemetryEvent(
    event: Omit<AgentCapabilityTelemetryEvent, 'id' | 'createdAt'> & {
      readonly id?: string;
      readonly createdAt?: number;
    },
  ): AgentCapabilityTelemetryEvent {
    const sequence = this.nextTelemetryEventSequence();
    const recorded: AgentCapabilityTelemetryEvent = {
      id: event.id ?? `${event.kind}:${event.contributionId}:${event.field ?? 'event'}:${sequence}`,
      kind: event.kind,
      contributionId: event.contributionId,
      source: event.source,
      sourceId: event.sourceId,
      ...(event.version ? { version: event.version } : {}),
      ...(event.field ? { field: event.field } : {}),
      reason: event.reason,
      ...(event.hash ? { hash: event.hash } : {}),
      createdAt: event.createdAt ?? Date.now(),
      ...(event.metadata ? { metadata: sanitizeTelemetryMetadata(event.metadata) } : {}),
    };
    pushBounded(this.telemetryEvents, [recorded], this.maxTelemetryEvents);
    return recorded;
  }

  private recordRegistrationDiagnostics(diagnostics: readonly AgentCapabilityDiagnostic[]): void {
    pushBounded(this.registrationDiagnostics, diagnostics, this.maxRegistrationDiagnostics);
  }

  private recordInjectionDiagnostics(diagnostics: readonly AgentCapabilityDiagnostic[]): void {
    pushBounded(this.injectionDiagnostics, diagnostics, this.maxInjectionDiagnostics);
  }

  private nextTelemetryEventSequence(): number {
    this.telemetryEventSequence += 1;
    return this.telemetryEventSequence;
  }

  private recordRegistrationTelemetry(contribution: AgentCapabilityContribution): void {
    for (const field of readContributionUsedFields(contribution)) {
      this.recordTelemetryEvent({
        kind: 'field-utilization',
        contributionId: contribution.identity.id,
        source: contribution.identity.source,
        sourceId: contribution.identity.sourceId,
        version: contribution.identity.version,
        field,
        reason: 'used',
        hash: hashTelemetryValue(readContributionFieldValue(contribution, field)),
      });
    }

    for (const field of readMetadataStringArray(contribution.metadata, 'unknownFields')) {
      this.recordTelemetryEvent({
        kind: 'field-utilization',
        contributionId: contribution.identity.id,
        source: contribution.identity.source,
        sourceId: contribution.identity.sourceId,
        version: contribution.identity.version,
        field,
        reason: 'unknown-field',
      });
    }

    for (const field of readMetadataStringArray(contribution.metadata, 'unsupportedFields')) {
      this.recordTelemetryEvent({
        kind: 'field-utilization',
        contributionId: contribution.identity.id,
        source: contribution.identity.source,
        sourceId: contribution.identity.sourceId,
        version: contribution.identity.version,
        field,
        reason: 'unsupported-field',
      });
    }
  }

  private recordInjectionTelemetry(
    injected: AgentInjectedCapabilitySet,
    diagnostics: readonly AgentCapabilityDiagnostic[],
  ): void {
    for (const contribution of injected.contributions) {
      for (const fragment of contribution.promptFragments ?? []) {
        this.recordTelemetryEvent({
          kind: 'field-utilization',
          contributionId: contribution.identity.id,
          source: contribution.identity.source,
          sourceId: contribution.identity.sourceId,
          version: contribution.identity.version,
          field: `promptFragments:${fragment.id}`,
          reason: 'used',
          hash: hashTelemetryValue(fragment.content),
        });
      }
    }

    for (const diagnostic of diagnostics) {
      const contribution = diagnostic.contributionId
        ? this.contributions.get(diagnostic.contributionId)
        : undefined;
      if (!contribution) {
        continue;
      }
      this.recordTelemetryEvent({
        kind: 'field-utilization',
        contributionId: contribution.identity.id,
        source: contribution.identity.source,
        sourceId: contribution.identity.sourceId,
        version: contribution.identity.version,
        field: diagnostic.metadata?.['field'] as string | undefined,
        reason: toTelemetryReason(diagnostic.reason),
        metadata: {
          diagnosticReason: diagnostic.reason,
        },
      });
    }
  }
}

function getInjectionSkipReason(
  contribution: AgentCapabilityContribution,
  context: AgentCapabilityInjectionContext,
  disabledIds: ReadonlySet<string>,
  trust: ReadonlySet<AgentCapabilityTrustLevel>,
): { readonly reason: string; readonly message: string } | null {
  if (disabledIds.has(contribution.identity.id)) {
    return { reason: 'disabled', message: 'Capability contribution is disabled for this turn.' };
  }
  if (!trust.has(contribution.identity.trustLevel)) {
    return {
      reason: 'trust-policy',
      message: 'Capability contribution is blocked by trust policy.',
    };
  }
  if (!isHostSupported(contribution.hostRequirements, context.host)) {
    return {
      reason: 'host-requirement',
      message: 'Capability contribution does not support the current host.',
    };
  }
  if (!isWorkflowNodeSupported(contribution.workflowNodeRequirements, context)) {
    return {
      reason: 'workflow-node-requirement',
      message: 'Capability contribution does not support the current workflow node.',
    };
  }
  if (!isPermissionAllowed(contribution, context)) {
    return {
      reason: 'permission-policy',
      message: 'Capability contribution is blocked by permission policy.',
    };
  }
  if (context.activeSkillId && contribution.identity.id !== context.activeSkillId) {
    const commandSkillIds = new Set(
      (contribution.slashCommands ?? []).map((command) => command.skillId),
    );
    if (!commandSkillIds.has(context.activeSkillId)) {
      return {
        reason: 'active-skill',
        message: 'Capability contribution is not selected by the active skill.',
      };
    }
  }
  return null;
}

function buildInjectedCapabilitySet(
  registeredContributions: Iterable<AgentCapabilityContribution>,
  context: AgentCapabilityInjectionContext,
): AgentInjectedCapabilitySet {
  const diagnostics: AgentCapabilityDiagnostic[] = [];
  const promptFragments: PromptFragment[] = [];
  const allowedTools: string[] = [];
  const slashCommands: AgentCapabilitySlashCommandContribution[] = [];
  const workflowFragments: AgentCapabilityWorkflowFragmentContribution[] = [];
  const contributions: AgentCapabilityContribution[] = [];
  const contributionList = Array.from(registeredContributions);

  if (context.ablation?.disableCapabilityInjection) {
    for (const contribution of contributionList) {
      diagnostics.push(
        skipDiagnostic(
          contribution,
          'ablation-disabled',
          'Capability injection is disabled by ablation.',
        ),
      );
    }
    return {
      contributions,
      promptFragments,
      allowedTools,
      slashCommands,
      workflowFragments,
      diagnostics,
    };
  }

  const disabledIds = new Set(context.disabledContributionIds ?? []);
  const trust = new Set<AgentCapabilityTrustLevel>(
    context.allowedTrustLevels ?? ['core', 'community'],
  );
  let remainingToolBudget = context.toolBudget ?? Number.POSITIVE_INFINITY;

  for (const contribution of contributionList) {
    const skipReason = getInjectionSkipReason(contribution, context, disabledIds, trust);
    if (skipReason) {
      diagnostics.push(skipDiagnostic(contribution, skipReason.reason, skipReason.message));
      continue;
    }

    contributions.push(contribution);
    if (!context.ablation?.disablePromptFragments) {
      promptFragments.push(...(contribution.promptFragments ?? []));
    }
    if (!context.ablation?.disableSkillInjection) {
      slashCommands.push(...(contribution.slashCommands ?? []));
      workflowFragments.push(...(contribution.workflowFragments ?? []));
    }
    if (!context.ablation?.disableToolInjection && remainingToolBudget > 0) {
      for (const toolName of contribution.allowedTools ?? contribution.toolNames ?? []) {
        if (remainingToolBudget <= 0) break;
        if (!allowedTools.includes(toolName)) {
          allowedTools.push(toolName);
          remainingToolBudget--;
        }
      }
    }
  }

  if (remainingToolBudget <= 0) {
    diagnostics.push({
      phase: 'injection',
      code: 'agent.capability.injection.tool-budget-exhausted',
      reason: 'tool-budget',
      message: 'Capability tool injection stopped because the tool budget was exhausted.',
    });
  }

  return {
    contributions,
    promptFragments,
    allowedTools,
    slashCommands,
    workflowFragments,
    diagnostics,
  };
}

function projectSlashCommandCatalog(
  registeredContributions: Iterable<AgentCapabilityContribution>,
  context: AgentCapabilityInjectionContext,
): readonly AgentCapabilitySlashCommandContribution[] {
  const disabledIds = new Set(context.disabledContributionIds ?? []);
  const trust = new Set<AgentCapabilityTrustLevel>(
    context.allowedTrustLevels ?? ['core', 'community'],
  );
  const slashCommands: AgentCapabilitySlashCommandContribution[] = [];

  if (context.ablation?.disableCapabilityInjection || context.ablation?.disableSkillInjection) {
    return slashCommands;
  }

  for (const contribution of registeredContributions) {
    if (getInjectionSkipReason(contribution, context, disabledIds, trust)) {
      continue;
    }
    slashCommands.push(...(contribution.slashCommands ?? []));
  }

  return slashCommands;
}

function normalizeRetentionLimit(value: number | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value < 0) return fallback;
  return Math.floor(value);
}

function pushBounded<T>(target: T[], items: readonly T[], maxItems: number): void {
  if (items.length === 0 || maxItems === 0) return;
  target.push(...items);
  if (target.length > maxItems) {
    target.splice(0, target.length - maxItems);
  }
}

function normalizeSkillScanGroup(
  input: NormalizeSkillScanGroupInput,
): readonly AgentCapabilityContribution[] {
  return (input.skills ?? []).map((skill) =>
    normalizeSkillCapability({
      skill: normalizeSkillSource(skill, input.source),
      source: input.source,
      sourceId: resolveSkillSourceId(skill, input.source),
      trustLevel: input.trustLevel,
      version: skill.version,
    }),
  );
}

function normalizeSkillSource(skill: Skill, source: AgentCapabilitySource): Skill {
  const skillSource = toSkillSource(source) ?? skill.source;
  return skill.source === skillSource ? skill : { ...skill, source: skillSource };
}

function resolveSkillSourceId(skill: Skill, source: AgentCapabilitySource): string {
  return skill.directoryPath ?? skill.name;
}

function findRegistrationCollisions(
  contribution: AgentCapabilityContribution,
  existingContributions: Iterable<AgentCapabilityContribution>,
): AgentCapabilityDiagnostic[] {
  const diagnostics: AgentCapabilityDiagnostic[] = [];
  for (const existing of existingContributions) {
    pushNameCollisions(diagnostics, contribution, existing, 'slash-command', getSlashCommandNames);
    pushNameCollisions(
      diagnostics,
      contribution,
      existing,
      'tool',
      (item) => item.toolNames ?? item.allowedTools ?? [],
    );
    pushNameCollisions(diagnostics, contribution, existing, 'prompt-fragment', (item) =>
      (item.promptFragments ?? []).map((fragment) => fragment.id),
    );
    pushNameCollisions(diagnostics, contribution, existing, 'workflow-fragment', (item) =>
      (item.workflowFragments ?? []).map((fragment) => fragment.id),
    );
  }
  return diagnostics;
}

function pushNameCollisions(
  diagnostics: AgentCapabilityDiagnostic[],
  contribution: AgentCapabilityContribution,
  existing: AgentCapabilityContribution,
  kind: string,
  getNames: (contribution: AgentCapabilityContribution) => readonly string[],
): void {
  const existingNames = new Set(getNames(existing));
  for (const name of getNames(contribution)) {
    if (!existingNames.has(name)) continue;
    diagnostics.push({
      phase: 'registration',
      code: `agent.capability.registration.${kind}-collision`,
      contributionId: contribution.identity.id,
      reason: `${kind}-collision`,
      message: 'Capability registration detected a deterministic name collision.',
      metadata: {
        name,
        existingContributionId: existing.identity.id,
        existingSource: existing.identity.source,
        nextSource: contribution.identity.source,
        winner: selectCollisionWinner(existing, contribution).identity.id,
      },
    });
  }
}

function getSlashCommandNames(contribution: AgentCapabilityContribution): readonly string[] {
  return (contribution.slashCommands ?? []).map((command) => command.name);
}

function selectCollisionWinner(
  left: AgentCapabilityContribution,
  right: AgentCapabilityContribution,
): AgentCapabilityContribution {
  return sourcePriority(left.identity.source) >= sourcePriority(right.identity.source)
    ? left
    : right;
}

function sourcePriority(source: AgentCapabilitySource): number {
  switch (source) {
    case 'builtin':
      return 50;
    case 'provider':
    case 'market':
      return 40;
    case 'plugin':
    case 'local':
      return 30;
    case 'mcp':
      return 20;
    default:
      return 0;
  }
}

function isHostSupported(
  requirements: readonly AgentCapabilityHostRequirement[] | undefined,
  host: AgentCapabilityInjectionContext['host'],
): boolean {
  if (!requirements || requirements.length === 0) return true;
  return requirements.some((requirement) => requirement.host === host || requirement.optional);
}

function isWorkflowNodeSupported(
  requirements: readonly AgentCapabilityWorkflowNodeRequirement[] | undefined,
  context: AgentCapabilityInjectionContext,
): boolean {
  if (!requirements || requirements.length === 0) return true;
  return requirements.some(
    (requirement) =>
      includesWhenPresent(requirement.nodeIds, context.workflowNodeId) &&
      includesWhenPresent(requirement.nodeKinds, context.workflowNodeKind) &&
      includesWhenPresent(requirement.stages, context.workflowStage),
  );
}

function includesWhenPresent(
  values: readonly string[] | undefined,
  value: string | undefined,
): boolean {
  return !values || values.length === 0 || (value !== undefined && values.includes(value));
}

function isPermissionAllowed(
  contribution: AgentCapabilityContribution,
  context: AgentCapabilityInjectionContext,
): boolean {
  const requirements = contribution.permissionRequirements ?? [];
  if (requirements.length === 0) return true;

  const approvedContributionIds = new Set(context.permissionPolicy?.approvedContributionIds ?? []);
  if (approvedContributionIds.has(contribution.identity.id)) return true;

  const allowedScopes = new Set(context.permissionPolicy?.allowedScopes ?? []);
  for (const requirement of requirements) {
    if (
      requirement.mode === 'irreversible' &&
      context.permissionPolicy?.allowIrreversible !== true
    ) {
      return false;
    }
    if (requirement.approvalRequired) {
      return false;
    }
    if (allowedScopes.size > 0 && !allowedScopes.has(requirement.scope)) {
      return false;
    }
  }

  return true;
}

function skipDiagnostic(
  contribution: AgentCapabilityContribution,
  reason: string,
  message: string,
): AgentCapabilityDiagnostic {
  return {
    phase: 'injection',
    code: `agent.capability.injection.${reason}`,
    contributionId: contribution.identity.id,
    reason,
    message,
    metadata: {
      field: selectSkippedField(contribution, reason),
    },
  };
}

function selectSkippedField(contribution: AgentCapabilityContribution, reason: string): string {
  if (reason === 'ablation-disabled') return 'contribution';
  if ((contribution.promptFragments?.length ?? 0) > 0) return 'promptFragments';
  if ((contribution.allowedTools?.length ?? 0) > 0 || (contribution.toolNames?.length ?? 0) > 0) {
    return 'tools';
  }
  if ((contribution.workflowFragments?.length ?? 0) > 0) return 'workflowFragments';
  return 'contribution';
}

function readContributionUsedFields(contribution: AgentCapabilityContribution): readonly string[] {
  const fields = ['identity'];
  if (contribution.displayName) fields.push('displayName');
  if (contribution.description) fields.push('description');
  if (contribution.hostRequirements?.length) fields.push('hostRequirements');
  if (contribution.permissionRequirements?.length) fields.push('permissionRequirements');
  if (contribution.workflowNodeRequirements?.length) fields.push('workflowNodeRequirements');
  if (contribution.promptFragments?.length) fields.push('promptFragments');
  if (contribution.allowedTools?.length) fields.push('allowedTools');
  if (contribution.slashCommands?.length) fields.push('slashCommands');
  if (contribution.workflowFragments?.length) fields.push('workflowFragments');
  if (contribution.toolNames?.length) fields.push('toolNames');
  if (contribution.toolGroupNames?.length) fields.push('toolGroupNames');
  return fields;
}

function readContributionFieldValue(
  contribution: AgentCapabilityContribution,
  field: string,
): unknown {
  switch (field) {
    case 'promptFragments':
      return (contribution.promptFragments ?? []).map((fragment) => ({
        id: fragment.id,
        hash: hashTelemetryValue(fragment.content),
      }));
    case 'identity':
      return contribution.identity;
    default:
      return (contribution as unknown as Record<string, unknown>)[field];
  }
}

function readMetadataStringArray(
  metadata: Record<string, unknown> | undefined,
  key: string,
): readonly string[] {
  const value = metadata?.[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function toTelemetryReason(reason: string): AgentCapabilityTelemetryReason {
  switch (reason) {
    case 'ablation-disabled':
      return 'ablation-skipped';
    case 'host-requirement':
    case 'trust-policy':
    case 'workflow-node-requirement':
    case 'permission-policy':
    case 'active-skill':
    case 'disabled':
      return 'policy-skipped';
    case 'tool-budget':
      return 'withheld-field';
    default:
      return 'withheld-field';
  }
}

function createTelemetryReasonCounts(): Record<AgentCapabilityTelemetryReason, number> {
  return {
    used: 0,
    'unknown-field': 0,
    'unsupported-field': 0,
    'withheld-field': 0,
    'policy-skipped': 0,
    'ablation-skipped': 0,
  };
}

function sanitizeTelemetryMetadata(
  metadata: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value === null
    ) {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

function hashTelemetryValue(value: unknown): string {
  const text = stableStringify(value);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function defaultTrustForSource(source: AgentCapabilitySource): AgentCapabilityTrustLevel {
  return source === 'builtin' || source === 'provider' ? 'core' : 'community';
}

function pushMissingStringDiagnostic(
  diagnostics: AgentCapabilityDiagnostic[],
  contributionId: string,
  value: string | undefined,
  field: string,
): void {
  if (value && value.trim().length > 0) return;
  diagnostics.push(validationDiagnostic(contributionId, 'missing-required-field', field));
}

function validationDiagnostic(
  contributionId: string,
  reason: string,
  field: string,
): AgentCapabilityDiagnostic {
  return {
    phase: 'registration',
    code: `agent.capability.registration.${reason}`,
    contributionId,
    reason,
    message: 'Capability contribution failed manifest/frontmatter validation.',
    metadata: { field },
  };
}

function isCapabilitySource(source: string): source is AgentCapabilitySource {
  return ['builtin', 'market', 'local', 'plugin', 'mcp', 'provider'].includes(source);
}

function isTrustLevel(trustLevel: string): trustLevel is AgentCapabilityTrustLevel {
  return ['core', 'community', 'untrusted'].includes(trustLevel);
}

function isHost(host: string): host is AgentCapabilityInjectionContext['host'] {
  return ['vscode', 'cli', 'tui'].includes(host);
}

function toSkillSource(source: AgentCapabilitySource): SkillSource | null {
  switch (source) {
    case 'builtin':
      return 'builtin';
    case 'market':
      return 'market';
    case 'local':
      return 'project';
    default:
      return null;
  }
}
