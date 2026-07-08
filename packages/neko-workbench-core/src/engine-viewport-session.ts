import type {
  NekoWorkbenchHostCapability,
  NekoWorkbenchHostKind,
  WorkbenchContributionOwner,
  WorkbenchDiagnostic,
  WorkbenchViewportSessionContribution,
} from './types';

export type WorkbenchEngineViewportAvailability = 'unavailable' | 'ready';

export type WorkbenchEngineViewportOutputTargetKind =
  | 'engine-native-surface'
  | 'engine-stream'
  | 'headless-engine-session';

export type WorkbenchEngineViewportProjectionKind =
  | 'html-video'
  | 'canvas'
  | 'webcodecs'
  | 'electron-webcontents'
  | 'vscode-webview'
  | 'browser-webview';

export type WorkbenchEngineViewportProjectionLimit =
  | 'codec-limits'
  | 'color-management-limits'
  | 'texture-copy-limits'
  | 'webview-sandbox-limits'
  | 'non-authoritative-debug-preview';

export interface WorkbenchEngineViewportColorPipeline {
  readonly mode: 'engine-managed' | 'not-negotiated';
  readonly bitDepth: '8bit' | '10bit' | 'float16' | 'unknown';
  readonly hdr: 'supported' | 'planned' | 'unsupported' | 'unknown';
}

export interface WorkbenchEngineViewportTextureBoundary {
  readonly mode: 'engine-owned' | 'texture-lease-planned' | 'copy-projection';
  readonly status: 'available' | 'planned' | 'unavailable';
}

export interface WorkbenchEngineViewportOutputTarget {
  readonly kind: WorkbenchEngineViewportOutputTargetKind;
  readonly ownerRuntime: 'neko-engine';
  readonly authoritative: true;
  readonly colorPipeline: WorkbenchEngineViewportColorPipeline;
  readonly textureBoundary: WorkbenchEngineViewportTextureBoundary;
}

export interface WorkbenchEngineViewportControlSurface {
  readonly id: string;
  readonly hostKind: NekoWorkbenchHostKind;
  readonly role: 'control-ui' | 'overlay' | 'inspector';
  readonly canSendIntents: boolean;
  readonly authoritative: false;
}

export interface WorkbenchEngineViewportNonAuthoritativeProjection {
  readonly id: WorkbenchEngineViewportProjectionKind;
  readonly hostKind: NekoWorkbenchHostKind;
  readonly authoritative: false;
  readonly reasons: readonly WorkbenchEngineViewportProjectionLimit[];
}

export interface WorkbenchEngineViewportSessionContract {
  readonly id: string;
  readonly label: string;
  readonly owner: WorkbenchContributionOwner;
  readonly ownerRuntime: 'neko-engine';
  readonly availability: WorkbenchEngineViewportAvailability;
  readonly diagnostic?: string;
  readonly output: WorkbenchEngineViewportOutputTarget;
  readonly capabilities: readonly string[];
  readonly controlSurfaces: readonly WorkbenchEngineViewportControlSurface[];
  readonly nonAuthoritativeProjections: readonly WorkbenchEngineViewportNonAuthoritativeProjection[];
  readonly requiredHostCapabilities?: readonly NekoWorkbenchHostCapability[];
  readonly supportedHosts?: readonly NekoWorkbenchHostKind[];
}

export const WORKBENCH_ENGINE_VIEWPORT_OWNER: WorkbenchContributionOwner = {
  id: 'neko-engine',
  kind: 'core-package',
  displayName: 'Neko Engine',
  trust: 'core',
};

export class WorkbenchEngineViewportSessionContractError extends Error {
  readonly diagnostic: WorkbenchDiagnostic;

  constructor(diagnostic: WorkbenchDiagnostic) {
    super(diagnostic.message);
    this.name = 'WorkbenchEngineViewportSessionContractError';
    this.diagnostic = diagnostic;
  }
}

export function validateWorkbenchEngineViewportSessionContract(
  session: WorkbenchEngineViewportSessionContract,
): void {
  if (!isNonEmptyString(session.id)) {
    throw viewportSessionError('invalidEngineViewportSessionId', 'Viewport session id is required.', session);
  }
  if (!isNonEmptyString(session.label)) {
    throw viewportSessionError(
      'invalidEngineViewportSessionLabel',
      `Viewport session '${session.id}' must declare a label.`,
      session,
    );
  }
  if (session.ownerRuntime !== 'neko-engine' || session.owner.id !== 'neko-engine') {
    throw viewportSessionError(
      'invalidEngineViewportAuthority',
      `Viewport session '${session.id}' must be owned by neko-engine.`,
      session,
    );
  }
  if (session.output.ownerRuntime !== 'neko-engine' || session.output.authoritative !== true) {
    throw viewportSessionError(
      'invalidEngineViewportOutputAuthority',
      `Viewport session '${session.id}' output must be authoritative and owned by neko-engine.`,
      session,
    );
  }
  if (!isEngineOutputTargetKind(session.output.kind)) {
    throw viewportSessionError(
      'unsupportedEngineViewportOutputTarget',
      `Unsupported Engine viewport output target: ${String(session.output.kind)}`,
      session,
    );
  }
  if (session.capabilities.length === 0) {
    throw viewportSessionError(
      'missingEngineViewportCapabilities',
      `Viewport session '${session.id}' must declare capabilities.`,
      session,
    );
  }
  validateControlSurfaces(session);
  validateNonAuthoritativeProjections(session);
}

export function createWorkbenchViewportSessionContributionFromContract(
  session: WorkbenchEngineViewportSessionContract,
): WorkbenchViewportSessionContribution {
  validateWorkbenchEngineViewportSessionContract(session);
  return {
    id: session.id,
    kind: 'viewport-session',
    owner: session.owner,
    label: session.label,
    ownerRuntime: session.ownerRuntime,
    authoritative: true,
    capabilities: session.capabilities,
    nonAuthoritativeWebSurfaces: session.nonAuthoritativeProjections.map(
      (projection) => projection.id,
    ),
    ...(session.requiredHostCapabilities
      ? { requiredHostCapabilities: session.requiredHostCapabilities }
      : {}),
    ...(session.supportedHosts ? { supportedHosts: session.supportedHosts } : {}),
  };
}

function validateControlSurfaces(session: WorkbenchEngineViewportSessionContract): void {
  for (const control of session.controlSurfaces) {
    if (!isNonEmptyString(control.id)) {
      throw viewportSessionError(
        'invalidEngineViewportControlSurface',
        `Viewport session '${session.id}' has a control surface without an id.`,
        session,
      );
    }
    if (control.authoritative !== false) {
      throw viewportSessionError(
        'invalidEngineViewportControlAuthority',
        `Viewport control surface '${control.id}' must not be authoritative output.`,
        session,
      );
    }
  }
}

function validateNonAuthoritativeProjections(
  session: WorkbenchEngineViewportSessionContract,
): void {
  for (const projection of session.nonAuthoritativeProjections) {
    if (projection.authoritative !== false) {
      throw viewportSessionError(
        'invalidEngineViewportProjectionAuthority',
        `Viewport projection '${projection.id}' must be non-authoritative.`,
        session,
      );
    }
    if (projection.reasons.length === 0) {
      throw viewportSessionError(
        'missingEngineViewportProjectionReason',
        `Viewport projection '${projection.id}' must declare why it is non-authoritative.`,
        session,
      );
    }
  }
}

function viewportSessionError(
  code: string,
  message: string,
  session: WorkbenchEngineViewportSessionContract,
): WorkbenchEngineViewportSessionContractError {
  return new WorkbenchEngineViewportSessionContractError({
    code,
    severity: 'error',
    message,
    ownerId: session.owner?.id,
    contributionId: session.id,
    contributionKind: 'viewport-session',
  });
}

function isEngineOutputTargetKind(value: unknown): value is WorkbenchEngineViewportOutputTargetKind {
  return (
    value === 'engine-native-surface' ||
    value === 'engine-stream' ||
    value === 'headless-engine-session'
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
