// =============================================================================
// NKPLAN Format SDK — Validator
//
// Pure-function, zero-dependency validator for .nkplan data. Produces
// field-path-based errors and warnings.
//
// See docs/architecture/plan-mode.md §5 for the schema.
// =============================================================================

import type { ValidationError, ValidationResult } from '../config/config-adapter';
import type {
  NkPlan,
  NkplanBindingCandidate,
  NkplanBindingSlot,
  NkplanConstraint,
  NkplanRoute,
  NkplanShotBindings,
  NkplanStage,
  NkplanStatus,
  NkplanValidateOptions,
  NkplanVersion,
} from './types';

// =============================================================================
// Primitive guards
// =============================================================================

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function isString(v: unknown): v is string {
  return typeof v === 'string';
}
function isNumber(v: unknown): v is number {
  return typeof v === 'number' && !Number.isNaN(v);
}
function isBoolean(v: unknown): v is boolean {
  return typeof v === 'boolean';
}
function isArray(v: unknown): v is unknown[] {
  return Array.isArray(v);
}

// =============================================================================
// Enumerated values
// =============================================================================

const ROUTE_LEVELS = new Set<string>(['L0', 'L1', 'L2', 'L3', 'L4']);
const BINDING_SLOTS = new Set<string>(['character', 'scene', 'action', 'prop', 'style']);
const BINDING_PROVENANCE = new Set<string>(['L1', 'L2', 'L3', 'L4', 'L5', 'user']);
const ROUTE_PROVENANCE = new Set<string>(['rules', 'llm', 'user-override', 'memory']);
const EXTENSION_IDS = new Set<string>(['agent', 'story', 'canvas', 'sketch', 'cut', 'preview']);
const STATUSES = new Set<NkplanStatus>([
  'pending',
  'approved',
  'executing',
  'paused',
  'edited',
  'completed',
  'aborted',
  'failed',
]);
const CONSTRAINT_KINDS = new Set<string>([
  'character_lock',
  'time_progression',
  'costume_continuity',
  'style_lock',
  'prop_consistency',
]);
const REFERENCE_CHAIN_STRATEGIES = new Set<string>(['sequential', 'anchored', 'hybrid']);

// =============================================================================
// Entry
// =============================================================================

export function validateNkplan(
  data: unknown,
  options: NkplanValidateOptions = {},
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  if (!isRecord(data)) {
    errors.push({ field: '', message: 'Root must be an object', severity: 'error' });
    return { valid: false, errors, warnings };
  }

  // version
  const version = data['version'];
  if (!isString(version)) {
    errors.push({ field: 'version', message: 'Missing or invalid version', severity: 'error' });
  } else if (version !== '1.0') {
    warnings.push({
      field: 'version',
      message: `Unknown version "${version}"; attempting best-effort load`,
      severity: 'warning',
    });
  }

  // id / createdAt / updatedAt
  requireString(data, 'id', errors);
  requireNumber(data, 'createdAt', errors);
  requireNumber(data, 'updatedAt', errors);

  // status
  const status = data['status'];
  if (!isString(status) || !STATUSES.has(status as NkplanStatus)) {
    errors.push({
      field: 'status',
      message: `Invalid status: ${String(status)}`,
      severity: 'error',
    });
  }

  // statusHistory
  const history = data['statusHistory'];
  if (!isArray(history)) {
    errors.push({ field: 'statusHistory', message: 'Must be an array', severity: 'error' });
  } else {
    history.forEach((event, i) => {
      if (!isRecord(event)) {
        errors.push({
          field: `statusHistory[${i}]`,
          message: 'Must be an object',
          severity: 'error',
        });
        return;
      }
      const s = event['status'];
      if (!isString(s) || !STATUSES.has(s as NkplanStatus)) {
        errors.push({
          field: `statusHistory[${i}].status`,
          message: `Invalid status ${String(s)}`,
          severity: 'error',
        });
      }
      if (!isNumber(event['at'])) {
        errors.push({
          field: `statusHistory[${i}].at`,
          message: 'Must be a number (timestamp)',
          severity: 'error',
        });
      }
    });
  }

  // parentPlanId (optional)
  if (data['parentPlanId'] !== undefined && !isString(data['parentPlanId'])) {
    errors.push({ field: 'parentPlanId', message: 'Must be a string', severity: 'error' });
  }

  // project (optional)
  if (data['project'] !== undefined) {
    if (!isRecord(data['project'])) {
      errors.push({ field: 'project', message: 'Must be an object', severity: 'error' });
    } else {
      requireString(data['project'], 'path', errors, 'project.path');
    }
  }

  // route
  const route = data['route'];
  if (!isRecord(route)) {
    errors.push({ field: 'route', message: 'Missing route object', severity: 'error' });
  } else {
    validateRoute(route, errors);
  }

  // stages
  const stages = data['stages'];
  if (!isArray(stages)) {
    errors.push({ field: 'stages', message: 'Must be an array', severity: 'error' });
  } else {
    stages.forEach((s, i) => validateStage(s, `stages[${i}]`, errors));
  }

  // shots (optional)
  if (data['shots'] !== undefined) {
    if (!isArray(data['shots'])) {
      errors.push({ field: 'shots', message: 'Must be an array', severity: 'error' });
    } else {
      data['shots'].forEach((s, i) => validateShot(s, `shots[${i}]`, errors, warnings));
    }
  }

  // constraints (optional)
  if (data['constraints'] !== undefined) {
    if (!isArray(data['constraints'])) {
      errors.push({ field: 'constraints', message: 'Must be an array', severity: 'error' });
    } else {
      data['constraints'].forEach((c, i) => validateConstraint(c, `constraints[${i}]`, errors));
    }
  }

  // referenceChain (optional)
  if (data['referenceChain'] !== undefined) {
    if (!isArray(data['referenceChain'])) {
      errors.push({
        field: 'referenceChain',
        message: 'Must be an array',
        severity: 'error',
      });
    } else {
      data['referenceChain'].forEach((e, i) =>
        validateReferenceChainEntry(e, `referenceChain[${i}]`, errors),
      );
    }
  }

  // notes (optional)
  if (data['notes'] !== undefined) {
    if (!isArray(data['notes'])) {
      errors.push({ field: 'notes', message: 'Must be an array of strings', severity: 'error' });
    } else {
      data['notes'].forEach((n, i) => {
        if (!isString(n)) {
          errors.push({
            field: `notes[${i}]`,
            message: 'Must be a string',
            severity: 'error',
          });
        }
      });
    }
  }

  // pipelineId / errorMessage (optional strings)
  if (data['pipelineId'] !== undefined && !isString(data['pipelineId'])) {
    errors.push({ field: 'pipelineId', message: 'Must be a string', severity: 'error' });
  }
  if (data['errorMessage'] !== undefined && !isString(data['errorMessage'])) {
    errors.push({ field: 'errorMessage', message: 'Must be a string', severity: 'error' });
  }

  if (options.strict) {
    errors.push(...warnings);
    warnings.length = 0;
  }
  return { valid: errors.length === 0, errors, warnings };
}

/** Type-narrowed variant for pre-validated plans (throws if invalid). */
export function validateNkplanStruct(
  plan: NkPlan,
  options: NkplanValidateOptions = {},
): ValidationResult {
  return validateNkplan(plan as unknown, options);
}

// =============================================================================
// Sub-validators
// =============================================================================

function requireString(
  obj: Record<string, unknown>,
  key: string,
  errors: ValidationError[],
  fieldPath?: string,
): void {
  if (!isString(obj[key])) {
    errors.push({
      field: fieldPath ?? key,
      message: `Missing or invalid ${key}`,
      severity: 'error',
    });
  }
}

function requireNumber(
  obj: Record<string, unknown>,
  key: string,
  errors: ValidationError[],
  fieldPath?: string,
): void {
  if (!isNumber(obj[key])) {
    errors.push({
      field: fieldPath ?? key,
      message: `Missing or invalid ${key}`,
      severity: 'error',
    });
  }
}

function validateRoute(route: Record<string, unknown>, errors: ValidationError[]): void {
  const level = route['level'];
  if (!isString(level) || !ROUTE_LEVELS.has(level)) {
    errors.push({
      field: 'route.level',
      message: `Invalid level ${String(level)}`,
      severity: 'error',
    });
  }
  requireString(route, 'flowId', errors, 'route.flowId');
  const entry = route['entryExtension'];
  if (!isString(entry) || !EXTENSION_IDS.has(entry)) {
    errors.push({
      field: 'route.entryExtension',
      message: `Invalid entryExtension ${String(entry)}`,
      severity: 'error',
    });
  }
  if (!isArray(route['skipStages'])) {
    errors.push({ field: 'route.skipStages', message: 'Must be an array', severity: 'error' });
  } else {
    (route['skipStages'] as unknown[]).forEach((s, i) => {
      if (!isString(s)) {
        errors.push({
          field: `route.skipStages[${i}]`,
          message: 'Must be a string',
          severity: 'error',
        });
      }
    });
  }
  requireString(route, 'reason', errors, 'route.reason');
  const conf = route['confidence'];
  if (!isNumber(conf) || conf < 0 || conf > 1) {
    errors.push({
      field: 'route.confidence',
      message: 'Must be a number in [0, 1]',
      severity: 'error',
    });
  }
  const prov = route['provenance'];
  if (!isString(prov) || !ROUTE_PROVENANCE.has(prov)) {
    errors.push({
      field: 'route.provenance',
      message: `Invalid provenance ${String(prov)}`,
      severity: 'error',
    });
  }
}

function validateStage(stage: unknown, field: string, errors: ValidationError[]): void {
  if (!isRecord(stage)) {
    errors.push({ field, message: 'Must be an object', severity: 'error' });
    return;
  }
  requireString(stage, 'id', errors, `${field}.id`);
  requireString(stage, 'label', errors, `${field}.label`);
  if (!isBoolean(stage['skipped'])) {
    errors.push({ field: `${field}.skipped`, message: 'Must be a boolean', severity: 'error' });
  }
  if (stage['userCheckpoint'] !== undefined && !isBoolean(stage['userCheckpoint'])) {
    errors.push({
      field: `${field}.userCheckpoint`,
      message: 'Must be a boolean',
      severity: 'error',
    });
  }
  if (stage['estimate'] !== undefined) {
    const est = stage['estimate'];
    if (!isRecord(est)) {
      errors.push({ field: `${field}.estimate`, message: 'Must be an object', severity: 'error' });
    } else {
      for (const k of ['tokens', 'credits', 'durationSec']) {
        if (est[k] !== undefined && !isNumber(est[k])) {
          errors.push({
            field: `${field}.estimate.${k}`,
            message: 'Must be a number',
            severity: 'error',
          });
        }
      }
    }
  }
}

function validateShot(
  shot: unknown,
  field: string,
  errors: ValidationError[],
  warnings: ValidationError[],
): void {
  if (!isRecord(shot)) {
    errors.push({ field, message: 'Must be an object', severity: 'error' });
    return;
  }
  requireString(shot, 'shotId', errors, `${field}.shotId`);
  const primary = shot['primary'];
  if (!isRecord(primary)) {
    errors.push({
      field: `${field}.primary`,
      message: 'Must be an object',
      severity: 'error',
    });
  } else {
    validateBindingMap(primary, `${field}.primary`, errors);
  }
  const alts = shot['alternatives'];
  if (alts !== undefined) {
    if (!isRecord(alts)) {
      errors.push({
        field: `${field}.alternatives`,
        message: 'Must be an object',
        severity: 'error',
      });
    } else {
      for (const [slot, list] of Object.entries(alts)) {
        if (!BINDING_SLOTS.has(slot)) {
          warnings.push({
            field: `${field}.alternatives.${slot}`,
            message: `Unknown binding slot "${slot}"`,
            severity: 'warning',
          });
        }
        if (!isArray(list)) {
          errors.push({
            field: `${field}.alternatives.${slot}`,
            message: 'Must be an array',
            severity: 'error',
          });
        } else {
          list.forEach((c, i) => {
            validateBindingCandidate(c, `${field}.alternatives.${slot}[${i}]`, errors);
          });
        }
      }
    }
  }
  if (!isArray(shot['unmatched'])) {
    errors.push({
      field: `${field}.unmatched`,
      message: 'Must be an array',
      severity: 'error',
    });
  } else {
    (shot['unmatched'] as unknown[]).forEach((slot, i) => {
      if (!isString(slot) || !BINDING_SLOTS.has(slot)) {
        errors.push({
          field: `${field}.unmatched[${i}]`,
          message: `Invalid slot ${String(slot)}`,
          severity: 'error',
        });
      }
    });
  }
}

function validateBindingMap(
  map: Record<string, unknown>,
  field: string,
  errors: ValidationError[],
): void {
  for (const [slot, candidate] of Object.entries(map)) {
    if (!BINDING_SLOTS.has(slot)) {
      errors.push({
        field: `${field}.${slot}`,
        message: `Invalid slot ${slot}`,
        severity: 'error',
      });
      continue;
    }
    validateBindingCandidate(candidate, `${field}.${slot}`, errors);
  }
}

function validateBindingCandidate(c: unknown, field: string, errors: ValidationError[]): void {
  if (!isRecord(c)) {
    errors.push({ field, message: 'Must be an object', severity: 'error' });
    return;
  }
  const slot = c['slot'];
  if (!isString(slot) || !BINDING_SLOTS.has(slot)) {
    errors.push({
      field: `${field}.slot`,
      message: `Invalid slot ${String(slot)}`,
      severity: 'error',
    });
  }
  requireString(c, 'entityId', errors, `${field}.entityId`);
  requireString(c, 'assetId', errors, `${field}.assetId`);
  const prov = c['provenance'];
  if (!isString(prov) || !BINDING_PROVENANCE.has(prov)) {
    errors.push({
      field: `${field}.provenance`,
      message: `Invalid provenance ${String(prov)}`,
      severity: 'error',
    });
  }
  const conf = c['confidence'];
  if (!isNumber(conf) || conf < 0 || conf > 1) {
    errors.push({
      field: `${field}.confidence`,
      message: 'Must be in [0, 1]',
      severity: 'error',
    });
  }
}

function validateConstraint(c: unknown, field: string, errors: ValidationError[]): void {
  if (!isRecord(c)) {
    errors.push({ field, message: 'Must be an object', severity: 'error' });
    return;
  }
  requireString(c, 'id', errors, `${field}.id`);
  const kind = c['kind'];
  if (!isString(kind) || !CONSTRAINT_KINDS.has(kind)) {
    errors.push({
      field: `${field}.kind`,
      message: `Invalid constraint kind ${String(kind)}`,
      severity: 'error',
    });
  }
  requireString(c, 'entity', errors, `${field}.entity`);
  if (!isArray(c['shots'])) {
    errors.push({
      field: `${field}.shots`,
      message: 'Must be an array',
      severity: 'error',
    });
  }
  if (c['payload'] !== undefined && !isRecord(c['payload'])) {
    errors.push({
      field: `${field}.payload`,
      message: 'Must be an object',
      severity: 'error',
    });
  }
}

function validateReferenceChainEntry(
  entry: unknown,
  field: string,
  errors: ValidationError[],
): void {
  if (!isRecord(entry)) {
    errors.push({ field, message: 'Must be an object', severity: 'error' });
    return;
  }
  requireString(entry, 'shotId', errors, `${field}.shotId`);
  const slot = entry['slot'];
  if (!isString(slot) || !BINDING_SLOTS.has(slot)) {
    errors.push({
      field: `${field}.slot`,
      message: `Invalid slot ${String(slot)}`,
      severity: 'error',
    });
  }
  const strategy = entry['strategy'];
  if (!isString(strategy) || !REFERENCE_CHAIN_STRATEGIES.has(strategy)) {
    errors.push({
      field: `${field}.strategy`,
      message: `Invalid reference-chain strategy ${String(strategy)}`,
      severity: 'error',
    });
  }
  const refs = entry['references'];
  if (!isArray(refs)) {
    errors.push({
      field: `${field}.references`,
      message: 'Must be an array of shot ids',
      severity: 'error',
    });
  } else {
    refs.forEach((r, i) => {
      if (!isString(r)) {
        errors.push({
          field: `${field}.references[${i}]`,
          message: 'Must be a string',
          severity: 'error',
        });
      }
    });
  }
}

// =============================================================================
// Narrow typed accessors (never throw — used by codec for best-effort load)
// =============================================================================

export function detectVersion(data: unknown): NkplanVersion | undefined {
  if (!isRecord(data)) return undefined;
  const v = data['version'];
  if (!isString(v)) return undefined;
  if (v === '1.0') return '1.0';
  return undefined;
}

// Re-exports for consumers (type aliases are narrowed from `types.ts`)
export type {
  NkPlan,
  NkplanBindingCandidate,
  NkplanBindingSlot,
  NkplanConstraint,
  NkplanRoute,
  NkplanShotBindings,
  NkplanStage,
  NkplanStatus,
  NkplanValidateOptions,
  NkplanVersion,
};
