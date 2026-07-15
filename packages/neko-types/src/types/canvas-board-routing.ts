import type { CanvasCreativeScopeKind } from './canvas-creative-scope';
import type { GeneratedAssetMediaKind } from './generated-asset';
import type { DocumentArchiveResourceRef } from './document-reading';
import type { ResourceRef } from './resource-cache';

export const CANVAS_BOARD_ROUTING_CONTRACT_VERSION = 1 as const;
export const CANVAS_BOARD_DIRECTORY = 'neko/boards' as const;

export type CanvasBoardResolutionSource = 'explicit' | 'conversation' | 'exact-index' | 'created';

export interface CanvasBoardDocumentRef {
  readonly kind: 'workspace-path';
  readonly path: string;
}

export interface CanvasBoardTargetIdentity {
  readonly documentRef: CanvasBoardDocumentRef;
  readonly documentId: string;
  readonly canvasId: string;
  readonly revision: string;
}

export interface CanvasBoardQueryFilter {
  readonly projectId?: string;
  readonly workId?: string;
  readonly scopeKind?: CanvasCreativeScopeKind;
  readonly episodeId?: string;
  readonly sequenceId?: string;
}

export interface CanvasBoardQuery {
  readonly version: typeof CANVAS_BOARD_ROUTING_CONTRACT_VERSION;
  readonly directory: typeof CANVAS_BOARD_DIRECTORY;
  readonly filter?: CanvasBoardQueryFilter;
}

export interface CanvasBoardQuerySummary extends CanvasBoardTargetIdentity {
  readonly title: string;
  readonly projectId?: string;
  readonly workId?: string;
  readonly scopeKind?: CanvasCreativeScopeKind;
  readonly episodeId?: string;
  readonly sequenceId?: string;
  readonly nodeTypeSummary?: Readonly<Record<string, number>>;
  readonly updatedAt?: string;
}

export interface CanvasBoardQueryResult {
  readonly version: typeof CANVAS_BOARD_ROUTING_CONTRACT_VERSION;
  readonly summaries: readonly CanvasBoardQuerySummary[];
  readonly diagnostics: readonly CanvasBoardRoutingDiagnostic[];
}

export interface CanvasBoardObservedTarget {
  readonly exists: boolean;
  readonly summary?: CanvasBoardQuerySummary;
}

export interface CanvasBoardBinding {
  readonly version: typeof CANVAS_BOARD_ROUTING_CONTRACT_VERSION;
  readonly scope: 'conversation' | 'task';
  readonly scopeId: string;
  readonly conversationId: string;
  readonly target: CanvasBoardTargetIdentity;
  readonly source: CanvasBoardResolutionSource;
  readonly boundAt: string;
}

export interface CanvasBoardResolutionInput {
  readonly version: typeof CANVAS_BOARD_ROUTING_CONTRACT_VERSION;
  readonly conversationId: string;
  readonly turnId?: string;
  readonly taskId?: string;
  readonly runId?: string;
  readonly explicitTarget?: CanvasBoardTargetIdentity;
  readonly binding?: CanvasBoardBinding;
  readonly query: CanvasBoardQuery;
  readonly suggestedTitle: string;
}

export interface ImmutableCanvasWriteTarget extends CanvasBoardTargetIdentity {
  readonly conversationId: string;
  readonly turnId?: string;
  readonly taskId?: string;
  readonly runId?: string;
  readonly resolutionSource: CanvasBoardResolutionSource;
  readonly frozenAt: string;
}

export type CanvasBoardRoutingDiagnosticCode =
  | 'invalid-contract-version'
  | 'invalid-board-directory'
  | 'unsafe-board-path'
  | 'board-outside-directory'
  | 'invalid-board-extension'
  | 'missing-identity'
  | 'cross-conversation-binding'
  | 'binding-scope-mismatch'
  | 'canvas-identity-mismatch'
  | 'stale-board-target'
  | 'deleted-board-target'
  | 'ambiguous-board-match'
  | 'unsupported-resolution-source'
  | 'unsupported-delivery-kind'
  | 'runtime-value-forbidden';

export interface CanvasBoardRoutingDiagnostic {
  readonly code: CanvasBoardRoutingDiagnosticCode;
  readonly severity: 'warning' | 'error';
  readonly message: string;
  readonly path?: readonly (string | number)[];
}

export interface CanvasBoardResolutionResult {
  readonly version: typeof CANVAS_BOARD_ROUTING_CONTRACT_VERSION;
  readonly status: 'resolved' | 'blocked';
  readonly source?: CanvasBoardResolutionSource;
  readonly target?: ImmutableCanvasWriteTarget;
  readonly suggestions?: readonly CanvasBoardQuerySummary[];
  readonly diagnostics: readonly CanvasBoardRoutingDiagnostic[];
}

export type CanvasBoardDeliveryKind = 'markdown' | 'file-reference' | GeneratedAssetMediaKind;

export interface CanvasBoardDeliveryProvenance {
  readonly version: typeof CANVAS_BOARD_ROUTING_CONTRACT_VERSION;
  readonly deliveryId: string;
  readonly artifactId: string;
  readonly kind: CanvasBoardDeliveryKind;
  readonly conversationId: string;
  readonly turnId?: string;
  readonly taskId?: string;
  readonly runId?: string;
  readonly sourceId: string;
  readonly createdAt: string;
}

export type CanvasBoardDeliveryArtifact =
  | {
      readonly kind: 'markdown';
      readonly title: string;
      readonly markdown: string;
    }
  | {
      readonly kind: 'file-reference' | 'file' | 'image' | 'audio' | 'video';
      readonly title: string;
      readonly mimeType?: string;
      readonly resourceRef?: ResourceRef;
      readonly documentResourceRef?: DocumentArchiveResourceRef;
    };

export interface CanvasBoardDeliveryRequest {
  readonly version: typeof CANVAS_BOARD_ROUTING_CONTRACT_VERSION;
  readonly target: ImmutableCanvasWriteTarget;
  readonly provenance: CanvasBoardDeliveryProvenance;
  readonly artifact: CanvasBoardDeliveryArtifact;
}

export interface CanvasBoardDeliveryResult {
  readonly version: typeof CANVAS_BOARD_ROUTING_CONTRACT_VERSION;
  readonly status: 'delivered' | 'noop' | 'blocked';
  readonly target: ImmutableCanvasWriteTarget;
  readonly revision?: string;
  readonly nodeIds?: readonly string[];
  readonly diagnostics: readonly CanvasBoardRoutingDiagnostic[];
}

const CANVAS_BOARD_RESOLUTION_SOURCES = new Set<CanvasBoardResolutionSource>([
  'explicit',
  'conversation',
  'exact-index',
  'created',
]);

const CANVAS_BOARD_DELIVERY_KINDS = new Set<CanvasBoardDeliveryKind>([
  'markdown',
  'file-reference',
  'image',
  'audio',
  'video',
  'storyboard',
  'file',
]);

const FORBIDDEN_ROUTING_KEYS = new Set([
  'activeCanvas',
  'assetLibraryId',
  'assetMembership',
  'assetRef',
  'basicProfile',
  'cachePath',
  'canvasData',
  'documentUri',
  'node',
  'nodes',
  'processHandle',
  'professionalCanvas',
  'profile',
  'rawCanvas',
  'renderUri',
  'recentCanvas',
  'sendToCanvas',
  'legacyStoryboardCompiler',
  'token',
]);

export function validateCanvasBoardDocumentRef(
  ref: CanvasBoardDocumentRef,
  pathPrefix: readonly (string | number)[] = ['documentRef'],
): readonly CanvasBoardRoutingDiagnostic[] {
  const normalized = normalizeWorkspacePath(ref.path);
  if (!normalized) {
    return [diagnostic('unsafe-board-path', 'Board path must be workspace-relative.', pathPrefix)];
  }
  if (!normalized.startsWith(`${CANVAS_BOARD_DIRECTORY}/`)) {
    return [
      diagnostic(
        'board-outside-directory',
        `Board path must be inside ${CANVAS_BOARD_DIRECTORY}/.`,
        pathPrefix,
      ),
    ];
  }
  if (!normalized.toLowerCase().endsWith('.nkc')) {
    return [
      diagnostic('invalid-board-extension', 'Board Canvas path must end with .nkc.', pathPrefix),
    ];
  }
  return [];
}

export function validateCanvasBoardTargetIdentity(
  target: CanvasBoardTargetIdentity,
  pathPrefix: readonly (string | number)[] = ['target'],
): readonly CanvasBoardRoutingDiagnostic[] {
  const diagnostics = [
    ...validateCanvasBoardDocumentRef(target.documentRef, [...pathPrefix, 'documentRef']),
  ];
  for (const key of ['documentId', 'canvasId', 'revision'] as const) {
    if (!isNonEmptyString(target[key])) {
      diagnostics.push(
        diagnostic('missing-identity', `Canvas Board ${key} is required.`, [...pathPrefix, key]),
      );
    }
  }
  return diagnostics;
}

export function validateCanvasBoardObservedTarget(
  expected: CanvasBoardTargetIdentity,
  observed: CanvasBoardObservedTarget,
): readonly CanvasBoardRoutingDiagnostic[] {
  if (!observed.exists || !observed.summary) {
    return [
      diagnostic('deleted-board-target', 'Canvas Board target no longer exists.', [
        'observed',
        'summary',
      ]),
    ];
  }
  const diagnostics = [
    ...validateCanvasBoardTargetIdentity(observed.summary, ['observed', 'summary']),
  ];
  if (
    observed.summary.documentId !== expected.documentId ||
    observed.summary.canvasId !== expected.canvasId ||
    observed.summary.documentRef.path !== expected.documentRef.path
  ) {
    diagnostics.push(
      diagnostic(
        'canvas-identity-mismatch',
        'Observed Canvas Board identity does not match the frozen target.',
        ['observed', 'summary'],
      ),
    );
  } else if (observed.summary.revision !== expected.revision) {
    diagnostics.push(
      diagnostic(
        'stale-board-target',
        'Observed Canvas Board revision does not match the frozen target.',
        ['observed', 'summary', 'revision'],
      ),
    );
  }
  diagnostics.push(...validateForbiddenRoutingValues(observed.summary));
  return diagnostics;
}

export function validateCanvasBoardResolutionInput(
  input: CanvasBoardResolutionInput,
): readonly CanvasBoardRoutingDiagnostic[] {
  const diagnostics = validateContractEnvelope(input);
  if (!isNonEmptyString(input.conversationId)) {
    diagnostics.push(
      diagnostic('missing-identity', 'conversationId is required.', ['conversationId']),
    );
  }
  if (!isNonEmptyString(input.suggestedTitle)) {
    diagnostics.push(
      diagnostic('missing-identity', 'suggestedTitle is required.', ['suggestedTitle']),
    );
  }
  if (input.query.directory !== CANVAS_BOARD_DIRECTORY) {
    diagnostics.push(
      diagnostic(
        'invalid-board-directory',
        `Board query directory must be ${CANVAS_BOARD_DIRECTORY}.`,
        ['query', 'directory'],
      ),
    );
  }
  if (input.explicitTarget) {
    diagnostics.push(
      ...validateCanvasBoardTargetIdentity(input.explicitTarget, ['explicitTarget']),
    );
  }
  if (input.binding) {
    diagnostics.push(...validateCanvasBoardBinding(input.binding, input));
  }
  diagnostics.push(...validateForbiddenRoutingValues(input));
  return diagnostics;
}

export function validateCanvasBoardBinding(
  binding: CanvasBoardBinding,
  input?: Pick<CanvasBoardResolutionInput, 'conversationId' | 'taskId'>,
): readonly CanvasBoardRoutingDiagnostic[] {
  const diagnostics = validateContractEnvelope(binding);
  diagnostics.push(...validateCanvasBoardTargetIdentity(binding.target, ['binding', 'target']));
  if (!CANVAS_BOARD_RESOLUTION_SOURCES.has(binding.source)) {
    diagnostics.push(
      diagnostic(
        'unsupported-resolution-source',
        'Canvas Board binding has an unsupported resolution source.',
        ['binding', 'source'],
      ),
    );
  }
  if (!isNonEmptyString(binding.scopeId) || !isNonEmptyString(binding.conversationId)) {
    diagnostics.push(
      diagnostic('missing-identity', 'Canvas Board binding identity is incomplete.', ['binding']),
    );
  }
  if (input && binding.conversationId !== input.conversationId) {
    diagnostics.push(
      diagnostic(
        'cross-conversation-binding',
        'Canvas Board binding belongs to another conversation.',
        ['binding', 'conversationId'],
      ),
    );
  }
  if (
    input &&
    ((binding.scope === 'conversation' && binding.scopeId !== input.conversationId) ||
      (binding.scope === 'task' && binding.scopeId !== input.taskId))
  ) {
    diagnostics.push(
      diagnostic(
        'binding-scope-mismatch',
        'Canvas Board binding scope does not match the current request.',
        ['binding', 'scopeId'],
      ),
    );
  }
  diagnostics.push(...validateForbiddenRoutingValues(binding));
  return diagnostics;
}

export function validateCanvasBoardResolutionResult(
  result: CanvasBoardResolutionResult,
): readonly CanvasBoardRoutingDiagnostic[] {
  const diagnostics = validateContractEnvelope(result);
  if (result.status === 'resolved') {
    if (!result.target || !result.source) {
      diagnostics.push(
        diagnostic(
          'missing-identity',
          'Resolved Canvas Board result requires source and immutable target.',
          ['target'],
        ),
      );
    } else {
      diagnostics.push(...validateCanvasBoardTargetIdentity(result.target));
      if (!CANVAS_BOARD_RESOLUTION_SOURCES.has(result.source)) {
        diagnostics.push(
          diagnostic(
            'unsupported-resolution-source',
            'Canvas Board result has an unsupported resolution source.',
            ['source'],
          ),
        );
      }
      if (result.target.resolutionSource !== result.source) {
        diagnostics.push(
          diagnostic(
            'canvas-identity-mismatch',
            'Canvas Board result source does not match its frozen target.',
            ['target', 'resolutionSource'],
          ),
        );
      }
    }
  } else if (result.target || result.source) {
    diagnostics.push(
      diagnostic(
        'canvas-identity-mismatch',
        'Blocked Canvas Board result must not expose a writable target.',
        ['target'],
      ),
    );
  }
  diagnostics.push(...validateForbiddenRoutingValues(result));
  return diagnostics;
}

export function validateCanvasBoardDeliveryProvenance(
  provenance: CanvasBoardDeliveryProvenance,
): readonly CanvasBoardRoutingDiagnostic[] {
  const diagnostics = validateContractEnvelope(provenance);
  for (const key of ['deliveryId', 'artifactId', 'conversationId', 'sourceId'] as const) {
    if (!isNonEmptyString(provenance[key])) {
      diagnostics.push(
        diagnostic('missing-identity', `Canvas delivery ${key} is required.`, [key]),
      );
    }
  }
  if (!CANVAS_BOARD_DELIVERY_KINDS.has(provenance.kind)) {
    diagnostics.push(
      diagnostic('unsupported-delivery-kind', 'Canvas Board delivery kind is unsupported.', [
        'kind',
      ]),
    );
  }
  diagnostics.push(...validateForbiddenRoutingValues(provenance));
  return diagnostics;
}

export function validateCanvasBoardDeliveryRequest(
  request: CanvasBoardDeliveryRequest,
): readonly CanvasBoardRoutingDiagnostic[] {
  const diagnostics = validateContractEnvelope(request);
  diagnostics.push(...validateCanvasBoardTargetIdentity(request.target));
  diagnostics.push(...validateCanvasBoardDeliveryProvenance(request.provenance));
  if (request.artifact.kind !== request.provenance.kind) {
    diagnostics.push(
      diagnostic(
        'unsupported-delivery-kind',
        'Canvas Board artifact kind must match delivery provenance.',
        ['artifact', 'kind'],
      ),
    );
  }
  if (request.artifact.kind === 'markdown') {
    if (!isNonEmptyString(request.artifact.title) || !isNonEmptyString(request.artifact.markdown)) {
      diagnostics.push(
        diagnostic(
          'missing-identity',
          'Markdown delivery requires a title and non-empty content.',
          ['artifact'],
        ),
      );
    }
  } else if (!request.artifact.resourceRef && !request.artifact.documentResourceRef) {
    diagnostics.push(
      diagnostic(
        'missing-identity',
        'File and media delivery requires a stable resource reference.',
        ['artifact'],
      ),
    );
  }
  diagnostics.push(...validateForbiddenRoutingValues(request));
  return diagnostics;
}

function validateContractEnvelope(value: {
  readonly version: typeof CANVAS_BOARD_ROUTING_CONTRACT_VERSION;
}): CanvasBoardRoutingDiagnostic[] {
  return value.version === CANVAS_BOARD_ROUTING_CONTRACT_VERSION
    ? []
    : [
        diagnostic(
          'invalid-contract-version',
          'Unsupported Canvas Board routing contract version.',
          ['version'],
        ),
      ];
}

function validateForbiddenRoutingValues(value: unknown): CanvasBoardRoutingDiagnostic[] {
  const diagnostics: CanvasBoardRoutingDiagnostic[] = [];
  visit(value, [], diagnostics);
  return diagnostics;
}

function visit(
  value: unknown,
  path: readonly (string | number)[],
  diagnostics: CanvasBoardRoutingDiagnostic[],
): void {
  if (typeof value === 'string') {
    if (isRuntimeOnlyString(value)) {
      diagnostics.push(
        diagnostic(
          'runtime-value-forbidden',
          'Canvas Board routing contracts must not contain runtime or cache identities.',
          path,
        ),
      );
    }
    return;
  }
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => visit(entry, [...path, index], diagnostics));
    return;
  }
  for (const [key, entry] of Object.entries(value)) {
    if (FORBIDDEN_ROUTING_KEYS.has(key)) {
      diagnostics.push(
        diagnostic(
          'runtime-value-forbidden',
          `Canvas Board routing contracts must not contain ${key}.`,
          [...path, key],
        ),
      );
      continue;
    }
    visit(entry, [...path, key], diagnostics);
  }
}

function normalizeWorkspacePath(value: string): string | undefined {
  const trimmed = value.trim().replace(/\\/g, '/').replace(/^\.\//, '');
  if (
    trimmed.length === 0 ||
    trimmed.startsWith('/') ||
    /^[A-Za-z]:\//.test(trimmed) ||
    /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ||
    trimmed.split('/').includes('..')
  ) {
    return undefined;
  }
  return trimmed;
}

function isRuntimeOnlyString(value: string): boolean {
  const normalized = value.trim().replace(/\\/g, '/');
  return (
    normalized.includes('/.neko/.cache/') ||
    normalized.startsWith('.neko/.cache/') ||
    /^(?:blob|data|vscode-webview|file):/i.test(normalized) ||
    /^https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?(?:\/|$)/i.test(normalized)
  );
}

function isNonEmptyString(value: string | undefined): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function diagnostic(
  code: CanvasBoardRoutingDiagnosticCode,
  message: string,
  path?: readonly (string | number)[],
): CanvasBoardRoutingDiagnostic {
  return {
    code,
    severity: 'error',
    message,
    ...(path ? { path } : {}),
  };
}
