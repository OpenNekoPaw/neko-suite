// =============================================================================
// NKPROJ Format SDK — Validator
//
// Mirrors the nkplan validator pattern: structural checks for the wire JSON
// shape with severity-tagged errors / warnings.  No I/O.
// =============================================================================

import type {
  NkProj,
  NkprojArtifactRef,
  NkprojUpgradeEvent,
  NkprojValidateOptions,
  NkprojVersion,
  NkprojWorkflowPrefs,
  ValidationError,
  ValidationResult,
} from './types';

const ARTIFACT_KINDS = new Set<string>(['script', 'canvas', 'timeline', 'plan', 'asset']);
const ROUTE_LEVELS = new Set<string>(['L0', 'L1', 'L2', 'L3', 'L4']);
const RENDER_MODES = new Set<string>(['pure-render', 'render-then-ai', 'reference-only']);
const SUPPORTED_VERSIONS = new Set<string>(['1.0']);

// =============================================================================
// Entry
// =============================================================================

export function validateNkproj(
  data: unknown,
  options: NkprojValidateOptions = {},
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  if (!isRecord(data)) {
    errors.push({ field: '', message: 'Root must be an object', severity: 'error' });
    return { valid: false, errors, warnings };
  }

  // version
  const v = data['version'];
  if (!isString(v)) {
    errors.push({ field: 'version', message: 'Must be a string', severity: 'error' });
  } else if (!SUPPORTED_VERSIONS.has(v)) {
    warnings.push({
      field: 'version',
      message: `Unknown version ${v} — migrator will best-effort upgrade`,
      severity: 'warning',
    });
  }

  // id / name / timestamps
  requireString(data, 'id', errors, 'id');
  requireString(data, 'name', errors, 'name');
  requireNumber(data, 'createdAt', errors, 'createdAt');
  requireNumber(data, 'updatedAt', errors, 'updatedAt');

  // optional description / workDir / parentProjectId / notes
  if (data['description'] !== undefined && !isString(data['description'])) {
    errors.push({ field: 'description', message: 'Must be a string', severity: 'error' });
  }
  if (data['workDir'] !== undefined && !isString(data['workDir'])) {
    errors.push({ field: 'workDir', message: 'Must be a string', severity: 'error' });
  }
  if (data['parentProjectId'] !== undefined && !isString(data['parentProjectId'])) {
    errors.push({
      field: 'parentProjectId',
      message: 'Must be a string',
      severity: 'error',
    });
  }
  if (data['notes'] !== undefined) {
    if (!isArray(data['notes'])) {
      errors.push({ field: 'notes', message: 'Must be an array of strings', severity: 'error' });
    } else {
      data['notes'].forEach((n, i) => {
        if (!isString(n)) {
          errors.push({ field: `notes[${i}]`, message: 'Must be a string', severity: 'error' });
        }
      });
    }
  }

  // artifacts (required, must be an array — entries may be empty)
  const artifacts = data['artifacts'];
  if (!isArray(artifacts)) {
    errors.push({ field: 'artifacts', message: 'Must be an array', severity: 'error' });
  } else {
    const seenIds = new Set<string>();
    artifacts.forEach((a, i) => validateArtifact(a, `artifacts[${i}]`, errors, warnings, seenIds));
  }

  // upgradeHistory (optional)
  if (data['upgradeHistory'] !== undefined) {
    if (!isArray(data['upgradeHistory'])) {
      errors.push({
        field: 'upgradeHistory',
        message: 'Must be an array',
        severity: 'error',
      });
    } else {
      data['upgradeHistory'].forEach((u, i) =>
        validateUpgradeEvent(u, `upgradeHistory[${i}]`, errors),
      );
    }
  }

  // workflow (optional record)
  if (data['workflow'] !== undefined) {
    if (!isRecord(data['workflow'])) {
      errors.push({ field: 'workflow', message: 'Must be an object', severity: 'error' });
    } else {
      validateWorkflowPrefs(data['workflow'], 'workflow', errors);
    }
  }

  if (options.strict) {
    errors.push(...warnings);
    warnings.length = 0;
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Throwing variant used by `saveNkproj` — narrows the result to a structural
 * NkProj when valid, surfaces a plain Error message otherwise.
 */
export function validateNkprojStruct(data: unknown): ValidationResult {
  return validateNkproj(data);
}

export function detectVersion(data: unknown): NkprojVersion | undefined {
  if (!isRecord(data)) return undefined;
  const v = data['version'];
  if (v === '1.0') return '1.0';
  return undefined;
}

// =============================================================================
// Sub-validators
// =============================================================================

function validateArtifact(
  data: unknown,
  field: string,
  errors: ValidationError[],
  warnings: ValidationError[],
  seenIds: Set<string>,
): void {
  if (!isRecord(data)) {
    errors.push({ field, message: 'Must be an object', severity: 'error' });
    return;
  }
  const id = data['id'];
  if (!isString(id) || id.length === 0) {
    errors.push({ field: `${field}.id`, message: 'Must be a non-empty string', severity: 'error' });
  } else if (seenIds.has(id)) {
    errors.push({
      field: `${field}.id`,
      message: `Duplicate artifact id "${id}"`,
      severity: 'error',
    });
  } else {
    seenIds.add(id);
  }

  const kind = data['kind'];
  if (!isString(kind) || !ARTIFACT_KINDS.has(kind)) {
    errors.push({
      field: `${field}.kind`,
      message: `Invalid artifact kind ${String(kind)}`,
      severity: 'error',
    });
  }

  const path = data['path'];
  if (!isString(path) || path.length === 0) {
    errors.push({
      field: `${field}.path`,
      message: 'Must be a non-empty string',
      severity: 'error',
    });
  } else if (path.startsWith('/') || /^[A-Za-z]:[\\/]/.test(path)) {
    warnings.push({
      field: `${field}.path`,
      message: 'Absolute path — workspace-relative is preferred for portability',
      severity: 'warning',
    });
  }

  if (data['label'] !== undefined && !isString(data['label'])) {
    errors.push({ field: `${field}.label`, message: 'Must be a string', severity: 'error' });
  }
  if (data['checksum'] !== undefined && !isString(data['checksum'])) {
    errors.push({
      field: `${field}.checksum`,
      message: 'Must be a string',
      severity: 'error',
    });
  }
  if (data['producedByRouteLevel'] !== undefined) {
    const lvl = data['producedByRouteLevel'];
    if (!isString(lvl) || !ROUTE_LEVELS.has(lvl)) {
      errors.push({
        field: `${field}.producedByRouteLevel`,
        message: `Invalid route level ${String(lvl)}`,
        severity: 'error',
      });
    }
  }
  if (data['derivedFromArtifactId'] !== undefined && !isString(data['derivedFromArtifactId'])) {
    errors.push({
      field: `${field}.derivedFromArtifactId`,
      message: 'Must be a string',
      severity: 'error',
    });
  }
  if (data['tags'] !== undefined) {
    if (!isArray(data['tags'])) {
      errors.push({
        field: `${field}.tags`,
        message: 'Must be an array of strings',
        severity: 'error',
      });
    } else {
      data['tags'].forEach((t, i) => {
        if (!isString(t)) {
          errors.push({
            field: `${field}.tags[${i}]`,
            message: 'Must be a string',
            severity: 'error',
          });
        }
      });
    }
  }
}

function validateUpgradeEvent(data: unknown, field: string, errors: ValidationError[]): void {
  if (!isRecord(data)) {
    errors.push({ field, message: 'Must be an object', severity: 'error' });
    return;
  }
  requireNumber(data, 'at', errors, `${field}.at`);
  const toLevel = data['toLevel'];
  if (!isString(toLevel) || !ROUTE_LEVELS.has(toLevel)) {
    errors.push({
      field: `${field}.toLevel`,
      message: `Invalid route level ${String(toLevel)}`,
      severity: 'error',
    });
  }
  if (data['fromLevel'] !== undefined) {
    const fromLevel = data['fromLevel'];
    if (!isString(fromLevel) || !ROUTE_LEVELS.has(fromLevel)) {
      errors.push({
        field: `${field}.fromLevel`,
        message: `Invalid route level ${String(fromLevel)}`,
        severity: 'error',
      });
    }
  }
  const ids = data['addedArtifactIds'];
  if (!isArray(ids)) {
    errors.push({
      field: `${field}.addedArtifactIds`,
      message: 'Must be an array of strings',
      severity: 'error',
    });
  } else {
    ids.forEach((x, i) => {
      if (!isString(x)) {
        errors.push({
          field: `${field}.addedArtifactIds[${i}]`,
          message: 'Must be a string',
          severity: 'error',
        });
      }
    });
  }
  if (data['reason'] !== undefined && !isString(data['reason'])) {
    errors.push({ field: `${field}.reason`, message: 'Must be a string', severity: 'error' });
  }
  if (data['by'] !== undefined && !isString(data['by'])) {
    errors.push({ field: `${field}.by`, message: 'Must be a string', severity: 'error' });
  }
}

function validateWorkflowPrefs(
  data: Record<string, unknown>,
  field: string,
  errors: ValidationError[],
): void {
  if (data['pinnedRouteLevel'] !== undefined) {
    const lvl = data['pinnedRouteLevel'];
    if (!isString(lvl) || !ROUTE_LEVELS.has(lvl)) {
      errors.push({
        field: `${field}.pinnedRouteLevel`,
        message: `Invalid route level ${String(lvl)}`,
        severity: 'error',
      });
    }
  }
  if (data['defaultRenderMode'] !== undefined) {
    const m = data['defaultRenderMode'];
    if (!isString(m) || !RENDER_MODES.has(m)) {
      errors.push({
        field: `${field}.defaultRenderMode`,
        message: `Invalid render mode ${String(m)}`,
        severity: 'error',
      });
    }
  }
  if (data['autoApproveThreshold'] !== undefined) {
    const n = data['autoApproveThreshold'];
    if (typeof n !== 'number' || !Number.isFinite(n) || n < 0 || n > 1.1) {
      errors.push({
        field: `${field}.autoApproveThreshold`,
        message: 'Must be a number in [0, 1.1]',
        severity: 'error',
      });
    }
  }
  if (data['defaultSkipStages'] !== undefined) {
    if (!isArray(data['defaultSkipStages'])) {
      errors.push({
        field: `${field}.defaultSkipStages`,
        message: 'Must be an array of strings',
        severity: 'error',
      });
    } else {
      data['defaultSkipStages'].forEach((s, i) => {
        if (!isString(s)) {
          errors.push({
            field: `${field}.defaultSkipStages[${i}]`,
            message: 'Must be a string',
            severity: 'error',
          });
        }
      });
    }
  }
}

// =============================================================================
// Helpers (mirror nkplan/validator.ts internals)
// =============================================================================

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function isArray(x: unknown): x is unknown[] {
  return Array.isArray(x);
}

function isString(x: unknown): x is string {
  return typeof x === 'string';
}

function requireString(
  data: Record<string, unknown>,
  key: string,
  errors: ValidationError[],
  field: string,
): void {
  const v = data[key];
  if (!isString(v)) {
    errors.push({ field, message: 'Must be a string', severity: 'error' });
  }
}

function requireNumber(
  data: Record<string, unknown>,
  key: string,
  errors: ValidationError[],
  field: string,
): void {
  const v = data[key];
  if (typeof v !== 'number' || !Number.isFinite(v)) {
    errors.push({ field, message: 'Must be a finite number', severity: 'error' });
  }
}

// =============================================================================
// Re-exports for consumers
// =============================================================================

export type {
  NkProj,
  NkprojArtifactRef,
  NkprojUpgradeEvent,
  NkprojValidateOptions,
  NkprojWorkflowPrefs,
};
