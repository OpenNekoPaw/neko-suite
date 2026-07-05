import type {
  AgentArtifactExecutionCapabilityContribution,
  AgentArtifactFacetsContribution,
  AgentCapabilityContribution,
  AgentCapabilityDiagnostic,
  AgentCapabilityInjectionContext,
  AgentCapabilityPermissionRequirement,
  AgentCapabilityRegistryProjection,
  AgentCapabilitySlashCommandContribution,
  AgentCapabilitySource,
  AgentSemanticFacetActionAvailability,
  AgentCapabilityTelemetryEvent,
  AgentCapabilityTelemetryEventKind,
  AgentCapabilityTelemetryReason,
  AgentCapabilityTelemetrySnapshot,
  AgentCapabilityCreationStageRequirement,
  AgentCapabilityPromptChainFragmentContribution,
  AgentInjectedCapabilitySet,
} from '@neko-agent/types';
import type {
  AgentCapabilityLifecycleDescriptor,
  AgentCapabilityHostRequirement,
  AgentCapabilityManifest,
  AgentCapabilityTrustLevel,
  PromptFragment,
  Skill,
  SkillSource,
} from '@neko/shared';
import {
  isAgentCapabilityLifecyclePhase,
  isAgentCapabilityLifecycleRisk,
  isAgentCapabilityLifecycleDescriptor,
} from '@neko/shared';

export interface NormalizeSkillCapabilityInput {
  readonly skill: Skill;
  readonly source: AgentCapabilitySource;
  readonly sourceId?: string;
  readonly trustLevel?: AgentCapabilityTrustLevel;
  readonly version?: string;
  readonly hostRequirements?: readonly AgentCapabilityHostRequirement[];
  readonly permissionRequirements?: readonly AgentCapabilityPermissionRequirement[];
  readonly creationStageRequirements?: readonly AgentCapabilityCreationStageRequirement[];
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
  getArtifactFacets(context?: AgentCapabilityInjectionContext): AgentArtifactFacetsContribution;
  findArtifactCapabilities(
    actionId: string,
    context?: AgentCapabilityInjectionContext,
  ): readonly AgentArtifactExecutionCapabilityContribution[];
  getSemanticFacetActionAvailability(
    actionId: string,
    context?: AgentCapabilityInjectionContext,
  ): AgentSemanticFacetActionAvailability;
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
    ...(input.creationStageRequirements
      ? { creationStageRequirements: input.creationStageRequirements }
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
  for (const fragment of contribution.promptChainFragments ?? []) {
    pushMissingStringDiagnostic(
      diagnostics,
      contributionId,
      fragment.id,
      'promptChainFragments.id',
    );
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
  for (const requirement of contribution.creationStageRequirements ?? []) {
    if ((requirement.profileIds?.length ?? 0) === 0 && (requirement.stageIds?.length ?? 0) === 0) {
      diagnostics.push(
        validationDiagnostic(
          contributionId,
          'empty-creation-stage-requirement',
          'creationStageRequirements',
        ),
      );
    }
  }
  validateArtifactFacets(contribution, diagnostics);

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

  getArtifactFacets(context?: AgentCapabilityInjectionContext): AgentArtifactFacetsContribution {
    return mergeArtifactFacets(this.contributions.values(), context);
  }

  findArtifactCapabilities(
    actionId: string,
    context?: AgentCapabilityInjectionContext,
  ): readonly AgentArtifactExecutionCapabilityContribution[] {
    return findArtifactCapabilities(this.contributions.values(), actionId, context);
  }

  getSemanticFacetActionAvailability(
    actionId: string,
    context?: AgentCapabilityInjectionContext,
  ): AgentSemanticFacetActionAvailability {
    return getSemanticFacetActionAvailability(this.contributions.values(), actionId, context);
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
      artifactFacets: this.getArtifactFacets(),
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
  if (!isCreationStageSupported(contribution.creationStageRequirements, context)) {
    return {
      reason: 'creation-stage-requirement',
      message: 'Capability contribution does not support the current creation stage.',
    };
  }
  if (!isPermissionAllowed(contribution, context)) {
    return {
      reason: 'permission-policy',
      message: 'Capability contribution is blocked by permission policy.',
    };
  }
  if (context.activeSkillId && isSkillScopedContribution(contribution)) {
    if (!matchesActiveSkill(contribution, context.activeSkillId)) {
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
  const promptChainFragments: AgentCapabilityPromptChainFragmentContribution[] = [];
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
      promptChainFragments,
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
      promptChainFragments.push(...(contribution.promptChainFragments ?? []));
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
    promptChainFragments,
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

function findArtifactCapabilities(
  registeredContributions: Iterable<AgentCapabilityContribution>,
  actionId: string,
  context?: AgentCapabilityInjectionContext,
): readonly AgentArtifactExecutionCapabilityContribution[] {
  const disabledIds = new Set(context?.disabledContributionIds ?? []);
  const trust = new Set<AgentCapabilityTrustLevel>(
    context?.allowedTrustLevels ?? ['core', 'community'],
  );
  const matches: AgentArtifactExecutionCapabilityContribution[] = [];

  for (const contribution of registeredContributions) {
    if (context && getInjectionSkipReason(contribution, context, disabledIds, trust)) {
      continue;
    }
    for (const capability of contribution.artifactFacets?.capabilities ?? []) {
      if (capability.actions.includes(actionId)) {
        matches.push(capability);
      }
    }
  }

  return matches;
}

function getSemanticFacetActionAvailability(
  registeredContributions: Iterable<AgentCapabilityContribution>,
  actionId: string,
  context?: AgentCapabilityInjectionContext,
): AgentSemanticFacetActionAvailability {
  const contributionList = Array.from(registeredContributions);
  const registeredFacetIds = collectSemanticFacetActionIds(
    mergeArtifactFacets(contributionList),
    actionId,
  );
  if (registeredFacetIds.length === 0) {
    return {
      actionId,
      available: false,
      facetIds: [],
      unavailableFacetIds: [],
      reason: 'missing-provider',
      message: 'No registered semantic facet provider declares this action.',
    };
  }

  const availableFacetIds = collectSemanticFacetActionIds(
    mergeArtifactFacets(contributionList, context),
    actionId,
  );
  const unavailableFacetIds = registeredFacetIds.filter(
    (facetId) => !availableFacetIds.includes(facetId),
  );
  if (availableFacetIds.length === 0) {
    return {
      actionId,
      available: false,
      facetIds: [],
      unavailableFacetIds,
      reason: 'provider-unavailable',
      message:
        'Semantic facet providers declare this action but are unavailable in the current context.',
    };
  }
  return {
    actionId,
    available: true,
    facetIds: availableFacetIds,
    unavailableFacetIds,
  };
}

function mergeArtifactFacets(
  registeredContributions: Iterable<AgentCapabilityContribution>,
  context?: AgentCapabilityInjectionContext,
): AgentArtifactFacetsContribution {
  const protocols = new Map<
    string,
    NonNullable<AgentArtifactFacetsContribution['protocols']>[number]
  >();
  const profiles = new Map<
    string,
    NonNullable<AgentArtifactFacetsContribution['profiles']>[number]
  >();
  const renderers = new Map<
    string,
    NonNullable<AgentArtifactFacetsContribution['renderers']>[number]
  >();
  const projectors = new Map<
    string,
    NonNullable<AgentArtifactFacetsContribution['projectors']>[number]
  >();
  const capabilities = new Map<string, AgentArtifactExecutionCapabilityContribution>();
  const lifecycleCapabilities = new Map<string, AgentCapabilityLifecycleDescriptor>();
  const entityProviders = new Map<
    string,
    NonNullable<AgentArtifactFacetsContribution['entityProviders']>[number]
  >();
  const entityMemoryContributors = new Map<
    string,
    NonNullable<AgentArtifactFacetsContribution['entityMemoryContributors']>[number]
  >();
  const mediaTextExtractors = new Map<
    string,
    NonNullable<AgentArtifactFacetsContribution['mediaTextExtractors']>[number]
  >();
  const perceptionProviders = new Map<
    string,
    NonNullable<AgentArtifactFacetsContribution['perceptionProviders']>[number]
  >();
  const perceptionCapabilities = new Map<
    string,
    NonNullable<AgentArtifactFacetsContribution['perceptionCapabilities']>[number]
  >();
  const semanticIndexProviders = new Map<
    string,
    NonNullable<AgentArtifactFacetsContribution['semanticIndexProviders']>[number]
  >();
  const reviewSurfaces = new Map<
    string,
    NonNullable<AgentArtifactFacetsContribution['reviewSurfaces']>[number]
  >();
  const representationResolvers = new Map<
    string,
    NonNullable<AgentArtifactFacetsContribution['representationResolvers']>[number]
  >();

  const disabledIds = new Set(context?.disabledContributionIds ?? []);
  const trust = new Set<AgentCapabilityTrustLevel>(
    context?.allowedTrustLevels ?? ['core', 'community'],
  );

  for (const contribution of registeredContributions) {
    if (context && getInjectionSkipReason(contribution, context, disabledIds, trust)) {
      continue;
    }
    for (const protocol of contribution.artifactFacets?.protocols ?? []) {
      protocols.set(protocol.id, protocol);
    }
    for (const profile of contribution.artifactFacets?.profiles ?? []) {
      profiles.set(profile.id, profile);
    }
    for (const renderer of contribution.artifactFacets?.renderers ?? []) {
      renderers.set(renderer.id, renderer);
    }
    for (const projector of contribution.artifactFacets?.projectors ?? []) {
      projectors.set(projector.id, projector);
    }
    for (const capability of contribution.artifactFacets?.capabilities ?? []) {
      capabilities.set(capability.capabilityId, capability);
    }
    for (const capability of contribution.artifactFacets?.lifecycleCapabilities ?? []) {
      lifecycleCapabilities.set(capability.capabilityId, capability);
    }
    for (const facet of contribution.artifactFacets?.entityProviders ?? []) {
      entityProviders.set(facet.id, facet);
    }
    for (const facet of contribution.artifactFacets?.entityMemoryContributors ?? []) {
      entityMemoryContributors.set(facet.id, facet);
    }
    for (const facet of contribution.artifactFacets?.mediaTextExtractors ?? []) {
      mediaTextExtractors.set(facet.id, facet);
    }
    for (const facet of contribution.artifactFacets?.perceptionProviders ?? []) {
      perceptionProviders.set(facet.id, facet);
    }
    for (const facet of contribution.artifactFacets?.perceptionCapabilities ?? []) {
      perceptionCapabilities.set(facet.providerId, facet);
    }
    for (const facet of contribution.artifactFacets?.semanticIndexProviders ?? []) {
      semanticIndexProviders.set(facet.id, facet);
    }
    for (const facet of contribution.artifactFacets?.reviewSurfaces ?? []) {
      reviewSurfaces.set(facet.id, facet);
    }
    for (const facet of contribution.artifactFacets?.representationResolvers ?? []) {
      representationResolvers.set(facet.id, facet);
    }
  }

  return {
    protocols: Array.from(protocols.values()),
    profiles: Array.from(profiles.values()),
    renderers: Array.from(renderers.values()),
    projectors: Array.from(projectors.values()),
    capabilities: Array.from(capabilities.values()),
    lifecycleCapabilities: Array.from(lifecycleCapabilities.values()),
    entityProviders: Array.from(entityProviders.values()),
    entityMemoryContributors: Array.from(entityMemoryContributors.values()),
    mediaTextExtractors: Array.from(mediaTextExtractors.values()),
    perceptionProviders: Array.from(perceptionProviders.values()),
    perceptionCapabilities: Array.from(perceptionCapabilities.values()),
    semanticIndexProviders: Array.from(semanticIndexProviders.values()),
    reviewSurfaces: Array.from(reviewSurfaces.values()),
    representationResolvers: Array.from(representationResolvers.values()),
  };
}

function collectSemanticFacetActionIds(
  facets: AgentArtifactFacetsContribution,
  actionId: string,
): readonly string[] {
  return [
    ...(facets.entityProviders ?? []),
    ...(facets.entityMemoryContributors ?? []),
    ...(facets.mediaTextExtractors ?? []),
    ...(facets.perceptionProviders ?? []),
    ...(facets.semanticIndexProviders ?? []),
    ...(facets.reviewSurfaces ?? []),
    ...(facets.representationResolvers ?? []),
  ]
    .filter((facet) => (facet.actions ?? []).includes(actionId))
    .map((facet) => facet.id);
}

function normalizeRetentionLimit(value: number | undefined, defaultValue: number): number {
  if (value === undefined) return defaultValue;
  if (!Number.isFinite(value) || value < 0) return defaultValue;
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
      sourceId: resolveSkillSourceId(skill),
      trustLevel: input.trustLevel,
      version: skill.version,
    }),
  );
}

function normalizeSkillSource(skill: Skill, source: AgentCapabilitySource): Skill {
  const skillSource = toSkillSource(source) ?? skill.source;
  return skill.source === skillSource ? skill : { ...skill, source: skillSource };
}

function resolveSkillSourceId(skill: Skill): string {
  return skill.directoryPath ?? skill.name;
}

function isSkillScopedContribution(contribution: AgentCapabilityContribution): boolean {
  return (
    contribution.identity.id.startsWith('skill:') ||
    (contribution.slashCommands ?? []).some((command) => typeof command.skillId === 'string')
  );
}

function matchesActiveSkill(
  contribution: AgentCapabilityContribution,
  activeSkillId: string,
): boolean {
  if (contribution.identity.id === activeSkillId) return true;
  return (contribution.slashCommands ?? []).some((command) => command.skillId === activeSkillId);
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
    pushNameCollisions(diagnostics, contribution, existing, 'prompt-chain-fragment', (item) =>
      (item.promptChainFragments ?? []).map((fragment) => fragment.id),
    );
  }
  return diagnostics;
}

function validateArtifactFacets(
  contribution: AgentCapabilityContribution,
  diagnostics: AgentCapabilityDiagnostic[],
): void {
  const facets = contribution.artifactFacets;
  if (!facets) return;

  for (const protocol of facets.protocols ?? []) {
    pushMissingStringDiagnostic(
      diagnostics,
      contribution.identity.id,
      protocol.id,
      'artifactFacets.protocols.id',
    );
    pushMissingStringDiagnostic(
      diagnostics,
      contribution.identity.id,
      protocol.artifactKind,
      'artifactFacets.protocols.artifactKind',
    );
    validateIntegerField(
      diagnostics,
      contribution.identity.id,
      protocol.schemaVersion,
      'artifactFacets.protocols.schemaVersion',
    );
    pushMissingStringDiagnostic(
      diagnostics,
      contribution.identity.id,
      protocol.validatorId,
      'artifactFacets.protocols.validatorId',
    );
    validateOptionalStringArrayField(
      diagnostics,
      contribution.identity.id,
      protocol.rendererIds,
      'artifactFacets.protocols.rendererIds',
    );
    validateOptionalStringArrayField(
      diagnostics,
      contribution.identity.id,
      protocol.projectorIds,
      'artifactFacets.protocols.projectorIds',
    );
  }

  for (const profile of facets.profiles ?? []) {
    pushMissingStringDiagnostic(
      diagnostics,
      contribution.identity.id,
      profile.id,
      'artifactFacets.profiles.id',
    );
    pushMissingStringDiagnostic(
      diagnostics,
      contribution.identity.id,
      profile.profileId,
      'artifactFacets.profiles.profileId',
    );
    pushMissingStringDiagnostic(
      diagnostics,
      contribution.identity.id,
      profile.protocol,
      'artifactFacets.profiles.protocol',
    );
    validateIntegerField(
      diagnostics,
      contribution.identity.id,
      profile.version,
      'artifactFacets.profiles.version',
    );
  }

  for (const renderer of facets.renderers ?? []) {
    pushMissingStringDiagnostic(
      diagnostics,
      contribution.identity.id,
      renderer.id,
      'artifactFacets.renderers.id',
    );
    validateRequiredStringArrayField(
      diagnostics,
      contribution.identity.id,
      renderer.accepts,
      'artifactFacets.renderers.accepts',
    );
    validateOptionalStringArrayField(
      diagnostics,
      contribution.identity.id,
      renderer.profiles,
      'artifactFacets.renderers.profiles',
    );
  }

  for (const projector of facets.projectors ?? []) {
    pushMissingStringDiagnostic(
      diagnostics,
      contribution.identity.id,
      projector.id,
      'artifactFacets.projectors.id',
    );
    validateRequiredStringArrayField(
      diagnostics,
      contribution.identity.id,
      projector.accepts,
      'artifactFacets.projectors.accepts',
    );
    validateRequiredStringArrayField(
      diagnostics,
      contribution.identity.id,
      projector.produces,
      'artifactFacets.projectors.produces',
    );
    validateOptionalStringArrayField(
      diagnostics,
      contribution.identity.id,
      projector.profiles,
      'artifactFacets.projectors.profiles',
    );
  }

  for (const capability of facets.capabilities ?? []) {
    pushMissingStringDiagnostic(
      diagnostics,
      contribution.identity.id,
      capability.capabilityId,
      'artifactFacets.capabilities.capabilityId',
    );
    pushMissingStringDiagnostic(
      diagnostics,
      contribution.identity.id,
      capability.packageId,
      'artifactFacets.capabilities.packageId',
    );
    validateRequiredStringArrayField(
      diagnostics,
      contribution.identity.id,
      capability.accepts,
      'artifactFacets.capabilities.accepts',
    );
    validateOptionalStringArrayField(
      diagnostics,
      contribution.identity.id,
      capability.produces,
      'artifactFacets.capabilities.produces',
    );
    validateRequiredStringArrayField(
      diagnostics,
      contribution.identity.id,
      capability.actions,
      'artifactFacets.capabilities.actions',
    );
    if (!isArtifactCapabilityRisk(capability.risk)) {
      diagnostics.push(
        validationDiagnostic(
          contribution.identity.id,
          'invalid-artifact-risk',
          'artifactFacets.capabilities.risk',
        ),
      );
    }
    if (typeof capability.requiresApproval !== 'boolean') {
      diagnostics.push(
        validationDiagnostic(
          contribution.identity.id,
          'invalid-artifact-approval',
          'artifactFacets.capabilities.requiresApproval',
        ),
      );
    }
  }

  for (const capability of facets.lifecycleCapabilities ?? []) {
    pushMissingStringDiagnostic(
      diagnostics,
      contribution.identity.id,
      capability.capabilityId,
      'artifactFacets.lifecycleCapabilities.capabilityId',
    );
    pushMissingStringDiagnostic(
      diagnostics,
      contribution.identity.id,
      capability.providerId,
      'artifactFacets.lifecycleCapabilities.providerId',
    );
    pushMissingStringDiagnostic(
      diagnostics,
      contribution.identity.id,
      capability.displayName,
      'artifactFacets.lifecycleCapabilities.displayName',
    );
    pushMissingStringDiagnostic(
      diagnostics,
      contribution.identity.id,
      capability.description,
      'artifactFacets.lifecycleCapabilities.description',
    );
    if (
      !Array.isArray(capability.phases) ||
      capability.phases.length === 0 ||
      !capability.phases.every(isAgentCapabilityLifecyclePhase)
    ) {
      diagnostics.push(
        validationDiagnostic(
          contribution.identity.id,
          'invalid-lifecycle-phases',
          'artifactFacets.lifecycleCapabilities.phases',
        ),
      );
    }
    if (!capability.inputSchema?.id?.trim()) {
      diagnostics.push(
        validationDiagnostic(
          contribution.identity.id,
          'invalid-lifecycle-input-schema',
          'artifactFacets.lifecycleCapabilities.inputSchema',
        ),
      );
    }
    if (!capability.resultSchema?.id?.trim()) {
      diagnostics.push(
        validationDiagnostic(
          contribution.identity.id,
          'invalid-lifecycle-result-schema',
          'artifactFacets.lifecycleCapabilities.resultSchema',
        ),
      );
    }
    validateOptionalStringArrayField(
      diagnostics,
      contribution.identity.id,
      capability.accepts,
      'artifactFacets.lifecycleCapabilities.accepts',
    );
    validateOptionalStringArrayField(
      diagnostics,
      contribution.identity.id,
      capability.produces,
      'artifactFacets.lifecycleCapabilities.produces',
    );
    if (!isAgentCapabilityLifecycleRisk(capability.risk)) {
      diagnostics.push(
        validationDiagnostic(
          contribution.identity.id,
          'invalid-lifecycle-risk',
          'artifactFacets.lifecycleCapabilities.risk',
        ),
      );
    }
    if (typeof capability.requiresApproval !== 'boolean') {
      diagnostics.push(
        validationDiagnostic(
          contribution.identity.id,
          'invalid-lifecycle-approval',
          'artifactFacets.lifecycleCapabilities.requiresApproval',
        ),
      );
    }
    if (!isAgentCapabilityLifecycleDescriptor(capability)) {
      diagnostics.push(
        validationDiagnostic(
          contribution.identity.id,
          'invalid-lifecycle-descriptor',
          'artifactFacets.lifecycleCapabilities',
        ),
      );
    }
  }

  validateSemanticFacetArray(
    contribution,
    diagnostics,
    facets.entityProviders,
    'artifactFacets.entityProviders',
    ['entityKinds', 'sourceKinds'],
  );
  validateSemanticFacetArray(
    contribution,
    diagnostics,
    facets.entityMemoryContributors,
    'artifactFacets.entityMemoryContributors',
    ['sourceKinds', 'contributionKinds', 'reviewPolicies', 'actions'],
  );
  validateSemanticFacetArray(
    contribution,
    diagnostics,
    facets.mediaTextExtractors,
    'artifactFacets.mediaTextExtractors',
    ['textKinds', 'sourceKinds', 'modalities', 'actions'],
  );
  validateSemanticFacetArray(
    contribution,
    diagnostics,
    facets.perceptionProviders,
    'artifactFacets.perceptionProviders',
    ['modalities', 'timing', 'actions'],
  );
  validatePerceptionProviderLayers(contribution, diagnostics, facets.perceptionProviders);
  validatePerceptionCapabilityFacets(contribution, diagnostics, facets.perceptionCapabilities);
  validateSemanticFacetArray(
    contribution,
    diagnostics,
    facets.semanticIndexProviders,
    'artifactFacets.semanticIndexProviders',
    ['sourceKinds', 'partitions', 'actions'],
  );
  validateSemanticFacetArray(
    contribution,
    diagnostics,
    facets.reviewSurfaces,
    'artifactFacets.reviewSurfaces',
    ['surfaceKinds', 'actions'],
  );
  validateSemanticFacetArray(
    contribution,
    diagnostics,
    facets.representationResolvers,
    'artifactFacets.representationResolvers',
    ['entityKinds', 'representationKinds', 'actions'],
  );
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

function isCreationStageSupported(
  requirements: readonly AgentCapabilityCreationStageRequirement[] | undefined,
  context: AgentCapabilityInjectionContext,
): boolean {
  if (!requirements || requirements.length === 0) return true;
  return requirements.some(
    (requirement) =>
      includesWhenPresent(requirement.profileIds, context.creationProfileId) &&
      includesWhenPresent(requirement.stageIds, context.creationStageId),
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
  if ((contribution.promptChainFragments?.length ?? 0) > 0) return 'promptChainFragments';
  return 'contribution';
}

function readContributionUsedFields(contribution: AgentCapabilityContribution): readonly string[] {
  const fields = ['identity'];
  if (contribution.displayName) fields.push('displayName');
  if (contribution.description) fields.push('description');
  if (contribution.hostRequirements?.length) fields.push('hostRequirements');
  if (contribution.permissionRequirements?.length) fields.push('permissionRequirements');
  if (contribution.creationStageRequirements?.length) fields.push('creationStageRequirements');
  if (contribution.promptFragments?.length) fields.push('promptFragments');
  if (contribution.allowedTools?.length) fields.push('allowedTools');
  if (contribution.slashCommands?.length) fields.push('slashCommands');
  if (contribution.promptChainFragments?.length) fields.push('promptChainFragments');
  if (contribution.toolNames?.length) fields.push('toolNames');
  if (contribution.toolGroupNames?.length) fields.push('toolGroupNames');
  if (hasArtifactFacets(contribution.artifactFacets)) fields.push('artifactFacets');
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
    case 'creation-stage-requirement':
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

function validateIntegerField(
  diagnostics: AgentCapabilityDiagnostic[],
  contributionId: string,
  value: number,
  field: string,
): void {
  if (Number.isInteger(value)) return;
  diagnostics.push(validationDiagnostic(contributionId, 'invalid-integer-field', field));
}

function validateRequiredStringArrayField(
  diagnostics: AgentCapabilityDiagnostic[],
  contributionId: string,
  value: readonly string[],
  field: string,
): void {
  if (isNonEmptyStringArray(value)) return;
  diagnostics.push(validationDiagnostic(contributionId, 'invalid-string-array-field', field));
}

function validateOptionalStringArrayField(
  diagnostics: AgentCapabilityDiagnostic[],
  contributionId: string,
  value: readonly string[] | undefined,
  field: string,
): void {
  if (value === undefined || isNonEmptyStringArray(value)) return;
  diagnostics.push(validationDiagnostic(contributionId, 'invalid-string-array-field', field));
}

function validateSemanticFacetArray(
  contribution: AgentCapabilityContribution,
  diagnostics: AgentCapabilityDiagnostic[],
  facets:
    | readonly {
        readonly id: string;
        readonly packageId: string;
        readonly availability?: string;
        readonly risk?: string;
        readonly requiresApproval?: boolean;
        readonly metadata?: Readonly<Record<string, unknown>>;
      }[]
    | undefined,
  field: string,
  stringArrayFields: readonly string[],
): void {
  for (const facet of facets ?? []) {
    pushMissingStringDiagnostic(diagnostics, contribution.identity.id, facet.id, `${field}.id`);
    pushMissingStringDiagnostic(
      diagnostics,
      contribution.identity.id,
      facet.packageId,
      `${field}.packageId`,
    );
    if (
      facet.availability !== undefined &&
      !['available', 'unavailable', 'degraded'].includes(facet.availability)
    ) {
      diagnostics.push(
        validationDiagnostic(
          contribution.identity.id,
          'invalid-facet-availability',
          `${field}.availability`,
        ),
      );
    }
    if (facet.risk !== undefined && !isArtifactCapabilityRisk(facet.risk)) {
      diagnostics.push(
        validationDiagnostic(contribution.identity.id, 'invalid-artifact-risk', `${field}.risk`),
      );
    }
    if (facet.requiresApproval !== undefined && typeof facet.requiresApproval !== 'boolean') {
      diagnostics.push(
        validationDiagnostic(
          contribution.identity.id,
          'invalid-artifact-approval',
          `${field}.requiresApproval`,
        ),
      );
    }
    for (const stringArrayField of stringArrayFields) {
      validateOptionalStringArrayField(
        diagnostics,
        contribution.identity.id,
        (facet as unknown as Record<string, readonly string[] | undefined>)[stringArrayField],
        `${field}.${stringArrayField}`,
      );
    }
  }
}

function validatePerceptionProviderLayers(
  contribution: AgentCapabilityContribution,
  diagnostics: AgentCapabilityDiagnostic[],
  facets: NonNullable<AgentArtifactFacetsContribution['perceptionProviders']> | undefined,
): void {
  for (const facet of facets ?? []) {
    if (
      facet.layers !== undefined &&
      (!Array.isArray(facet.layers) ||
        facet.layers.length === 0 ||
        !facet.layers.every((layer: number) => Number.isInteger(layer) && layer >= 0))
    ) {
      diagnostics.push(
        validationDiagnostic(
          contribution.identity.id,
          'invalid-integer-array-field',
          'artifactFacets.perceptionProviders.layers',
        ),
      );
    }
  }
}

function validatePerceptionCapabilityFacets(
  contribution: AgentCapabilityContribution,
  diagnostics: AgentCapabilityDiagnostic[],
  facets: NonNullable<AgentArtifactFacetsContribution['perceptionCapabilities']> | undefined,
): void {
  for (const facet of facets ?? []) {
    pushMissingStringDiagnostic(
      diagnostics,
      contribution.identity.id,
      facet.providerId,
      'artifactFacets.perceptionCapabilities.providerId',
    );
    validateRequiredStringArrayField(
      diagnostics,
      contribution.identity.id,
      facet.tasks,
      'artifactFacets.perceptionCapabilities.tasks',
    );
    validateRequiredStringArrayField(
      diagnostics,
      contribution.identity.id,
      facet.supportedMediaKinds,
      'artifactFacets.perceptionCapabilities.supportedMediaKinds',
    );
    if (!isPerceptionCapabilitySource(facet.source)) {
      diagnostics.push(
        validationDiagnostic(
          contribution.identity.id,
          'invalid-perception-capability-source',
          'artifactFacets.perceptionCapabilities.source',
        ),
      );
    }
    if (!isPerceptionCapabilityExecutionMode(facet.executionMode)) {
      diagnostics.push(
        validationDiagnostic(
          contribution.identity.id,
          'invalid-perception-capability-execution-mode',
          'artifactFacets.perceptionCapabilities.executionMode',
        ),
      );
    }
    if (!isPerceptionCapabilityDeviceTier(facet.deviceTier)) {
      diagnostics.push(
        validationDiagnostic(
          contribution.identity.id,
          'invalid-perception-capability-device-tier',
          'artifactFacets.perceptionCapabilities.deviceTier',
        ),
      );
    }
    if (!isPerceptionCapabilityCachePolicy(facet.cachePolicy)) {
      diagnostics.push(
        validationDiagnostic(
          contribution.identity.id,
          'invalid-perception-capability-cache-policy',
          'artifactFacets.perceptionCapabilities.cachePolicy',
        ),
      );
    }
    if (!isPerceptionCapabilityConfidenceKind(facet.confidenceKind)) {
      diagnostics.push(
        validationDiagnostic(
          contribution.identity.id,
          'invalid-perception-capability-confidence-kind',
          'artifactFacets.perceptionCapabilities.confidenceKind',
        ),
      );
    }
    if (!Number.isInteger(facet.defaultConcurrency) || facet.defaultConcurrency <= 0) {
      diagnostics.push(
        validationDiagnostic(
          contribution.identity.id,
          'invalid-perception-capability-concurrency',
          'artifactFacets.perceptionCapabilities.defaultConcurrency',
        ),
      );
    }
    if (facet.approvalRequired !== undefined && typeof facet.approvalRequired !== 'boolean') {
      diagnostics.push(
        validationDiagnostic(
          contribution.identity.id,
          'invalid-artifact-approval',
          'artifactFacets.perceptionCapabilities.approvalRequired',
        ),
      );
    }
  }
}

function isNonEmptyStringArray(value: readonly string[]): boolean {
  return value.length > 0 && value.every((item) => item.trim().length > 0);
}

function hasArtifactFacets(facets: AgentArtifactFacetsContribution | undefined): boolean {
  return (
    (facets?.protocols?.length ?? 0) > 0 ||
    (facets?.profiles?.length ?? 0) > 0 ||
    (facets?.renderers?.length ?? 0) > 0 ||
    (facets?.projectors?.length ?? 0) > 0 ||
    (facets?.capabilities?.length ?? 0) > 0 ||
    (facets?.lifecycleCapabilities?.length ?? 0) > 0 ||
    (facets?.entityProviders?.length ?? 0) > 0 ||
    (facets?.entityMemoryContributors?.length ?? 0) > 0 ||
    (facets?.mediaTextExtractors?.length ?? 0) > 0 ||
    (facets?.perceptionProviders?.length ?? 0) > 0 ||
    (facets?.perceptionCapabilities?.length ?? 0) > 0 ||
    (facets?.semanticIndexProviders?.length ?? 0) > 0 ||
    (facets?.reviewSurfaces?.length ?? 0) > 0 ||
    (facets?.representationResolvers?.length ?? 0) > 0
  );
}

function isArtifactCapabilityRisk(value: string): boolean {
  return ['low', 'medium', 'high', 'destructive'].includes(value);
}

function isPerceptionCapabilitySource(value: string): boolean {
  return ['builtin', 'local', 'engine', 'plugin', 'mcp', 'cloud'].includes(value);
}

function isPerceptionCapabilityExecutionMode(value: string): boolean {
  return ['sync-light', 'async-local', 'async-cloud'].includes(value);
}

function isPerceptionCapabilityDeviceTier(value: string): boolean {
  return ['light', 'medium', 'high'].includes(value);
}

function isPerceptionCapabilityCachePolicy(value: string): boolean {
  return ['required', 'recommended', 'none'].includes(value);
}

function isPerceptionCapabilityConfidenceKind(value: string): boolean {
  return ['provider-score', 'heuristic', 'none'].includes(value);
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
