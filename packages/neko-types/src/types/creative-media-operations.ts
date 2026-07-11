import type { ResourceRef } from './resource-cache';
import {
  validateDurableResourceRef,
  type DurableResourceRefDiagnostic,
} from './durable-resource-ref';

export const CREATIVE_MEDIA_OPERATION_CONTRACT_VERSION = 1 as const;

export const IMAGE_OPERATION_IDS = [
  'generate',
  'edit',
  'inpaint',
  'outpaint',
  'upscale',
  'colorize',
  'style-transfer',
  'composite',
  'split',
  'background-remove',
  'background-replace',
  'prepare-shot-reference',
] as const;

export const IMAGE_SPLIT_PROFILE_IDS = [
  'grid-crop',
  'comic-panel',
  'semantic-segmentation',
] as const;

export const VIDEO_OPERATION_IDS = [
  'generate-from-prompt',
  'generate-from-image',
  'generate-from-keyframes',
  'transform',
  'restyle',
  'extend',
  'enhance',
  'trim',
  'retime',
  'prepare-for-timeline',
] as const;

export const CREATIVE_MEDIA_SUPPORT_LEVELS = ['supported', 'degraded', 'unsupported'] as const;

export type ImageOperationId = (typeof IMAGE_OPERATION_IDS)[number];
export type ImageSplitProfileId = (typeof IMAGE_SPLIT_PROFILE_IDS)[number];
export type VideoOperationId = (typeof VIDEO_OPERATION_IDS)[number];
export type CreativeMediaOperationId = ImageOperationId | VideoOperationId;
export type CreativeMediaSupportLevel = (typeof CREATIVE_MEDIA_SUPPORT_LEVELS)[number];
export type CreativeMediaKind = 'image' | 'video';

export interface CreativeMediaOperationLimits {
  readonly maxInputCount?: number;
  readonly maxWidth?: number;
  readonly maxHeight?: number;
  readonly maxDurationSeconds?: number;
  readonly maxOutputCount?: number;
  readonly supportedMimeTypes?: readonly string[];
}

export interface CreativeMediaProviderRequirements {
  readonly providerId?: string;
  readonly modelId?: string;
  readonly requiredInputRoles?: readonly string[];
  readonly requiredCapabilities?: readonly string[];
  readonly requiresNetwork?: boolean;
  readonly requiresUserAuthorization?: boolean;
}

export interface CreativeMediaOperationDiagnostic {
  readonly code:
    | 'invalid-operation-request'
    | 'unknown-operation'
    | 'invalid-operation-result'
    | 'operation-unsupported'
    | 'operation-degraded'
    | 'missing-required-input'
    | 'operation-limit-exceeded'
    | DurableResourceRefDiagnostic['code'];
  readonly severity: 'info' | 'warning' | 'error';
  readonly message: string;
  readonly path?: readonly (string | number)[];
  readonly details?: Readonly<Record<string, unknown>>;
}

export interface CreativeMediaOperationSupport {
  readonly version: typeof CREATIVE_MEDIA_OPERATION_CONTRACT_VERSION;
  readonly mediaKind: CreativeMediaKind;
  readonly operationId: CreativeMediaOperationId;
  readonly level: CreativeMediaSupportLevel;
  readonly adapterId: string;
  readonly requirements?: CreativeMediaProviderRequirements;
  readonly limits?: CreativeMediaOperationLimits;
  readonly diagnostics: readonly CreativeMediaOperationDiagnostic[];
}

export interface CreativeMediaOperationRequest {
  readonly version: typeof CREATIVE_MEDIA_OPERATION_CONTRACT_VERSION;
  readonly requestId: string;
  readonly mediaKind: CreativeMediaKind;
  readonly operationId: CreativeMediaOperationId;
  readonly inputRefs: readonly ResourceRef[];
  readonly prompt?: string;
  readonly maskRef?: ResourceRef;
  readonly startFrameRef?: ResourceRef;
  readonly endFrameRef?: ResourceRef;
  readonly splitProfile?: ImageSplitProfileId;
  readonly requestedOutputCount?: number;
  readonly requestedWidth?: number;
  readonly requestedHeight?: number;
  readonly requestedDurationSeconds?: number;
  readonly intent?: Readonly<Record<string, unknown>>;
}

export interface CreativeMediaOperationResult {
  readonly version: typeof CREATIVE_MEDIA_OPERATION_CONTRACT_VERSION;
  readonly requestId: string;
  readonly mediaKind: CreativeMediaKind;
  readonly operationId: CreativeMediaOperationId;
  readonly status: 'succeeded' | 'failed';
  readonly outputRefs: readonly ResourceRef[];
  readonly diagnostics: readonly CreativeMediaOperationDiagnostic[];
  readonly provider?: { readonly providerId: string; readonly modelId?: string };
  readonly provenance?: Readonly<Record<string, unknown>>;
}

export interface CreativeMediaOperationValidationResult {
  readonly ok: boolean;
  readonly diagnostics: readonly CreativeMediaOperationDiagnostic[];
}

export function isImageOperationId(value: unknown): value is ImageOperationId {
  return typeof value === 'string' && IMAGE_OPERATION_IDS.some((id) => id === value);
}

export function isVideoOperationId(value: unknown): value is VideoOperationId {
  return typeof value === 'string' && VIDEO_OPERATION_IDS.some((id) => id === value);
}

export function validateCreativeMediaOperationSupport(
  support: CreativeMediaOperationSupport,
): CreativeMediaOperationValidationResult {
  const diagnostics: CreativeMediaOperationDiagnostic[] = [];
  validateOperationIdentity(support.mediaKind, support.operationId, diagnostics);
  if (support.version !== CREATIVE_MEDIA_OPERATION_CONTRACT_VERSION || !support.adapterId.trim()) {
    diagnostics.push({
      code: 'invalid-operation-request',
      severity: 'error',
      message:
        'Operation support must use the current contract version and a non-empty adapter id.',
    });
  }
  if (
    support.level === 'unsupported' &&
    !hasDiagnostic(support.diagnostics, 'operation-unsupported')
  ) {
    diagnostics.push({
      code: 'operation-unsupported',
      severity: 'error',
      message: 'Unsupported operation declarations require an explicit unsupported diagnostic.',
    });
  }
  if (support.level === 'degraded' && !hasDiagnostic(support.diagnostics, 'operation-degraded')) {
    diagnostics.push({
      code: 'operation-degraded',
      severity: 'error',
      message: 'Degraded operation declarations require an explicit degraded diagnostic.',
    });
  }
  return { ok: diagnostics.length === 0, diagnostics };
}

export function validateCreativeMediaOperationRequest(
  request: CreativeMediaOperationRequest,
): CreativeMediaOperationValidationResult {
  const diagnostics: CreativeMediaOperationDiagnostic[] = [];
  if (request.version !== CREATIVE_MEDIA_OPERATION_CONTRACT_VERSION || !request.requestId.trim()) {
    diagnostics.push({
      code: 'invalid-operation-request',
      severity: 'error',
      message: 'Operation request has an unsupported version or empty request id.',
    });
  }
  validateOperationIdentity(request.mediaKind, request.operationId, diagnostics);
  validateRefs(request.inputRefs, ['inputRefs'], diagnostics);
  for (const [name, ref] of [
    ['maskRef', request.maskRef],
    ['startFrameRef', request.startFrameRef],
    ['endFrameRef', request.endFrameRef],
  ] as const) {
    if (ref) validateRefs([ref], [name], diagnostics);
  }
  if (request.splitProfile && request.operationId !== 'split') {
    diagnostics.push({
      code: 'invalid-operation-request',
      severity: 'error',
      message: 'splitProfile is only valid for the image split operation.',
      path: ['splitProfile'],
    });
  }
  return { ok: diagnostics.length === 0, diagnostics };
}

export function validateCreativeMediaOperationDispatch(
  request: CreativeMediaOperationRequest,
  support: CreativeMediaOperationSupport,
): CreativeMediaOperationValidationResult {
  const diagnostics: CreativeMediaOperationDiagnostic[] = [
    ...validateCreativeMediaOperationRequest(request).diagnostics,
    ...validateCreativeMediaOperationSupport(support).diagnostics,
  ];
  if (request.mediaKind !== support.mediaKind || request.operationId !== support.operationId) {
    diagnostics.push({
      code: 'operation-unsupported',
      severity: 'error',
      message: 'Selected adapter support does not match the requested media operation.',
      path: ['operationId'],
    });
  }
  if (support.level === 'unsupported') {
    diagnostics.push({
      code: 'operation-unsupported',
      severity: 'error',
      message: 'Requested operation cannot be dispatched to an unsupported adapter.',
    });
  } else if (support.level === 'degraded') {
    diagnostics.push({
      code: 'operation-degraded',
      severity: 'warning',
      message: 'Requested operation can only be dispatched with declared degraded behavior.',
    });
  }
  const limits = support.limits;
  if (
    (limits?.maxInputCount !== undefined && request.inputRefs.length > limits.maxInputCount) ||
    (limits?.maxOutputCount !== undefined &&
      request.requestedOutputCount !== undefined &&
      request.requestedOutputCount > limits.maxOutputCount) ||
    (limits?.maxWidth !== undefined &&
      request.requestedWidth !== undefined &&
      request.requestedWidth > limits.maxWidth) ||
    (limits?.maxHeight !== undefined &&
      request.requestedHeight !== undefined &&
      request.requestedHeight > limits.maxHeight) ||
    (limits?.maxDurationSeconds !== undefined &&
      request.requestedDurationSeconds !== undefined &&
      request.requestedDurationSeconds > limits.maxDurationSeconds)
  ) {
    diagnostics.push({
      code: 'operation-limit-exceeded',
      severity: 'error',
      message: 'Requested operation exceeds the selected adapter limits.',
    });
  }
  const requiredRoles = support.requirements?.requiredInputRoles ?? [];
  const missingRole = requiredRoles.find((role) => !hasRequiredInputRole(request, role));
  if (missingRole) {
    diagnostics.push({
      code: 'missing-required-input',
      severity: 'error',
      message: `Requested operation is missing required input role: ${missingRole}.`,
      details: { role: missingRole },
    });
  }
  return { ok: !diagnostics.some((item) => item.severity === 'error'), diagnostics };
}

export function validateCreativeMediaOperationResult(
  result: CreativeMediaOperationResult,
): CreativeMediaOperationValidationResult {
  const diagnostics: CreativeMediaOperationDiagnostic[] = [];
  if (result.version !== CREATIVE_MEDIA_OPERATION_CONTRACT_VERSION || !result.requestId.trim()) {
    diagnostics.push({
      code: 'invalid-operation-result',
      severity: 'error',
      message: 'Operation result has an unsupported version or empty request id.',
    });
  }
  validateOperationIdentity(result.mediaKind, result.operationId, diagnostics);
  validateRefs(result.outputRefs, ['outputRefs'], diagnostics);
  if (result.status === 'succeeded' && result.outputRefs.length === 0) {
    diagnostics.push({
      code: 'invalid-operation-result',
      severity: 'error',
      message:
        'A successful operation result must include at least one durable output ResourceRef.',
      path: ['outputRefs'],
    });
  }
  if (
    result.status === 'succeeded' &&
    result.diagnostics.some((item) => item.severity === 'error')
  ) {
    diagnostics.push({
      code: 'invalid-operation-result',
      severity: 'error',
      message: 'A successful operation result cannot contain error diagnostics.',
      path: ['diagnostics'],
    });
  }
  return { ok: diagnostics.length === 0, diagnostics };
}

function validateOperationIdentity(
  mediaKind: CreativeMediaKind,
  operationId: CreativeMediaOperationId,
  diagnostics: CreativeMediaOperationDiagnostic[],
): void {
  const valid =
    mediaKind === 'image' ? isImageOperationId(operationId) : isVideoOperationId(operationId);
  if (!valid) {
    diagnostics.push({
      code: 'unknown-operation',
      severity: 'error',
      message: `Operation ${operationId} is not valid for media kind ${mediaKind}.`,
      path: ['operationId'],
    });
  }
}

function validateRefs(
  refs: readonly ResourceRef[],
  path: readonly (string | number)[],
  diagnostics: CreativeMediaOperationDiagnostic[],
): void {
  refs.forEach((ref, index) => {
    const validation = validateDurableResourceRef(ref, [...path, index]);
    diagnostics.push(...validation.diagnostics);
  });
}

function hasRequiredInputRole(request: CreativeMediaOperationRequest, role: string): boolean {
  switch (role) {
    case 'source':
      return request.inputRefs.length > 0;
    case 'mask':
      return request.maskRef !== undefined;
    case 'start-frame':
      return request.startFrameRef !== undefined;
    case 'end-frame':
      return request.endFrameRef !== undefined;
    case 'prompt':
      return request.prompt !== undefined && request.prompt.trim().length > 0;
    default:
      return false;
  }
}

function hasDiagnostic(
  diagnostics: readonly CreativeMediaOperationDiagnostic[],
  code: CreativeMediaOperationDiagnostic['code'],
): boolean {
  return diagnostics.some((diagnostic) => diagnostic.code === code);
}
