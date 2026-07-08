import type {
  NekoWorkbenchHostCapability,
  NekoWorkbenchHostKind,
  WorkbenchContributionOwner,
  WorkbenchCustomEditorContribution,
  WorkbenchCustomEditorRuntime,
  WorkbenchDiagnostic,
  WorkbenchDocumentSelector,
} from './types';

export type WorkbenchFeatureWebviewAdapterSurface = 'custom-editor' | 'view' | 'webview';

export interface WorkbenchFeatureWebviewCustomEditorAdapter {
  readonly contributionId: string;
  readonly viewType: string;
  readonly selectors: readonly WorkbenchDocumentSelector[];
  readonly runtime: WorkbenchCustomEditorRuntime;
  readonly priority?: 'default' | 'option' | 'builtin';
}

export interface WorkbenchFeatureWebviewThemeRequirements {
  readonly usesWorkbenchTheme: true;
  readonly tokenScope?: string;
}

export interface WorkbenchFeatureWebviewI18nRequirements {
  readonly namespace: string;
  readonly supportedLocales?: readonly string[];
}

export interface WorkbenchFeatureWebviewHostAdapterDescriptor {
  readonly id: string;
  readonly owner: WorkbenchContributionOwner;
  readonly label?: string;
  readonly i18nKey?: string;
  readonly surface: WorkbenchFeatureWebviewAdapterSurface;
  readonly runtimeEntryId: string;
  readonly supportedHosts?: readonly NekoWorkbenchHostKind[];
  readonly requiredHostCapabilities?: readonly NekoWorkbenchHostCapability[];
  readonly customEditor?: WorkbenchFeatureWebviewCustomEditorAdapter;
  readonly theme?: WorkbenchFeatureWebviewThemeRequirements;
  readonly i18n?: WorkbenchFeatureWebviewI18nRequirements;
}

export interface WorkbenchFeatureWebviewAdapterSnapshot {
  readonly adapters: readonly WorkbenchFeatureWebviewHostAdapterDescriptor[];
  readonly diagnostics: readonly WorkbenchDiagnostic[];
}

export interface WorkbenchFeatureWebviewAdapterRegistryOptions {
  readonly hostKind?: NekoWorkbenchHostKind;
  readonly hostCapabilities?: readonly NekoWorkbenchHostCapability[];
}

export interface WorkbenchFeatureWebviewAdapterRegistry {
  register(descriptor: WorkbenchFeatureWebviewHostAdapterDescriptor): void;
  registerMany(descriptors: readonly WorkbenchFeatureWebviewHostAdapterDescriptor[]): void;
  getById(id: string): WorkbenchFeatureWebviewHostAdapterDescriptor | undefined;
  getAll(): readonly WorkbenchFeatureWebviewHostAdapterDescriptor[];
  toCustomEditorContribution(adapterId: string): WorkbenchCustomEditorContribution;
  snapshot(): WorkbenchFeatureWebviewAdapterSnapshot;
}

export class WorkbenchFeatureWebviewAdapterRegistrationError extends Error {
  readonly diagnostic: WorkbenchDiagnostic;

  constructor(diagnostic: WorkbenchDiagnostic) {
    super(diagnostic.message);
    this.name = 'WorkbenchFeatureWebviewAdapterRegistrationError';
    this.diagnostic = diagnostic;
  }
}

export function createWorkbenchFeatureWebviewAdapterRegistry(
  options: WorkbenchFeatureWebviewAdapterRegistryOptions = {},
): WorkbenchFeatureWebviewAdapterRegistry {
  return new DefaultWorkbenchFeatureWebviewAdapterRegistry(options);
}

class DefaultWorkbenchFeatureWebviewAdapterRegistry
  implements WorkbenchFeatureWebviewAdapterRegistry
{
  private readonly descriptors = new Map<string, WorkbenchFeatureWebviewHostAdapterDescriptor>();
  private readonly diagnostics: WorkbenchDiagnostic[] = [];
  private readonly hostKind: NekoWorkbenchHostKind | undefined;
  private readonly hostCapabilities: ReadonlySet<NekoWorkbenchHostCapability>;

  constructor(options: WorkbenchFeatureWebviewAdapterRegistryOptions) {
    this.hostKind = options.hostKind;
    this.hostCapabilities = new Set(options.hostCapabilities ?? []);
  }

  register(descriptor: WorkbenchFeatureWebviewHostAdapterDescriptor): void {
    validateFeatureWebviewAdapterDescriptor(
      descriptor,
      this.hostKind,
      this.hostCapabilities,
    );
    const previous = this.descriptors.get(descriptor.id);
    if (previous) {
      throw featureAdapterError({
        code: 'duplicateFeatureWebviewAdapterId',
        message: `Duplicate feature Webview adapter id '${descriptor.id}'.`,
        descriptor,
        metadata: {
          firstOwnerId: previous.owner.id,
          secondOwnerId: descriptor.owner.id,
        },
      });
    }
    this.descriptors.set(descriptor.id, descriptor);
  }

  registerMany(descriptors: readonly WorkbenchFeatureWebviewHostAdapterDescriptor[]): void {
    for (const descriptor of descriptors) {
      this.register(descriptor);
    }
  }

  getById(id: string): WorkbenchFeatureWebviewHostAdapterDescriptor | undefined {
    return this.descriptors.get(id);
  }

  getAll(): readonly WorkbenchFeatureWebviewHostAdapterDescriptor[] {
    return [...this.descriptors.values()];
  }

  toCustomEditorContribution(adapterId: string): WorkbenchCustomEditorContribution {
    const descriptor = this.requireById(adapterId);
    if (descriptor.surface !== 'custom-editor' || !descriptor.customEditor) {
      throw featureAdapterError({
        code: 'invalidFeatureWebviewAdapterSurface',
        message: `Feature Webview adapter '${adapterId}' is not a custom editor adapter.`,
        descriptor,
      });
    }
    return {
      id: descriptor.customEditor.contributionId,
      kind: 'custom-editor',
      owner: descriptor.owner,
      ...(descriptor.label ? { label: descriptor.label } : {}),
      ...(descriptor.i18nKey ? { i18nKey: descriptor.i18nKey } : {}),
      viewType: descriptor.customEditor.viewType,
      selectors: descriptor.customEditor.selectors,
      runtime: descriptor.customEditor.runtime,
      ...(descriptor.customEditor.priority ? { priority: descriptor.customEditor.priority } : {}),
      ...(descriptor.supportedHosts ? { supportedHosts: descriptor.supportedHosts } : {}),
      ...(descriptor.requiredHostCapabilities
        ? { requiredHostCapabilities: descriptor.requiredHostCapabilities }
        : {}),
    };
  }

  snapshot(): WorkbenchFeatureWebviewAdapterSnapshot {
    return {
      adapters: this.getAll(),
      diagnostics: this.diagnostics,
    };
  }

  private requireById(id: string): WorkbenchFeatureWebviewHostAdapterDescriptor {
    const descriptor = this.descriptors.get(id);
    if (!descriptor) {
      throw new WorkbenchFeatureWebviewAdapterRegistrationError({
        code: 'unknownFeatureWebviewAdapter',
        severity: 'error',
        message: `Unknown feature Webview adapter id '${id}'.`,
        contributionId: id,
        contributionKind: 'custom-editor',
      });
    }
    return descriptor;
  }
}

function validateFeatureWebviewAdapterDescriptor(
  descriptor: WorkbenchFeatureWebviewHostAdapterDescriptor,
  hostKind: NekoWorkbenchHostKind | undefined,
  hostCapabilities: ReadonlySet<NekoWorkbenchHostCapability>,
): void {
  if (!isNonEmptyString(descriptor.id)) {
    throw featureAdapterError({
      code: 'invalidFeatureWebviewAdapterId',
      message: 'Feature Webview adapter id is required.',
      descriptor,
    });
  }
  if (!isNonEmptyString(descriptor.owner?.id)) {
    throw featureAdapterError({
      code: 'invalidFeatureWebviewAdapterOwner',
      message: `Feature Webview adapter '${descriptor.id}' must declare an owner id.`,
      descriptor,
    });
  }
  if (!isFeatureWebviewAdapterSurface(descriptor.surface)) {
    throw featureAdapterError({
      code: 'unsupportedFeatureWebviewAdapterSurface',
      message: `Unsupported feature Webview adapter surface: ${String(descriptor.surface)}`,
      descriptor,
    });
  }
  if (!isNonEmptyString(descriptor.runtimeEntryId)) {
    throw featureAdapterError({
      code: 'missingFeatureWebviewRuntimeEntry',
      message: `Feature Webview adapter '${descriptor.id}' must declare a runtime entry id.`,
      descriptor,
    });
  }
  const unsafeRuntimeReason = readUnsafeRuntimeEntryReason(descriptor.runtimeEntryId);
  if (unsafeRuntimeReason) {
    throw featureAdapterError({
      code: 'unsafeFeatureWebviewRuntimeEntry',
      message: `Feature Webview adapter '${descriptor.id}' runtime entry must be portable; ${unsafeRuntimeReason}: ${descriptor.runtimeEntryId}`,
      descriptor,
    });
  }
  validateSupportedHost(descriptor, hostKind);
  validateRequiredHostCapabilities(descriptor, hostCapabilities);
  validateSurfaceSpecificFields(descriptor);
}

function validateSupportedHost(
  descriptor: WorkbenchFeatureWebviewHostAdapterDescriptor,
  hostKind: NekoWorkbenchHostKind | undefined,
): void {
  if (!hostKind || !descriptor.supportedHosts) {
    return;
  }
  if (descriptor.supportedHosts.includes(hostKind)) {
    return;
  }
  throw featureAdapterError({
    code: 'unsupportedFeatureWebviewAdapterHost',
    message: `Feature Webview adapter '${descriptor.id}' does not support host '${hostKind}'.`,
    descriptor,
    metadata: { hostKind, supportedHosts: descriptor.supportedHosts },
  });
}

function validateRequiredHostCapabilities(
  descriptor: WorkbenchFeatureWebviewHostAdapterDescriptor,
  hostCapabilities: ReadonlySet<NekoWorkbenchHostCapability>,
): void {
  if (hostCapabilities.size === 0) {
    return;
  }
  const missing = (descriptor.requiredHostCapabilities ?? []).filter(
    (capability) => !hostCapabilities.has(capability),
  );
  if (missing.length === 0) {
    return;
  }
  throw featureAdapterError({
    code: 'missingFeatureWebviewHostCapability',
    message: `Feature Webview adapter '${descriptor.id}' requires unsupported host capabilities: ${missing.join(', ')}.`,
    descriptor,
    metadata: { missing },
  });
}

function validateSurfaceSpecificFields(
  descriptor: WorkbenchFeatureWebviewHostAdapterDescriptor,
): void {
  if (descriptor.surface !== 'custom-editor') {
    return;
  }
  const customEditor = descriptor.customEditor;
  if (!customEditor) {
    throw featureAdapterError({
      code: 'missingFeatureWebviewCustomEditor',
      message: `Feature Webview adapter '${descriptor.id}' must declare custom editor metadata.`,
      descriptor,
    });
  }
  if (!isNonEmptyString(customEditor.contributionId)) {
    throw featureAdapterError({
      code: 'missingFeatureWebviewCustomEditorContribution',
      message: `Feature Webview adapter '${descriptor.id}' must declare a custom editor contribution id.`,
      descriptor,
    });
  }
  if (!isNonEmptyString(customEditor.viewType)) {
    throw featureAdapterError({
      code: 'missingFeatureWebviewCustomEditorViewType',
      message: `Feature Webview adapter '${descriptor.id}' must declare a custom editor view type.`,
      descriptor,
    });
  }
  if (customEditor.selectors.length === 0) {
    throw featureAdapterError({
      code: 'missingFeatureWebviewCustomEditorSelectors',
      message: `Feature Webview adapter '${descriptor.id}' must declare custom editor selectors.`,
      descriptor,
    });
  }
}

function featureAdapterError({
  code,
  descriptor,
  message,
  metadata,
}: {
  readonly code: string;
  readonly descriptor: WorkbenchFeatureWebviewHostAdapterDescriptor;
  readonly message: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}): WorkbenchFeatureWebviewAdapterRegistrationError {
  return new WorkbenchFeatureWebviewAdapterRegistrationError({
    code,
    severity: 'error',
    message,
    ownerId: descriptor.owner?.id,
    contributionId: descriptor.id,
    contributionKind: 'custom-editor',
    ...(metadata ? { metadata } : {}),
  });
}

function isFeatureWebviewAdapterSurface(
  value: unknown,
): value is WorkbenchFeatureWebviewAdapterSurface {
  return value === 'custom-editor' || value === 'view' || value === 'webview';
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function readUnsafeRuntimeEntryReason(value: string): string | undefined {
  if (value.startsWith('vscode-webview:') || value.startsWith('webview:')) {
    return 'Webview URIs are runtime projections';
  }
  if (value.startsWith('blob:')) return 'blob URLs are runtime projections';
  if (value.startsWith('engine-token:')) return 'Engine tokens are runtime handles';
  if (value.startsWith('/')) return 'absolute paths are not portable runtime entries';
  if (/^[A-Za-z]:[\\/]/.test(value)) return 'absolute paths are not portable runtime entries';
  return undefined;
}
