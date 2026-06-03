export type ModelControlState = 'available' | 'pending' | 'disabled' | 'degraded';

export type ModelControlReason =
  | 'engine-not-ready'
  | 'scene-control-disconnected'
  | 'capability-unsupported'
  | 'capability-unknown'
  | 'no-selection'
  | 'asset-not-character'
  | 'missing-character-regions'
  | 'missing-morph-data'
  | 'missing-bone-data'
  | 'missing-animation-clips'
  | 'hit-test-unavailable'
  | 'runtime-rejected'
  | 'stream-fallback'
  | 'metadata-stale';

export type ModelControlAvailability =
  | { readonly state: 'available' }
  | {
      readonly state: 'pending';
      readonly reason: ModelControlReason;
      readonly diagnostic?: ModelControlDiagnostic;
    }
  | {
      readonly state: 'disabled';
      readonly reason: ModelControlReason;
      readonly diagnostic?: ModelControlDiagnostic;
    }
  | {
      readonly state: 'degraded';
      readonly reason: ModelControlReason;
      readonly retryable: boolean;
      readonly diagnostic?: ModelControlDiagnostic;
    };

export interface ModelControlDiagnostic {
  readonly code?: string;
  readonly message?: string;
  readonly retryable?: boolean;
}

export type SceneControlAvailabilityStatus = 'disconnected' | 'connecting' | 'ready' | 'error';
export type ModelCapabilityState = 'supported' | 'unsupported' | 'unknown' | boolean;

export interface RuntimeControlDiagnosticInput extends ModelControlDiagnostic {
  readonly state?: Exclude<ModelControlState, 'available'>;
  readonly reason: ModelControlReason;
}

export interface ModelControlAvailabilityInput {
  readonly engineReady?: boolean;
  readonly sceneControlStatus?: SceneControlAvailabilityStatus;
  readonly capability?: ModelCapabilityState;
  readonly requiresSelection?: boolean;
  readonly hasSelection?: boolean;
  readonly assetCompatible?: boolean;
  readonly incompatibilityReason?: ModelControlReason;
  readonly runtimeDiagnostic?: RuntimeControlDiagnosticInput | null;
}

const AVAILABLE_CONTROL: ModelControlAvailability = { state: 'available' };

const REASON_I18N_KEYS: Record<ModelControlReason, string> = {
  'engine-not-ready': 'controlAvailability.reason.engine-not-ready',
  'scene-control-disconnected': 'controlAvailability.reason.scene-control-disconnected',
  'capability-unsupported': 'controlAvailability.reason.capability-unsupported',
  'capability-unknown': 'controlAvailability.reason.capability-unknown',
  'no-selection': 'controlAvailability.reason.no-selection',
  'asset-not-character': 'controlAvailability.reason.asset-not-character',
  'missing-character-regions': 'controlAvailability.reason.missing-character-regions',
  'missing-morph-data': 'controlAvailability.reason.missing-morph-data',
  'missing-bone-data': 'controlAvailability.reason.missing-bone-data',
  'missing-animation-clips': 'controlAvailability.reason.missing-animation-clips',
  'hit-test-unavailable': 'controlAvailability.reason.hit-test-unavailable',
  'runtime-rejected': 'controlAvailability.reason.runtime-rejected',
  'stream-fallback': 'controlAvailability.reason.stream-fallback',
  'metadata-stale': 'controlAvailability.reason.metadata-stale',
};

const STATE_I18N_KEYS: Record<Exclude<ModelControlState, 'available'>, string> = {
  pending: 'controlAvailability.state.pending',
  disabled: 'controlAvailability.state.disabled',
  degraded: 'controlAvailability.state.degraded',
};

export function availableControl(): ModelControlAvailability {
  return AVAILABLE_CONTROL;
}

export function pendingControl(
  reason: ModelControlReason,
  diagnostic?: ModelControlDiagnostic,
): ModelControlAvailability {
  return diagnostic ? { state: 'pending', reason, diagnostic } : { state: 'pending', reason };
}

export function disabledControl(
  reason: ModelControlReason,
  diagnostic?: ModelControlDiagnostic,
): ModelControlAvailability {
  return diagnostic ? { state: 'disabled', reason, diagnostic } : { state: 'disabled', reason };
}

export function degradedControl(
  reason: ModelControlReason,
  retryable: boolean,
  diagnostic?: ModelControlDiagnostic,
): ModelControlAvailability {
  return diagnostic
    ? { state: 'degraded', reason, retryable, diagnostic }
    : { state: 'degraded', reason, retryable };
}

export function deriveModelControlAvailability(
  input: ModelControlAvailabilityInput,
): ModelControlAvailability {
  if (input.runtimeDiagnostic) {
    return availabilityFromRuntimeDiagnostic(input.runtimeDiagnostic);
  }
  if (input.engineReady === false) {
    return disabledControl('engine-not-ready');
  }
  if (input.sceneControlStatus && input.sceneControlStatus !== 'ready') {
    return input.sceneControlStatus === 'connecting'
      ? pendingControl('scene-control-disconnected')
      : disabledControl('scene-control-disconnected');
  }
  if (input.requiresSelection === true && input.hasSelection !== true) {
    return disabledControl('no-selection');
  }
  if (input.assetCompatible === false) {
    return disabledControl(input.incompatibilityReason ?? 'asset-not-character');
  }
  if (input.capability === false || input.capability === 'unsupported') {
    return disabledControl('capability-unsupported');
  }
  if (input.capability === 'unknown') {
    return disabledControl('capability-unknown');
  }
  return AVAILABLE_CONTROL;
}

export function isControlDisabled(availability: ModelControlAvailability): boolean {
  return availability.state !== 'available';
}

export function controlReasonI18nKey(reason: ModelControlReason): string {
  return REASON_I18N_KEYS[reason];
}

export function controlAvailabilityStateI18nKey(
  state: Exclude<ModelControlState, 'available'>,
): string {
  return STATE_I18N_KEYS[state];
}

export function formatControlAvailabilityTitle(
  availability: ModelControlAvailability,
  translate: (key: string) => string,
  baseTitle?: string,
): string {
  if (availability.state === 'available') {
    return baseTitle ?? '';
  }
  const stateLabel = translate(controlAvailabilityStateI18nKey(availability.state));
  const reasonLabel = translate(controlReasonI18nKey(availability.reason));
  const availabilityLabel = `${stateLabel}: ${reasonLabel}`;
  return baseTitle ? `${baseTitle} - ${availabilityLabel}` : availabilityLabel;
}

function availabilityFromRuntimeDiagnostic(
  diagnostic: RuntimeControlDiagnosticInput,
): ModelControlAvailability {
  switch (diagnostic.state) {
    case 'pending':
      return pendingControl(diagnostic.reason, diagnostic);
    case 'degraded':
      return degradedControl(diagnostic.reason, diagnostic.retryable ?? false, diagnostic);
    case 'disabled':
    case undefined:
      return disabledControl(diagnostic.reason, diagnostic);
  }
}
