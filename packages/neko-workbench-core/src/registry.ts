import type {
  NekoWorkbenchContributionKind,
  NekoWorkbenchHostCapability,
  WorkbenchContributionDescriptor,
  WorkbenchContributionSnapshot,
  WorkbenchDiagnostic,
  WorkbenchResourceNodeProjection,
  WorkbenchStableResourceRef,
} from './types';

export const WORKBENCH_CONTRIBUTION_KINDS: readonly NekoWorkbenchContributionKind[] = [
  'command',
  'menu',
  'keybinding',
  'view-container',
  'view',
  'custom-editor',
  'webview',
  'resource-source',
  'agent-surface',
  'viewport-session',
  'theme',
  'icon',
  'skill',
  'agent-tool',
] as const;

export interface WorkbenchContributionRegistryOptions {
  readonly hostCapabilities?: readonly NekoWorkbenchHostCapability[];
}

export interface WorkbenchContributionRegistry {
  register(contribution: WorkbenchContributionDescriptor): void;
  registerMany(contributions: readonly WorkbenchContributionDescriptor[]): void;
  getByKind(
    kind: NekoWorkbenchContributionKind,
  ): readonly WorkbenchContributionDescriptor[];
  snapshot(): WorkbenchContributionSnapshot;
}

export class WorkbenchContributionRegistrationError extends Error {
  readonly diagnostic: WorkbenchDiagnostic;

  constructor(diagnostic: WorkbenchDiagnostic) {
    super(diagnostic.message);
    this.name = 'WorkbenchContributionRegistrationError';
    this.diagnostic = diagnostic;
  }
}

export function createWorkbenchContributionRegistry(
  options: WorkbenchContributionRegistryOptions = {},
): WorkbenchContributionRegistry {
  return new DefaultWorkbenchContributionRegistry(options);
}

export function isWorkbenchContributionKind(
  value: unknown,
): value is NekoWorkbenchContributionKind {
  return (
    typeof value === 'string' &&
    WORKBENCH_CONTRIBUTION_KINDS.includes(value as NekoWorkbenchContributionKind)
  );
}

export function assertPortableResourceRef(ref: WorkbenchStableResourceRef): void {
  const unsafeReason = readUnsafeResourceIdentityReason(ref.id);
  if (unsafeReason) {
    throw new WorkbenchContributionRegistrationError({
      code: 'unsafeResourceIdentity',
      severity: 'error',
      message: `Resource identity must be portable; ${unsafeReason}: ${ref.id}`,
      metadata: { ref },
    });
  }
}

export function assertPortableResourceNode(node: WorkbenchResourceNodeProjection): void {
  assertPortableResourceRef(node.stableRef);
}

class DefaultWorkbenchContributionRegistry implements WorkbenchContributionRegistry {
  private readonly contributions = new Map<string, WorkbenchContributionDescriptor>();
  private readonly hostCapabilities: ReadonlySet<NekoWorkbenchHostCapability>;

  constructor(options: WorkbenchContributionRegistryOptions) {
    this.hostCapabilities = new Set(options.hostCapabilities ?? []);
  }

  register(contribution: WorkbenchContributionDescriptor): void {
    validateContribution(contribution, this.hostCapabilities);
    const key = createContributionKey(contribution);
    const previous = this.contributions.get(key);
    if (previous) {
      throw new WorkbenchContributionRegistrationError({
        code: 'duplicateContributionId',
        severity: 'error',
        message: `Duplicate workbench contribution id '${contribution.id}' for kind '${contribution.kind}'.`,
        ownerId: contribution.owner.id,
        contributionId: contribution.id,
        contributionKind: contribution.kind,
        metadata: {
          firstOwnerId: previous.owner.id,
          secondOwnerId: contribution.owner.id,
        },
      });
    }
    this.contributions.set(key, contribution);
  }

  registerMany(contributions: readonly WorkbenchContributionDescriptor[]): void {
    for (const contribution of contributions) {
      this.register(contribution);
    }
  }

  getByKind(
    kind: NekoWorkbenchContributionKind,
  ): readonly WorkbenchContributionDescriptor[] {
    return [...this.contributions.values()].filter((contribution) => contribution.kind === kind);
  }

  snapshot(): WorkbenchContributionSnapshot {
    const contributions = [...this.contributions.values()];
    return {
      contributions,
      diagnostics: [],
      temporaryBootstrapContributionIds: contributions
        .filter(
          (contribution) =>
            contribution.kind === 'resource-source' &&
            contribution.providerKind === 'bootstrap-temporary',
        )
        .map((contribution) => contribution.id),
    };
  }
}

function validateContribution(
  contribution: WorkbenchContributionDescriptor,
  hostCapabilities: ReadonlySet<NekoWorkbenchHostCapability>,
): void {
  if (!isNonEmptyString(contribution.id)) {
    throw new WorkbenchContributionRegistrationError({
      code: 'invalidContributionId',
      severity: 'error',
      message: 'Workbench contribution id is required.',
      ownerId: contribution.owner.id,
      contributionKind: contribution.kind,
    });
  }
  if (!isWorkbenchContributionKind(contribution.kind)) {
    throw new WorkbenchContributionRegistrationError({
      code: 'unsupportedContributionKind',
      severity: 'error',
      message: `Unsupported workbench contribution kind: ${String(contribution.kind)}`,
      ownerId: contribution.owner.id,
      contributionId: contribution.id,
      contributionKind: String(contribution.kind),
    });
  }
  if (!isNonEmptyString(contribution.owner.id)) {
    throw new WorkbenchContributionRegistrationError({
      code: 'invalidContributionOwner',
      severity: 'error',
      message: `Workbench contribution '${contribution.id}' must declare an owner id.`,
      contributionId: contribution.id,
      contributionKind: contribution.kind,
    });
  }
  validateRequiredHostCapabilities(contribution, hostCapabilities);
  validateContributionSpecificFields(contribution);
}

function validateRequiredHostCapabilities(
  contribution: WorkbenchContributionDescriptor,
  hostCapabilities: ReadonlySet<NekoWorkbenchHostCapability>,
): void {
  if (hostCapabilities.size === 0) {
    return;
  }
  const missing = (contribution.requiredHostCapabilities ?? []).filter(
    (capability) => !hostCapabilities.has(capability),
  );
  if (missing.length === 0) {
    return;
  }
  throw new WorkbenchContributionRegistrationError({
    code: 'missingHostCapability',
    severity: 'error',
    message: `Workbench contribution '${contribution.id}' requires unsupported host capabilities: ${missing.join(', ')}.`,
    ownerId: contribution.owner.id,
    contributionId: contribution.id,
    contributionKind: contribution.kind,
    metadata: { missing },
  });
}

function validateContributionSpecificFields(contribution: WorkbenchContributionDescriptor): void {
  switch (contribution.kind) {
    case 'menu':
      requireNonEmpty(contribution.menuId, contribution, 'menuId');
      requireNonEmpty(contribution.commandId, contribution, 'commandId');
      return;
    case 'keybinding':
      requireNonEmpty(contribution.commandId, contribution, 'commandId');
      requireNonEmpty(contribution.key, contribution, 'key');
      return;
    case 'view-container':
      requireNonEmpty(contribution.location, contribution, 'location');
      return;
    case 'view':
      requireNonEmpty(contribution.containerId, contribution, 'containerId');
      return;
    case 'custom-editor':
      requireNonEmpty(contribution.viewType, contribution, 'viewType');
      if (contribution.selectors.length === 0) {
        throw missingFieldError(contribution, 'selectors');
      }
      return;
    case 'webview':
      requireNonEmpty(contribution.surface, contribution, 'surface');
      return;
    case 'resource-source':
      requireNonEmpty(contribution.sourceId, contribution, 'sourceId');
      requireNonEmpty(contribution.surfaceId, contribution, 'surfaceId');
      return;
    case 'agent-surface':
      requireNonEmpty(contribution.placement, contribution, 'placement');
      return;
    case 'viewport-session':
      if (contribution.ownerRuntime !== 'neko-engine' || contribution.authoritative !== true) {
        throw new WorkbenchContributionRegistrationError({
          code: 'invalidViewportAuthority',
          severity: 'error',
          message: `Viewport contribution '${contribution.id}' must declare neko-engine as the authoritative owner.`,
          ownerId: contribution.owner.id,
          contributionId: contribution.id,
          contributionKind: contribution.kind,
        });
      }
      return;
    case 'theme':
      requireNonEmpty(contribution.themeId, contribution, 'themeId');
      return;
    case 'icon':
      requireNonEmpty(contribution.iconId, contribution, 'iconId');
      return;
    case 'skill':
      requireNonEmpty(contribution.skillId, contribution, 'skillId');
      return;
    case 'agent-tool':
      requireNonEmpty(contribution.toolId, contribution, 'toolId');
      return;
    case 'command':
      return;
  }
}

function requireNonEmpty(
  value: string,
  contribution: WorkbenchContributionDescriptor,
  field: string,
): void {
  if (!isNonEmptyString(value)) {
    throw missingFieldError(contribution, field);
  }
}

function missingFieldError(
  contribution: WorkbenchContributionDescriptor,
  field: string,
): WorkbenchContributionRegistrationError {
  return new WorkbenchContributionRegistrationError({
    code: 'missingContributionField',
    severity: 'error',
    message: `Workbench contribution '${contribution.id}' must declare '${field}'.`,
    ownerId: contribution.owner.id,
    contributionId: contribution.id,
    contributionKind: contribution.kind,
    metadata: { field },
  });
}

function createContributionKey(contribution: WorkbenchContributionDescriptor): string {
  return `${contribution.kind}:${contribution.id}`;
}

function isNonEmptyString(value: string): boolean {
  return value.trim().length > 0;
}

function readUnsafeResourceIdentityReason(value: string): string | undefined {
  if (value.includes('.neko/.cache')) return 'cache paths are derived state';
  if (
    value.startsWith('vscode-webview:') ||
    value.startsWith('webview:') ||
    value.startsWith('neko-resource:')
  ) {
    return 'Webview URIs are runtime projections';
  }
  if (value.startsWith('blob:')) return 'blob URLs are runtime projections';
  if (value.startsWith('engine-token:')) return 'Engine tokens are runtime handles';
  if (value.startsWith('/')) return 'absolute paths are not portable identity';
  if (/^[A-Za-z]:[\\/]/.test(value)) return 'absolute paths are not portable identity';
  return undefined;
}
