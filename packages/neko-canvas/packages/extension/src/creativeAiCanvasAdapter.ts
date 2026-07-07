import {
  CREATIVE_AI_INVOCATION_SCHEMA_VERSION,
  createCreativeAiDiagnostic,
  isRuntimeOnlyCreativeAiIdentityValue,
  validateCreativeAiApplyRequest,
  validateExternalCreativeAiInvocation,
  type CanvasNode,
  type CreativeAiApplyRequest,
  type CreativeAiDiagnostic,
  type CreativeAiDocumentRef,
  type CreativeAiInvocationMode,
  type CreativeAiOutputRef,
  type CreativeAiRevision,
  type CreativeAiSourceRef,
  type CreativeAiTargetRef,
  type CreativeAiWritebackPolicy,
  type ExternalCreativeAiInvocation,
} from '@neko/shared';

const CANVAS_CREATIVE_AI_PACKAGE_ID = 'neko-canvas';
export const CANVAS_CREATIVE_AI_INVOKE_EXTERNAL_COMMAND = 'neko.agent.creativeAi.invokeExternal';
export const CANVAS_GENERATED_IMAGE_FIELD_PATH = '/generatedImage';

export interface CanvasCreativeAiDocumentIdentity {
  readonly documentId?: string;
  readonly projectRelativePath?: string;
  readonly variablePath?: string;
  readonly label?: string;
  readonly revision?: CreativeAiRevision;
}

export interface CanvasCreativeAiGenerateInvocationInput {
  readonly document: CanvasCreativeAiDocumentIdentity;
  readonly node: CanvasNode;
  readonly batchNodes?: readonly CanvasNode[];
  readonly childNodeId?: string;
  readonly params?: Readonly<Record<string, unknown>>;
  readonly mode?: CreativeAiInvocationMode;
  readonly intent?: string;
  readonly requestedAt?: string;
  readonly batchNodeIds?: readonly string[];
  readonly routingConversationId?: string;
}

export interface CanvasCreativeAiApplyPort {
  getNode(nodeId: string): Promise<CanvasNode | undefined>;
  updateNode(nodeId: string, data: Record<string, unknown>): Promise<void>;
}

export type CanvasCreativeAiApplyResult =
  | {
      readonly ok: true;
      readonly changed: boolean;
      readonly targetRef?: CreativeAiTargetRef;
      readonly outputRef?: CreativeAiOutputRef;
      readonly diagnostics: readonly CreativeAiDiagnostic[];
    }
  | {
      readonly ok: false;
      readonly diagnostics: readonly CreativeAiDiagnostic[];
    };

type CanvasCreativeAiProjectedOutput =
  | { readonly ok: true; readonly data: Record<string, unknown> }
  | { readonly ok: false; readonly diagnostics: readonly CreativeAiDiagnostic[] };

export interface CanvasCreativeAiBatchApplyResult {
  readonly ok: boolean;
  readonly atomic: boolean;
  readonly results: readonly CanvasCreativeAiApplyResult[];
  readonly diagnostics: readonly CreativeAiDiagnostic[];
}

export type CanvasCreativeAiAgentInvocationResult =
  | {
      readonly ok: true;
      readonly decision: unknown;
      readonly snapshot: unknown;
      readonly status: 'created' | 'existing';
      readonly diagnostics: readonly CreativeAiDiagnostic[];
    }
  | {
      readonly ok: false;
      readonly diagnostics: readonly CreativeAiDiagnostic[];
    };

function buildCanvasCreativeAiDocumentRef(
  input: CanvasCreativeAiDocumentIdentity,
): CreativeAiDocumentRef {
  return {
    kind: 'nk-document',
    packageId: CANVAS_CREATIVE_AI_PACKAGE_ID,
    ...(input.documentId ? { documentId: input.documentId } : {}),
    ...(input.projectRelativePath ? { projectRelativePath: input.projectRelativePath } : {}),
    ...(input.variablePath ? { variablePath: input.variablePath } : {}),
    format: 'nkc',
    ...(input.label ? { label: input.label } : {}),
  };
}

export function buildCanvasGenerateExternalInvocation(
  input: CanvasCreativeAiGenerateInvocationInput,
): ExternalCreativeAiInvocation {
  const documentRef = buildCanvasCreativeAiDocumentRef(input.document);
  const targetFieldPath = CANVAS_GENERATED_IMAGE_FIELD_PATH;
  const batchNodes = input.batchNodes ?? [input.node];
  const targetRef = input.batchNodeIds?.length
    ? buildCanvasBatchTargetRef({
        documentRef,
        nodes: batchNodes,
        batchNodeIds: input.batchNodeIds,
        fieldPath: targetFieldPath,
      })
    : buildCanvasGeneratedImageTargetRef({
        documentRef,
        node: input.node,
        childNodeId: input.childNodeId,
        fieldPath: targetFieldPath,
      });
  const sourceRef = input.batchNodeIds?.length
    ? buildCanvasBatchSourceRef({
        documentRef,
        nodes: batchNodes,
        batchNodeIds: input.batchNodeIds,
      })
    : buildCanvasNodeSourceRef({ documentRef, node: input.node });
  const mode = input.mode ?? (input.batchNodeIds?.length ? 'batch' : 'generate');
  const writeback: CreativeAiWritebackPolicy = {
    kind: 'mutating',
    atomicity: 'per-target',
    requiresRevisionMatch: true,
  };
  const documentRevision = input.document.revision;
  const targetRevision = targetRef.revision;
  const associationKey = createCanvasCreativeAiAssociationKey(documentRef);
  const invocationId = createCanvasInvocationId({
    documentRef,
    nodeId: input.node.id,
    childNodeId: input.childNodeId,
    mode,
    targetRevision,
    batchNodeIds: input.batchNodeIds,
  });
  const idempotencyKey = createCanvasInvocationIdempotencyKey({
    associationKey,
    nodeId: input.node.id,
    childNodeId: input.childNodeId,
    mode,
    documentRevision,
    targetRevision,
    batchNodeIds: input.batchNodeIds,
  });

  const invocation: ExternalCreativeAiInvocation = {
    schemaVersion: CREATIVE_AI_INVOCATION_SCHEMA_VERSION,
    domain: 'external-creative-package',
    invocationId,
    sourcePackage: CANVAS_CREATIVE_AI_PACKAGE_ID,
    documentRef,
    sourceRef,
    targetRef,
    intent:
      input.intent ??
      (mode === 'batch'
        ? 'Generate stable image outputs for selected Canvas shot nodes.'
        : 'Generate a stable image output for the Canvas shot node.'),
    mode,
    writeback,
    ...(documentRevision !== undefined ? { documentRevision } : {}),
    targetRevision,
    routing: {
      associationKey,
      allowCreateBackgroundConversation: true,
      ...(input.routingConversationId
        ? { userSelectedConversationId: input.routingConversationId }
        : {}),
    },
    idempotencyKey,
    ...(input.requestedAt ? { requestedAt: input.requestedAt } : {}),
    metadata: {
      targetFieldPath,
      ...(input.childNodeId ? { childNodeId: input.childNodeId } : {}),
      ...(input.params ? { params: sanitizeInvocationMetadata(input.params) } : {}),
      ...(input.batchNodeIds ? { batchNodeIds: [...input.batchNodeIds] } : {}),
    },
  };

  const validation = validateExternalCreativeAiInvocation(invocation);
  if (!validation.valid) {
    throw new Error(
      `Invalid Canvas creative AI invocation: ${validation.diagnostics
        .map((diagnostic) => diagnostic.message)
        .join('; ')}`,
    );
  }

  return invocation;
}

function buildCanvasNodeSourceRef(input: {
  readonly documentRef: CreativeAiDocumentRef;
  readonly node: CanvasNode;
}): CreativeAiSourceRef {
  return {
    kind: 'canvas-node',
    packageId: CANVAS_CREATIVE_AI_PACKAGE_ID,
    id: `canvas-node:${input.node.id}`,
    documentRef: input.documentRef,
    entityId: input.node.id,
    label: createCanvasNodeLabel(input.node),
    revision: createCanvasNodeRevision(input.node),
  };
}

export function buildCanvasGeneratedImageTargetRef(input: {
  readonly documentRef: CreativeAiDocumentRef;
  readonly node: CanvasNode;
  readonly childNodeId?: string;
  readonly fieldPath?: string;
}): CreativeAiTargetRef {
  const fieldPath = input.fieldPath ?? CANVAS_GENERATED_IMAGE_FIELD_PATH;
  const entityId = input.childNodeId ?? input.node.id;
  return {
    kind: 'canvas-field',
    packageId: CANVAS_CREATIVE_AI_PACKAGE_ID,
    id: `canvas-node:${entityId}#${fieldPath}`,
    documentRef: input.documentRef,
    entityId,
    fieldPath,
    label: `${createCanvasNodeLabel(input.node)} generated image`,
    revision: createCanvasTargetRevision(input.node, fieldPath),
  };
}

export function createCanvasDocumentRevision(canvasData: unknown): string {
  return `canvas-doc:${stableHash(stableStringify(canvasData))}`;
}

function createCanvasNodeRevision(node: CanvasNode): string {
  return `canvas-node:${stableHash(stableStringify(projectNodeRevisionInput(node)))}`;
}

export function createCanvasTargetRevision(node: CanvasNode, fieldPath: string): string {
  return `canvas-target:${stableHash(
    stableStringify({
      nodeId: node.id,
      fieldPath,
      value: readJsonPointer(node.data, fieldPath).value,
    }),
  )}`;
}

function createCanvasCreativeAiAssociationKey(documentRef: CreativeAiDocumentRef): string {
  const documentIdentity =
    documentRef.projectRelativePath ?? documentRef.variablePath ?? documentRef.documentId;
  if (!documentIdentity) {
    throw new Error('Canvas creative AI document association requires stable document identity.');
  }
  return `${CANVAS_CREATIVE_AI_PACKAGE_ID}:document:${documentIdentity}`;
}

export class CanvasCreativeAiApplyAdapter {
  private readonly activeTargetLocks = new Map<string, string>();
  private readonly completedByIdempotency = new Map<string, CanvasCreativeAiApplyResult>();

  constructor(private readonly port: CanvasCreativeAiApplyPort) {}

  async apply(request: CreativeAiApplyRequest): Promise<CanvasCreativeAiApplyResult> {
    const validation = validateCreativeAiApplyRequest(request);
    if (!validation.valid || !validation.value) {
      return { ok: false, diagnostics: validation.diagnostics };
    }

    const stableIdentityDiagnostics = validateStableCanvasApplyIdentity(validation.value);
    if (stableIdentityDiagnostics.length > 0) {
      return { ok: false, diagnostics: stableIdentityDiagnostics };
    }

    const existing = this.completedByIdempotency.get(validation.value.idempotencyKey);
    if (existing) {
      return existing;
    }

    if (validation.value.sourcePackage !== CANVAS_CREATIVE_AI_PACKAGE_ID) {
      return {
        ok: false,
        diagnostics: [
          diagnostic(
            'creative-ai-canvas-wrong-source-package',
            'Canvas apply adapter only accepts neko-canvas creative AI outputs.',
            'sourcePackage',
          ),
        ],
      };
    }

    if (
      validation.value.writeback.kind === 'candidate' ||
      validation.value.candidateTargetRef?.candidateOnly === true ||
      (!validation.value.targetRef && validation.value.candidateTargetRef)
    ) {
      const result: CanvasCreativeAiApplyResult = {
        ok: true,
        changed: false,
        targetRef: validation.value.candidateTargetRef,
        outputRef: validation.value.outputRefs[0],
        diagnostics: [
          createCreativeAiDiagnostic(
            'info',
            'creative-ai-canvas-candidate-output-ready',
            'Generated Canvas output is available as a candidate and was not written to document state.',
            'candidateTargetRef',
          ),
        ],
      };
      this.completedByIdempotency.set(validation.value.idempotencyKey, result);
      return result;
    }

    const targetRef = validation.value.targetRef;
    if (!targetRef) {
      return {
        ok: false,
        diagnostics: [
          diagnostic(
            'creative-ai-canvas-missing-target',
            'Canvas mutating apply requires targetRef.',
            'targetRef',
          ),
        ],
      };
    }

    const targetKey = createCanvasTargetKey(targetRef);
    const lockOwner = this.activeTargetLocks.get(targetKey);
    if (lockOwner && lockOwner !== validation.value.idempotencyKey) {
      return {
        ok: false,
        diagnostics: [
          {
            ...diagnostic(
              'creative-ai-canvas-target-locked',
              'Canvas target is already being updated by another creative AI apply request.',
              'targetRef',
            ),
            retryable: true,
          },
        ],
      };
    }

    this.activeTargetLocks.set(targetKey, validation.value.idempotencyKey);
    try {
      const result = await this.applyWithLock(validation.value, targetRef);
      if (result.ok) {
        this.completedByIdempotency.set(validation.value.idempotencyKey, result);
      }
      return result;
    } finally {
      if (this.activeTargetLocks.get(targetKey) === validation.value.idempotencyKey) {
        this.activeTargetLocks.delete(targetKey);
      }
    }
  }

  async applyBatch(
    requests: readonly CreativeAiApplyRequest[],
    options: { readonly atomic?: boolean } = {},
  ): Promise<CanvasCreativeAiBatchApplyResult> {
    const atomic =
      options.atomic === true ||
      requests.some((request) => request.writeback.atomicity === 'atomic');
    const results: CanvasCreativeAiApplyResult[] = [];

    for (const request of requests) {
      const result = await this.apply(request);
      results.push(result);
      if (atomic && !result.ok) {
        break;
      }
    }

    const diagnostics = results.flatMap((result) => result.diagnostics);
    return {
      ok: results.every((result) => result.ok),
      atomic,
      results,
      diagnostics,
    };
  }

  private async applyWithLock(
    request: CreativeAiApplyRequest,
    targetRef: CreativeAiTargetRef,
  ): Promise<CanvasCreativeAiApplyResult> {
    const nodeId = targetRef.entityId;
    if (!nodeId) {
      return {
        ok: false,
        diagnostics: [
          diagnostic(
            'creative-ai-canvas-missing-target-entity',
            'Canvas targetRef must include entityId.',
            'targetRef.entityId',
          ),
        ],
      };
    }

    const fieldPath = normalizeCanvasGeneratedImageFieldPath(targetRef.fieldPath);
    if (!fieldPath) {
      return {
        ok: false,
        diagnostics: [
          diagnostic(
            'creative-ai-canvas-target-field-conflict',
            'Canvas generated-image apply can only write /generatedImage.',
            'targetRef.fieldPath',
          ),
        ],
      };
    }

    const node = await this.port.getNode(nodeId);
    if (!node) {
      return {
        ok: false,
        diagnostics: [
          diagnostic(
            'creative-ai-canvas-target-deleted',
            `Canvas target node "${nodeId}" no longer exists.`,
            'targetRef.entityId',
          ),
        ],
      };
    }

    const currentRevision = createCanvasTargetRevision(node, fieldPath);
    if (
      request.writeback.requiresRevisionMatch !== false &&
      request.targetRevision !== undefined &&
      request.targetRevision !== currentRevision
    ) {
      return {
        ok: false,
        diagnostics: [
          {
            ...diagnostic(
              'creative-ai-canvas-target-stale',
              'Canvas target revision changed before creative AI output could be applied.',
              'targetRevision',
            ),
            expected: request.targetRevision,
            received: currentRevision,
          },
        ],
      };
    }

    const outputRef = request.outputRefs[0];
    if (!outputRef) {
      return {
        ok: false,
        diagnostics: [
          diagnostic(
            'creative-ai-canvas-missing-output',
            'Canvas apply requires at least one output ref.',
            'outputRefs',
          ),
        ],
      };
    }

    const output = projectCanvasGeneratedImageOutput(outputRef);
    if (!output.ok) {
      return output;
    }

    await this.port.updateNode(nodeId, output.data);
    return {
      ok: true,
      changed: true,
      targetRef,
      outputRef,
      diagnostics: [],
    };
  }
}

function buildCanvasBatchSourceRef(input: {
  readonly documentRef: CreativeAiDocumentRef;
  readonly nodes: readonly CanvasNode[];
  readonly batchNodeIds: readonly string[];
}): CreativeAiSourceRef {
  return {
    kind: 'selection',
    packageId: CANVAS_CREATIVE_AI_PACKAGE_ID,
    id: `canvas-selection:${stableHash(input.batchNodeIds.join(','))}`,
    documentRef: input.documentRef,
    role: 'batch-source',
    label: `${input.batchNodeIds.length} Canvas nodes`,
    childRefs: input.nodes.map((node) =>
      buildCanvasNodeSourceRef({ documentRef: input.documentRef, node }),
    ),
    revision: `canvas-selection:${stableHash(input.batchNodeIds.join('|'))}`,
    metadata: { nodeIds: [...input.batchNodeIds] },
  };
}

function buildCanvasBatchTargetRef(input: {
  readonly documentRef: CreativeAiDocumentRef;
  readonly nodes: readonly CanvasNode[];
  readonly batchNodeIds: readonly string[];
  readonly fieldPath: string;
}): CreativeAiTargetRef {
  const childRefs = input.nodes.map((node) =>
    buildCanvasGeneratedImageTargetRef({
      documentRef: input.documentRef,
      node,
      fieldPath: input.fieldPath,
    }),
  );
  return {
    kind: 'batch',
    packageId: CANVAS_CREATIVE_AI_PACKAGE_ID,
    id: `canvas-batch:${stableHash(input.batchNodeIds.join(','))}#${input.fieldPath}`,
    documentRef: input.documentRef,
    role: 'batch-target',
    label: `${input.batchNodeIds.length} Canvas generated image targets`,
    childRefs,
    revision: `canvas-batch-target:${stableHash(
      stableStringify(childRefs.map((ref) => [ref.id, ref.revision])),
    )}`,
    metadata: {
      nodeIds: [...input.batchNodeIds],
      fieldPath: input.fieldPath,
    },
  };
}

function createCanvasInvocationId(input: {
  readonly documentRef: CreativeAiDocumentRef;
  readonly nodeId: string;
  readonly childNodeId?: string;
  readonly mode: CreativeAiInvocationMode;
  readonly targetRevision?: CreativeAiRevision;
  readonly batchNodeIds?: readonly string[];
}): string {
  return `canvas-ai:${stableHash(
    stableStringify({
      document:
        input.documentRef.projectRelativePath ??
        input.documentRef.variablePath ??
        input.documentRef.documentId,
      nodeId: input.nodeId,
      childNodeId: input.childNodeId,
      mode: input.mode,
      targetRevision: input.targetRevision,
      batchNodeIds: input.batchNodeIds,
    }),
  )}`;
}

function createCanvasInvocationIdempotencyKey(input: {
  readonly associationKey: string;
  readonly nodeId: string;
  readonly childNodeId?: string;
  readonly mode: CreativeAiInvocationMode;
  readonly documentRevision?: CreativeAiRevision;
  readonly targetRevision?: CreativeAiRevision;
  readonly batchNodeIds?: readonly string[];
}): string {
  return `canvas-ai-idempotency:${stableHash(stableStringify(input))}`;
}

function createCanvasTargetKey(targetRef: CreativeAiTargetRef): string {
  return `${targetRef.packageId}:${targetRef.entityId ?? targetRef.id}:${targetRef.fieldPath ?? ''}`;
}

function createCanvasNodeLabel(node: CanvasNode): string {
  const data = isRecord(node.data) ? node.data : {};
  const label =
    readString(data['sceneTitle']) ??
    readString(data['title']) ??
    readString(data['visualDescription']) ??
    readString(data['content']);
  return label ? `${node.type}:${label.slice(0, 48)}` : `${node.type}:${node.id}`;
}

function projectNodeRevisionInput(node: CanvasNode): unknown {
  return {
    id: node.id,
    type: node.type,
    data: node.data,
    preset: node.preset,
    container: node.container,
  };
}

function readJsonPointer(
  root: unknown,
  path: string,
): { readonly found: boolean; readonly value: unknown } {
  if (path === '' || path === '/') {
    return { found: true, value: root };
  }
  const segments = path
    .split('/')
    .slice(1)
    .map((segment) => segment.replace(/~1/g, '/').replace(/~0/g, '~'));
  let current: unknown = root;
  for (const segment of segments) {
    if (!isRecord(current) && !Array.isArray(current)) {
      return { found: false, value: undefined };
    }
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return { found: false, value: undefined };
      }
      current = current[index];
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(current, segment)) {
      return { found: false, value: undefined };
    }
    current = current[segment];
  }
  return { found: true, value: current };
}

function normalizeCanvasGeneratedImageFieldPath(fieldPath: string | undefined): string | null {
  if (!fieldPath || fieldPath === CANVAS_GENERATED_IMAGE_FIELD_PATH) {
    return CANVAS_GENERATED_IMAGE_FIELD_PATH;
  }
  return null;
}

function projectCanvasGeneratedImageOutput(
  outputRef: CreativeAiOutputRef,
): CanvasCreativeAiProjectedOutput {
  if (
    outputRef.kind !== 'generated-asset' &&
    outputRef.kind !== 'resource' &&
    outputRef.kind !== 'resource-variant'
  ) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          'creative-ai-canvas-unsupported-output',
          'Canvas generated-image apply requires a generated asset or resource output ref.',
          'outputRefs',
        ),
      ],
    };
  }

  const variantResource = outputRef.resourceVariantRef?.resource;
  const variantPath =
    variantResource?.source.projectRelativePath ??
    (variantResource?.locator?.kind === 'file' ? variantResource.locator.path : undefined);
  const resourcePath =
    variantPath ??
    outputRef.resourceRef?.source.projectRelativePath ??
    (outputRef.resourceRef?.locator?.kind === 'file'
      ? outputRef.resourceRef.locator.path
      : undefined) ??
    (outputRef.generatedAssetId ? `generated-assets/${outputRef.generatedAssetId}` : undefined);

  if (!resourcePath || isRuntimeOnlyCreativeAiIdentityValue(resourcePath)) {
    return {
      ok: false,
      diagnostics: [
        diagnostic(
          'creative-ai-canvas-unstable-output-ref',
          'Canvas generated-image apply requires a stable generated asset or resource path.',
          'outputRefs',
        ),
      ],
    };
  }

  return {
    ok: true,
    data: {
      generatedImage: resourcePath,
      generatedAsset: {
        id: outputRef.generatedAssetId ?? outputRef.resourceRef?.id ?? outputRef.id,
        path: resourcePath,
        kind: outputRef.kind,
        ...(outputRef.mimeType ? { mimeType: outputRef.mimeType } : {}),
        ...(outputRef.resourceRef ? { resourceRef: outputRef.resourceRef } : {}),
        ...(outputRef.resourceVariantRef
          ? { resourceVariantRef: outputRef.resourceVariantRef }
          : {}),
      },
    },
  };
}

function validateStableCanvasApplyIdentity(
  request: CreativeAiApplyRequest,
): readonly CreativeAiDiagnostic[] {
  const diagnostics: CreativeAiDiagnostic[] = [];
  collectRuntimeOnlyIdentityDiagnostics(request.targetRef, 'targetRef', diagnostics);
  collectRuntimeOnlyIdentityDiagnostics(
    request.candidateTargetRef,
    'candidateTargetRef',
    diagnostics,
  );
  for (const [index, outputRef] of request.outputRefs.entries()) {
    collectRuntimeOnlyIdentityDiagnostics(
      outputRef.metadata,
      `outputRefs[${index}].metadata`,
      diagnostics,
    );
  }
  return diagnostics;
}

function collectRuntimeOnlyIdentityDiagnostics(
  value: unknown,
  target: string,
  diagnostics: CreativeAiDiagnostic[],
): void {
  if (typeof value === 'string') {
    if (isRuntimeOnlyCreativeAiIdentityValue(value)) {
      diagnostics.push(
        diagnostic(
          'creative-ai-canvas-runtime-only-identity',
          'Canvas creative AI apply cannot persist Webview, blob, cache, temp, or provider runtime identity.',
          target,
        ),
      );
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      collectRuntimeOnlyIdentityDiagnostics(item, `${target}[${index}]`, diagnostics),
    );
    return;
  }

  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) {
    collectRuntimeOnlyIdentityDiagnostics(child, `${target}.${key}`, diagnostics);
  }
}

function sanitizeInvocationMetadata(
  value: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const sanitized: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (typeof child === 'string' && isRuntimeOnlyCreativeAiIdentityValue(child)) {
      continue;
    }
    sanitized[key] = child;
  }
  return sanitized;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'undefined';
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, child]) => `${JSON.stringify(key)}:${stableStringify(child)}`)
    .join(',')}}`;
}

function stableHash(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(16);
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function diagnostic(code: string, message: string, target?: string): CreativeAiDiagnostic {
  return createCreativeAiDiagnostic('error', code, message, target);
}
