import type { ImmutableCanvasWriteTarget } from './canvas-board-routing';
import { validateCanvasBoardTargetIdentity } from './canvas-board-routing';
import type { GeneratedAssetMediaKind } from './generated-asset';
import { isResourceRef, type ResourceRef } from './resource-cache';

export const CANVAS_GENERATED_DRAFT_GROUP_CONTRACT_VERSION = 1 as const;
export const CANVAS_GENERATED_DRAFT_GROUP_ID_PREFIX = 'runtime:canvas-generated-group:' as const;
export const CANVAS_GENERATED_DRAFT_CANDIDATE_ID_PREFIX =
  'runtime:canvas-generated-candidate:' as const;

export type CanvasGeneratedDraftMediaKind = Extract<
  GeneratedAssetMediaKind,
  'image' | 'audio' | 'video'
>;

export type CanvasGeneratedDraftCandidateState =
  'unsaved' | 'promoting' | 'saved-to-assets' | 'added-to-board' | 'unavailable' | 'failed';

export interface CanvasGeneratedDraftCandidateProjection {
  readonly candidateId: string;
  readonly title: string;
  readonly mediaKind: CanvasGeneratedDraftMediaKind;
  readonly mimeType: string;
  readonly revision: string;
  readonly contentDigest: string;
  readonly resourceRef: ResourceRef;
  readonly state: CanvasGeneratedDraftCandidateState;
  readonly position: { readonly x: number; readonly y: number };
  readonly size: { readonly width: number; readonly height: number };
  readonly renderUri?: string;
  readonly diagnostic?: string;
  readonly promotedAsset?: CanvasPromotedAssetIdentity;
}

export interface CanvasGeneratedDraftGroupProjection {
  readonly version: typeof CANVAS_GENERATED_DRAFT_GROUP_CONTRACT_VERSION;
  readonly projectionId: string;
  readonly taskId: string;
  readonly runId?: string;
  readonly title: string;
  readonly target: ImmutableCanvasWriteTarget;
  readonly position: { readonly x: number; readonly y: number };
  readonly size: { readonly width: number; readonly height: number };
  readonly collapsed: boolean;
  readonly pinned: boolean;
  readonly candidates: readonly CanvasGeneratedDraftCandidateProjection[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CanvasGeneratedDraftSelection {
  readonly candidateId: string;
  readonly revision: string;
  readonly contentDigest: string;
}

export interface CanvasGeneratedDraftPromotionRequest {
  readonly version: typeof CANVAS_GENERATED_DRAFT_GROUP_CONTRACT_VERSION;
  readonly requestId: string;
  readonly projectionId: string;
  readonly target: ImmutableCanvasWriteTarget;
  readonly selections: readonly CanvasGeneratedDraftSelection[];
  readonly requestedAt: string;
}

export interface CanvasPromotedAssetIdentity {
  readonly entityId: string;
  readonly variantId: string;
  readonly fileId: string;
  readonly path: string;
  readonly mediaType: CanvasGeneratedDraftMediaKind;
  readonly resourceRef?: ResourceRef;
}

export type CanvasGeneratedDraftPromotionItemResult =
  | {
      readonly candidateId: string;
      readonly status: 'saved';
      readonly asset: CanvasPromotedAssetIdentity;
    }
  | {
      readonly candidateId: string;
      readonly status: 'failed';
      readonly diagnostic: CanvasGeneratedDraftGroupDiagnostic;
    };

export interface CanvasGeneratedDraftPromotionResult {
  readonly version: typeof CANVAS_GENERATED_DRAFT_GROUP_CONTRACT_VERSION;
  readonly requestId: string;
  readonly projectionId: string;
  readonly status: 'saved' | 'partial' | 'failed';
  readonly items: readonly CanvasGeneratedDraftPromotionItemResult[];
}

export interface CanvasGeneratedDraftApplyResult {
  readonly version: typeof CANVAS_GENERATED_DRAFT_GROUP_CONTRACT_VERSION;
  readonly requestId: string;
  readonly projectionId: string;
  readonly status: 'applied' | 'conflict' | 'blocked';
  readonly target: ImmutableCanvasWriteTarget;
  readonly revision?: string;
  readonly groupId?: string;
  readonly nodeIds?: readonly string[];
  readonly diagnostics: readonly CanvasGeneratedDraftGroupDiagnostic[];
}

export type CanvasGeneratedDraftGroupDiagnosticCode =
  | 'invalid-contract-version'
  | 'missing-identity'
  | 'invalid-target'
  | 'invalid-resource-ref'
  | 'invalid-candidate-state'
  | 'invalid-candidate-kind'
  | 'duplicate-candidate'
  | 'invalid-selection'
  | 'invalid-asset-identity'
  | 'invalid-diagnostic'
  | 'invalid-result-status'
  | 'source-unavailable'
  | 'content-changed'
  | 'asset-storage-failed'
  | 'runtime-value-forbidden';

export interface CanvasGeneratedDraftGroupDiagnostic {
  readonly code: CanvasGeneratedDraftGroupDiagnosticCode;
  readonly severity: 'error';
  readonly message: string;
  readonly path?: readonly (string | number)[];
}

const CANDIDATE_STATES: ReadonlySet<string> = new Set<CanvasGeneratedDraftCandidateState>([
  'unsaved',
  'promoting',
  'saved-to-assets',
  'added-to-board',
  'unavailable',
  'failed',
]);

const MEDIA_KINDS: ReadonlySet<string> = new Set<CanvasGeneratedDraftMediaKind>([
  'image',
  'audio',
  'video',
]);

const DIAGNOSTIC_CODES: ReadonlySet<string> = new Set<CanvasGeneratedDraftGroupDiagnosticCode>([
  'invalid-contract-version',
  'missing-identity',
  'invalid-target',
  'invalid-resource-ref',
  'invalid-candidate-state',
  'invalid-candidate-kind',
  'duplicate-candidate',
  'invalid-selection',
  'invalid-asset-identity',
  'invalid-diagnostic',
  'invalid-result-status',
  'source-unavailable',
  'content-changed',
  'asset-storage-failed',
  'runtime-value-forbidden',
]);

export function validateCanvasGeneratedDraftGroupProjection(
  value: unknown,
): readonly CanvasGeneratedDraftGroupDiagnostic[] {
  const diagnostics: CanvasGeneratedDraftGroupDiagnostic[] = [];
  const record = requireRecord(value, diagnostics);
  if (!record) return diagnostics;
  validateVersion(record, diagnostics);
  requireRuntimeId(
    record['projectionId'],
    CANVAS_GENERATED_DRAFT_GROUP_ID_PREFIX,
    ['projectionId'],
    diagnostics,
  );
  requireString(record['taskId'], ['taskId'], diagnostics);
  optionalString(record['runId'], ['runId'], diagnostics);
  requireString(record['title'], ['title'], diagnostics);
  validateTarget(record['target'], diagnostics);
  validatePoint(record['position'], ['position'], diagnostics);
  validateSize(record['size'], ['size'], diagnostics);
  requireBoolean(record['collapsed'], ['collapsed'], diagnostics);
  requireBoolean(record['pinned'], ['pinned'], diagnostics);
  requireString(record['createdAt'], ['createdAt'], diagnostics);
  requireString(record['updatedAt'], ['updatedAt'], diagnostics);

  if (!Array.isArray(record['candidates']) || record['candidates'].length === 0) {
    diagnostics.push(
      error('missing-identity', 'Runtime Group requires at least one candidate.', ['candidates']),
    );
    return diagnostics;
  }
  const candidateIds = new Set<string>();
  record['candidates'].forEach((candidate, index) => {
    const candidateRecord = requireRecord(candidate, diagnostics, ['candidates', index]);
    if (!candidateRecord) return;
    const id = requireRuntimeId(
      candidateRecord['candidateId'],
      CANVAS_GENERATED_DRAFT_CANDIDATE_ID_PREFIX,
      ['candidates', index, 'candidateId'],
      diagnostics,
    );
    if (id) {
      if (candidateIds.has(id)) {
        diagnostics.push(
          error('duplicate-candidate', 'Runtime Group candidate ids must be unique.', [
            'candidates',
            index,
            'candidateId',
          ]),
        );
      }
      candidateIds.add(id);
    }
    validateCandidate(candidateRecord, index, diagnostics);
  });
  return diagnostics;
}

export function validateCanvasGeneratedDraftPromotionRequest(
  value: unknown,
): readonly CanvasGeneratedDraftGroupDiagnostic[] {
  const diagnostics: CanvasGeneratedDraftGroupDiagnostic[] = [];
  const record = requireRecord(value, diagnostics);
  if (!record) return diagnostics;
  validateVersion(record, diagnostics);
  requireString(record['requestId'], ['requestId'], diagnostics);
  requireRuntimeId(
    record['projectionId'],
    CANVAS_GENERATED_DRAFT_GROUP_ID_PREFIX,
    ['projectionId'],
    diagnostics,
  );
  validateTarget(record['target'], diagnostics);
  requireString(record['requestedAt'], ['requestedAt'], diagnostics);
  if (!Array.isArray(record['selections']) || record['selections'].length === 0) {
    diagnostics.push(
      error('invalid-selection', 'Save to Assets requires at least one candidate selection.', [
        'selections',
      ]),
    );
    return diagnostics;
  }
  const candidateIds = new Set<string>();
  record['selections'].forEach((selection, index) => {
    const selectionRecord = requireRecord(selection, diagnostics, ['selections', index]);
    if (!selectionRecord) return;
    const id = requireRuntimeId(
      selectionRecord['candidateId'],
      CANVAS_GENERATED_DRAFT_CANDIDATE_ID_PREFIX,
      ['selections', index, 'candidateId'],
      diagnostics,
    );
    if (id && candidateIds.has(id)) {
      diagnostics.push(
        error('duplicate-candidate', 'Save to Assets selections must be unique.', [
          'selections',
          index,
          'candidateId',
        ]),
      );
    }
    if (id) candidateIds.add(id);
    requireString(selectionRecord['revision'], ['selections', index, 'revision'], diagnostics);
    requireString(
      selectionRecord['contentDigest'],
      ['selections', index, 'contentDigest'],
      diagnostics,
    );
  });
  rejectForbiddenRuntimeValues(record, diagnostics, ['renderUri', 'cachePath', 'assetPath']);
  return diagnostics;
}

export function isCanvasGeneratedDraftPromotionRequest(
  value: unknown,
): value is CanvasGeneratedDraftPromotionRequest {
  return validateCanvasGeneratedDraftPromotionRequest(value).length === 0;
}

export function validateCanvasGeneratedDraftPromotionResult(
  value: unknown,
): readonly CanvasGeneratedDraftGroupDiagnostic[] {
  const diagnostics: CanvasGeneratedDraftGroupDiagnostic[] = [];
  const record = requireRecord(value, diagnostics);
  if (!record) return diagnostics;
  validateVersion(record, diagnostics);
  requireString(record['requestId'], ['requestId'], diagnostics);
  requireRuntimeId(
    record['projectionId'],
    CANVAS_GENERATED_DRAFT_GROUP_ID_PREFIX,
    ['projectionId'],
    diagnostics,
  );
  const resultStatus = record['status'];
  if (resultStatus !== 'saved' && resultStatus !== 'partial' && resultStatus !== 'failed') {
    diagnostics.push(
      error('invalid-result-status', 'Promotion result status is unsupported.', ['status']),
    );
  }
  if (!Array.isArray(record['items']) || record['items'].length === 0) {
    diagnostics.push(error('missing-identity', 'Promotion result items are required.', ['items']));
    return diagnostics;
  }
  const candidateIds = new Set<string>();
  let savedCount = 0;
  let failedCount = 0;
  record['items'].forEach((item, index) => {
    const itemRecord = requireRecord(item, diagnostics, ['items', index]);
    if (!itemRecord) return;
    const candidateId = requireRuntimeId(
      itemRecord['candidateId'],
      CANVAS_GENERATED_DRAFT_CANDIDATE_ID_PREFIX,
      ['items', index, 'candidateId'],
      diagnostics,
    );
    if (candidateId && candidateIds.has(candidateId)) {
      diagnostics.push(
        error('duplicate-candidate', 'Promotion result candidate ids must be unique.', [
          'items',
          index,
          'candidateId',
        ]),
      );
    }
    if (candidateId) candidateIds.add(candidateId);
    if (itemRecord['status'] === 'saved') {
      savedCount += 1;
      validateAssetIdentity(itemRecord['asset'], ['items', index, 'asset'], diagnostics);
    } else if (itemRecord['status'] === 'failed') {
      failedCount += 1;
      validateDiagnostic(itemRecord['diagnostic'], ['items', index, 'diagnostic'], diagnostics);
    } else {
      diagnostics.push(
        error('invalid-result-status', 'Promotion item status is unsupported.', [
          'items',
          index,
          'status',
        ]),
      );
    }
  });
  if (
    (resultStatus === 'saved' && failedCount > 0) ||
    (resultStatus === 'failed' && savedCount > 0) ||
    (resultStatus === 'partial' && (savedCount === 0 || failedCount === 0))
  ) {
    diagnostics.push(
      error(
        'invalid-result-status',
        'Promotion result status does not match its per-candidate results.',
        ['status'],
      ),
    );
  }
  return diagnostics;
}

export function validateCanvasGeneratedDraftApplyResult(
  value: unknown,
): readonly CanvasGeneratedDraftGroupDiagnostic[] {
  const diagnostics: CanvasGeneratedDraftGroupDiagnostic[] = [];
  const record = requireRecord(value, diagnostics);
  if (!record) return diagnostics;
  validateVersion(record, diagnostics);
  requireString(record['requestId'], ['requestId'], diagnostics);
  requireRuntimeId(
    record['projectionId'],
    CANVAS_GENERATED_DRAFT_GROUP_ID_PREFIX,
    ['projectionId'],
    diagnostics,
  );
  validateTarget(record['target'], diagnostics);
  if (
    record['status'] !== 'applied' &&
    record['status'] !== 'conflict' &&
    record['status'] !== 'blocked'
  ) {
    diagnostics.push(
      error('invalid-result-status', 'Canvas apply status is unsupported.', ['status']),
    );
  }
  if (record['status'] === 'applied') {
    requireString(record['revision'], ['revision'], diagnostics);
    requireString(record['groupId'], ['groupId'], diagnostics);
    if (!Array.isArray(record['nodeIds']) || record['nodeIds'].length === 0) {
      diagnostics.push(
        error('missing-identity', 'Applied Canvas result requires node ids.', ['nodeIds']),
      );
    } else {
      const nodeIds = new Set<string>();
      record['nodeIds'].forEach((nodeId, index) => {
        const id = requireString(nodeId, ['nodeIds', index], diagnostics);
        if (id && nodeIds.has(id)) {
          diagnostics.push(
            error('duplicate-candidate', 'Applied Canvas node ids must be unique.', [
              'nodeIds',
              index,
            ]),
          );
        }
        if (id) nodeIds.add(id);
      });
    }
  }
  if (!Array.isArray(record['diagnostics'])) {
    diagnostics.push(
      error('invalid-diagnostic', 'Canvas apply diagnostics must be an array.', ['diagnostics']),
    );
  } else {
    record['diagnostics'].forEach((diagnostic, index) =>
      validateDiagnostic(diagnostic, ['diagnostics', index], diagnostics),
    );
    if (
      (record['status'] === 'conflict' || record['status'] === 'blocked') &&
      record['diagnostics'].length === 0
    ) {
      diagnostics.push(
        error(
          'invalid-diagnostic',
          'A non-applied Canvas result requires a fail-visible diagnostic.',
          ['diagnostics'],
        ),
      );
    }
  }
  rejectForbiddenRuntimeValues(record, diagnostics, ['renderUri', 'cachePath', 'assetPath']);
  return diagnostics;
}

function validateCandidate(
  record: Record<string, unknown>,
  index: number,
  diagnostics: CanvasGeneratedDraftGroupDiagnostic[],
): void {
  const path = ['candidates', index] as const;
  requireString(record['title'], [...path, 'title'], diagnostics);
  if (!isMediaKind(record['mediaKind'])) {
    diagnostics.push(
      error('invalid-candidate-kind', 'Generated draft media kind is unsupported.', [
        ...path,
        'mediaKind',
      ]),
    );
  }
  requireString(record['mimeType'], [...path, 'mimeType'], diagnostics);
  requireString(record['revision'], [...path, 'revision'], diagnostics);
  requireString(record['contentDigest'], [...path, 'contentDigest'], diagnostics);
  if (!isResourceRef(record['resourceRef'])) {
    diagnostics.push(
      error('invalid-resource-ref', 'Generated draft candidate requires a valid ResourceRef.', [
        ...path,
        'resourceRef',
      ]),
    );
  } else if (
    record['resourceRef'].kind !== 'generated' ||
    record['resourceRef'].source.kind !== 'generated-asset'
  ) {
    diagnostics.push(
      error(
        'invalid-resource-ref',
        'Generated draft candidate must use generated-output resource identity before promotion.',
        [...path, 'resourceRef'],
      ),
    );
  }
  if (!isCandidateState(record['state'])) {
    diagnostics.push(
      error('invalid-candidate-state', 'Generated draft candidate state is unsupported.', [
        ...path,
        'state',
      ]),
    );
  }
  validatePoint(record['position'], [...path, 'position'], diagnostics);
  validateSize(record['size'], [...path, 'size'], diagnostics);
  optionalString(record['renderUri'], [...path, 'renderUri'], diagnostics);
  if (record['state'] === 'unavailable' || record['state'] === 'failed') {
    requireString(record['diagnostic'], [...path, 'diagnostic'], diagnostics);
  } else {
    optionalString(record['diagnostic'], [...path, 'diagnostic'], diagnostics);
  }
  if (record['promotedAsset'] !== undefined) {
    validateAssetIdentity(record['promotedAsset'], [...path, 'promotedAsset'], diagnostics);
  }
  if (
    (record['state'] === 'saved-to-assets' || record['state'] === 'added-to-board') &&
    record['promotedAsset'] === undefined
  ) {
    diagnostics.push(
      error(
        'invalid-asset-identity',
        'A saved generated candidate requires promoted Asset identity.',
        [...path, 'promotedAsset'],
      ),
    );
  }
}

function validateAssetIdentity(
  value: unknown,
  path: readonly (string | number)[],
  diagnostics: CanvasGeneratedDraftGroupDiagnostic[],
): void {
  const record = requireRecord(value, diagnostics, path);
  if (!record) return;
  requireString(record['entityId'], [...path, 'entityId'], diagnostics);
  requireString(record['variantId'], [...path, 'variantId'], diagnostics);
  requireString(record['fileId'], [...path, 'fileId'], diagnostics);
  const assetPath = requireString(record['path'], [...path, 'path'], diagnostics);
  if (assetPath && !isPortableAssetPath(assetPath)) {
    diagnostics.push(
      error('invalid-asset-identity', 'Promoted Asset path must be portable and outside cache.', [
        ...path,
        'path',
      ]),
    );
  }
  if (assetPath && isLegacyGeneratedPath(assetPath)) {
    diagnostics.push(
      error(
        'invalid-asset-identity',
        'Newly promoted Asset bytes cannot remain under neko/generated.',
        [...path, 'path'],
      ),
    );
  }
  if (!isMediaKind(record['mediaType'])) {
    diagnostics.push(
      error('invalid-asset-identity', 'Promoted Asset media type is unsupported.', [
        ...path,
        'mediaType',
      ]),
    );
  }
  if (record['resourceRef'] !== undefined) {
    if (!isResourceRef(record['resourceRef'])) {
      diagnostics.push(
        error('invalid-resource-ref', 'Promoted Asset resourceRef is invalid.', [
          ...path,
          'resourceRef',
        ]),
      );
    } else if (
      record['resourceRef'].kind === 'generated' ||
      record['resourceRef'].source.kind === 'generated-asset'
    ) {
      diagnostics.push(
        error(
          'invalid-resource-ref',
          'Promoted Asset resourceRef cannot retain generated-output identity.',
          [...path, 'resourceRef'],
        ),
      );
    }
  }
}

function validateDiagnostic(
  value: unknown,
  path: readonly (string | number)[],
  diagnostics: CanvasGeneratedDraftGroupDiagnostic[],
): void {
  const record = requireRecord(value, diagnostics, path);
  if (!record) return;
  if (record['severity'] !== 'error') {
    diagnostics.push(
      error('invalid-diagnostic', 'Generated draft diagnostics must have error severity.', [
        ...path,
        'severity',
      ]),
    );
  }
  const code = requireString(record['code'], [...path, 'code'], diagnostics);
  if (code && !DIAGNOSTIC_CODES.has(code)) {
    diagnostics.push(
      error('invalid-diagnostic', 'Generated draft diagnostic code is unsupported.', [
        ...path,
        'code',
      ]),
    );
  }
  requireString(record['message'], [...path, 'message'], diagnostics);
  if (record['path'] !== undefined) {
    if (!Array.isArray(record['path'])) {
      diagnostics.push(
        error('invalid-diagnostic', 'Generated draft diagnostic path must be an array.', [
          ...path,
          'path',
        ]),
      );
    } else if (
      record['path'].some((segment) => typeof segment !== 'string' && typeof segment !== 'number')
    ) {
      diagnostics.push(
        error(
          'invalid-diagnostic',
          'Generated draft diagnostic path segments must be strings or numbers.',
          [...path, 'path'],
        ),
      );
    }
  }
}

function validateTarget(value: unknown, diagnostics: CanvasGeneratedDraftGroupDiagnostic[]): void {
  const record = requireRecord(value, diagnostics, ['target']);
  if (!record) return;
  const documentRef = record['documentRef'];
  const documentKind = readStringProperty(documentRef, 'kind');
  const targetDiagnostics =
    documentKind === 'workspace-path'
      ? validateCanvasBoardTargetIdentity(
          {
            documentRef: {
              kind: 'workspace-path',
              path: readStringProperty(documentRef, 'path'),
            },
            documentId: readStringProperty(record, 'documentId'),
            canvasId: readStringProperty(record, 'canvasId'),
            revision: readStringProperty(record, 'revision'),
          },
          ['target'],
        )
      : [
          {
            code: 'missing-identity' as const,
            severity: 'error' as const,
            message: 'Canvas Board documentRef kind must be workspace-path.',
            path: ['target', 'documentRef', 'kind'] as const,
          },
        ];
  diagnostics.push(
    ...targetDiagnostics.map((item) =>
      error('invalid-target', item.message, item.path ?? ['target']),
    ),
  );
  requireString(record['conversationId'], ['target', 'conversationId'], diagnostics);
  requireString(record['resolutionSource'], ['target', 'resolutionSource'], diagnostics);
  requireString(record['frozenAt'], ['target', 'frozenAt'], diagnostics);
}

function validateVersion(
  record: Record<string, unknown>,
  diagnostics: CanvasGeneratedDraftGroupDiagnostic[],
): void {
  if (record['version'] !== CANVAS_GENERATED_DRAFT_GROUP_CONTRACT_VERSION) {
    diagnostics.push(
      error('invalid-contract-version', 'Unsupported generated draft Group contract version.', [
        'version',
      ]),
    );
  }
}

function validatePoint(
  value: unknown,
  path: readonly (string | number)[],
  diagnostics: CanvasGeneratedDraftGroupDiagnostic[],
): void {
  const record = requireRecord(value, diagnostics, path);
  if (!record || !isFiniteNumber(record['x']) || !isFiniteNumber(record['y'])) {
    diagnostics.push(error('missing-identity', 'Canvas position requires finite x and y.', path));
  }
}

function validateSize(
  value: unknown,
  path: readonly (string | number)[],
  diagnostics: CanvasGeneratedDraftGroupDiagnostic[],
): void {
  const record = requireRecord(value, diagnostics, path);
  if (
    !record ||
    !isFiniteNumber(record['width']) ||
    !isFiniteNumber(record['height']) ||
    record['width'] <= 0 ||
    record['height'] <= 0
  ) {
    diagnostics.push(
      error('missing-identity', 'Canvas size requires positive finite dimensions.', path),
    );
  }
}

function requireRecord(
  value: unknown,
  diagnostics: CanvasGeneratedDraftGroupDiagnostic[],
  path: readonly (string | number)[] = [],
): Record<string, unknown> | undefined {
  if (isRecord(value)) {
    return value;
  }
  diagnostics.push(error('missing-identity', 'Expected an object.', path));
  return undefined;
}

function requireRuntimeId(
  value: unknown,
  prefix: string,
  path: readonly (string | number)[],
  diagnostics: CanvasGeneratedDraftGroupDiagnostic[],
): string | undefined {
  const id = requireString(value, path, diagnostics);
  if (id && !id.startsWith(prefix)) {
    diagnostics.push(
      error('runtime-value-forbidden', `Runtime projection id must start with ${prefix}.`, path),
    );
  }
  return id;
}

function requireString(
  value: unknown,
  path: readonly (string | number)[],
  diagnostics: CanvasGeneratedDraftGroupDiagnostic[],
): string | undefined {
  if (typeof value === 'string' && value.trim().length > 0) return value;
  diagnostics.push(error('missing-identity', 'A non-empty string is required.', path));
  return undefined;
}

function optionalString(
  value: unknown,
  path: readonly (string | number)[],
  diagnostics: CanvasGeneratedDraftGroupDiagnostic[],
): void {
  if (value !== undefined && typeof value !== 'string') {
    diagnostics.push(error('missing-identity', 'Expected a string when present.', path));
  }
}

function requireBoolean(
  value: unknown,
  path: readonly (string | number)[],
  diagnostics: CanvasGeneratedDraftGroupDiagnostic[],
): void {
  if (typeof value !== 'boolean') {
    diagnostics.push(error('missing-identity', 'A boolean is required.', path));
  }
}

function rejectForbiddenRuntimeValues(
  record: Record<string, unknown>,
  diagnostics: CanvasGeneratedDraftGroupDiagnostic[],
  keys: readonly string[],
): void {
  for (const key of keys) {
    if (key in record) {
      diagnostics.push(
        error(
          'runtime-value-forbidden',
          `${key} is forbidden in durable promotion/apply results.`,
          [key],
        ),
      );
    }
  }
}

function isPortableAssetPath(value: string): boolean {
  const normalized = value.trim().replace(/\\/g, '/');
  return (
    normalized.length > 0 &&
    !normalized.startsWith('/') &&
    !/^[A-Za-z]:\//.test(normalized) &&
    !/^[a-z][a-z0-9+.-]*:/i.test(normalized) &&
    !normalized.split('/').includes('..') &&
    !normalized.includes('/.neko/.cache/') &&
    !normalized.startsWith('.neko/.cache/')
  );
}

function isLegacyGeneratedPath(value: string): boolean {
  return value.trim().replace(/\\/g, '/').replace(/^\.\//, '').startsWith('neko/generated/');
}

function readStringProperty(value: unknown, key: string): string {
  if (!isRecord(value)) return '';
  const entry = value[key];
  return typeof entry === 'string' ? entry : '';
}

function isCandidateState(value: unknown): value is CanvasGeneratedDraftCandidateState {
  return typeof value === 'string' && CANDIDATE_STATES.has(value);
}

function isMediaKind(value: unknown): value is CanvasGeneratedDraftMediaKind {
  return typeof value === 'string' && MEDIA_KINDS.has(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function error(
  code: CanvasGeneratedDraftGroupDiagnosticCode,
  message: string,
  path: readonly (string | number)[],
): CanvasGeneratedDraftGroupDiagnostic {
  return { code, severity: 'error', message, path };
}
