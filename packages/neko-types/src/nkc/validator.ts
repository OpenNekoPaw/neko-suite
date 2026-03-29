// =============================================================================
// NKC Format SDK — Validator
//
// Pure-function, zero-dependency validator for NKC canvas data.
// Produces field-path-based errors and warnings.
// =============================================================================

import type { ValidationResult, ValidationError } from '../config/config-adapter';

// =============================================================================
// Type Guards (internal helpers)
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
// Allowed values
// =============================================================================

const ALLOWED_NODE_TYPES = new Set([
  // Core nodes
  'media',
  'storyboard',
  'annotation',
  'group',
  // Rich content
  'text',
  'artboard',
  // Storyboard system
  'shot',
  'scene',
  'gallery',
  // Content reference
  'script',
  'document',
  'model',
  'canvas-embed',
]);

const ALLOWED_ANCHOR_VALUES = new Set(['top', 'right', 'bottom', 'left']);

// =============================================================================
// Validate options
// =============================================================================

export interface NkcValidateOptions {
  /** When true, treat warnings as errors */
  strict?: boolean;
}

// =============================================================================
// Internal validators
// =============================================================================

function validateRoot(
  data: Record<string, unknown>,
  errors: ValidationError[],
  _warnings: ValidationError[],
): void {
  // version — required string
  if (!isString(data['version'])) {
    errors.push({ field: 'version', message: 'must be a string', severity: 'error' });
  }

  // name — required string
  if (!isString(data['name'])) {
    errors.push({ field: 'name', message: 'must be a string', severity: 'error' });
  }

  // nodes — required array
  if (!isArray(data['nodes'])) {
    errors.push({ field: 'nodes', message: 'must be an array', severity: 'error' });
  }

  // connections — required array
  if (!isArray(data['connections'])) {
    errors.push({ field: 'connections', message: 'must be an array', severity: 'error' });
  }

  // viewport — optional object
  if (data['viewport'] !== undefined) {
    validateViewport(data['viewport'], 'viewport', errors);
  }

  // linkedProject — optional string
  if (data['linkedProject'] !== undefined && !isString(data['linkedProject'])) {
    errors.push({ field: 'linkedProject', message: 'must be a string', severity: 'error' });
  }
}

function validateViewport(viewport: unknown, path: string, errors: ValidationError[]): void {
  if (!isRecord(viewport)) {
    errors.push({ field: path, message: 'must be an object', severity: 'error' });
    return;
  }

  // pan — required object with x/y
  const pan = viewport['pan'];
  if (!isRecord(pan)) {
    errors.push({ field: `${path}.pan`, message: 'must be an object', severity: 'error' });
  } else {
    if (!isNumber(pan['x'])) {
      errors.push({ field: `${path}.pan.x`, message: 'must be a number', severity: 'error' });
    }
    if (!isNumber(pan['y'])) {
      errors.push({ field: `${path}.pan.y`, message: 'must be a number', severity: 'error' });
    }
  }

  // zoom — required number
  if (!isNumber(viewport['zoom'])) {
    errors.push({ field: `${path}.zoom`, message: 'must be a number', severity: 'error' });
  }
}

function validateNode(
  node: unknown,
  path: string,
  errors: ValidationError[],
  warnings: ValidationError[],
): void {
  if (!isRecord(node)) {
    errors.push({ field: path, message: 'must be an object', severity: 'error' });
    return;
  }

  // id — required string
  if (!isString(node['id'])) {
    errors.push({ field: `${path}.id`, message: 'must be a string', severity: 'error' });
  }

  // type — required, must be in allowed set
  if (!isString(node['type'])) {
    errors.push({ field: `${path}.type`, message: 'must be a string', severity: 'error' });
  } else if (!ALLOWED_NODE_TYPES.has(node['type'])) {
    errors.push({
      field: `${path}.type`,
      message: `invalid node type: "${node['type']}"`,
      severity: 'error',
    });
  }

  // position — required object with x/y
  const position = node['position'];
  if (!isRecord(position)) {
    errors.push({ field: `${path}.position`, message: 'must be an object', severity: 'error' });
  } else {
    if (!isNumber(position['x'])) {
      errors.push({ field: `${path}.position.x`, message: 'must be a number', severity: 'error' });
    }
    if (!isNumber(position['y'])) {
      errors.push({ field: `${path}.position.y`, message: 'must be a number', severity: 'error' });
    }
  }

  // size — required object with width/height
  const size = node['size'];
  if (!isRecord(size)) {
    errors.push({ field: `${path}.size`, message: 'must be an object', severity: 'error' });
  } else {
    if (!isNumber(size['width'])) {
      errors.push({ field: `${path}.size.width`, message: 'must be a number', severity: 'error' });
    }
    if (!isNumber(size['height'])) {
      errors.push({ field: `${path}.size.height`, message: 'must be a number', severity: 'error' });
    }
  }

  // zIndex — required number
  if (!isNumber(node['zIndex'])) {
    errors.push({ field: `${path}.zIndex`, message: 'must be a number', severity: 'error' });
  }

  // rotation — optional number
  if (node['rotation'] !== undefined && !isNumber(node['rotation'])) {
    errors.push({ field: `${path}.rotation`, message: 'must be a number', severity: 'error' });
  }

  // locked — optional boolean
  if (node['locked'] !== undefined && !isBoolean(node['locked'])) {
    errors.push({ field: `${path}.locked`, message: 'must be a boolean', severity: 'error' });
  }

  // ports — optional array
  if (node['ports'] !== undefined) {
    if (!isArray(node['ports'])) {
      errors.push({ field: `${path}.ports`, message: 'must be an array', severity: 'error' });
    } else {
      const ports = node['ports'];
      for (let i = 0; i < ports.length; i++) {
        validatePort(ports[i], `${path}.ports[${i}]`, errors, warnings);
      }
    }
  }
}

function validatePort(
  port: unknown,
  path: string,
  errors: ValidationError[],
  _warnings: ValidationError[],
): void {
  if (!isRecord(port)) {
    errors.push({ field: path, message: 'must be an object', severity: 'error' });
    return;
  }

  if (!isString(port['id'])) {
    errors.push({ field: `${path}.id`, message: 'must be a string', severity: 'error' });
  }

  if (!isString(port['type']) || (port['type'] !== 'input' && port['type'] !== 'output')) {
    errors.push({
      field: `${path}.type`,
      message: 'must be "input" or "output"',
      severity: 'error',
    });
  }

  if (!isString(port['position']) || !ALLOWED_ANCHOR_VALUES.has(port['position'])) {
    errors.push({
      field: `${path}.position`,
      message: 'must be a valid anchor position',
      severity: 'error',
    });
  }
}

function validateConnection(
  connection: unknown,
  path: string,
  errors: ValidationError[],
  _warnings: ValidationError[],
): void {
  if (!isRecord(connection)) {
    errors.push({ field: path, message: 'must be an object', severity: 'error' });
    return;
  }

  // id — required string
  if (!isString(connection['id'])) {
    errors.push({ field: `${path}.id`, message: 'must be a string', severity: 'error' });
  }

  // sourceId — required string
  if (!isString(connection['sourceId'])) {
    errors.push({ field: `${path}.sourceId`, message: 'must be a string', severity: 'error' });
  }

  // sourceAnchor — required, must be valid anchor
  if (
    !isString(connection['sourceAnchor']) ||
    !ALLOWED_ANCHOR_VALUES.has(connection['sourceAnchor'])
  ) {
    errors.push({
      field: `${path}.sourceAnchor`,
      message: 'must be a valid anchor position',
      severity: 'error',
    });
  }

  // targetId — required string
  if (!isString(connection['targetId'])) {
    errors.push({ field: `${path}.targetId`, message: 'must be a string', severity: 'error' });
  }

  // targetAnchor — required, must be valid anchor
  if (
    !isString(connection['targetAnchor']) ||
    !ALLOWED_ANCHOR_VALUES.has(connection['targetAnchor'])
  ) {
    errors.push({
      field: `${path}.targetAnchor`,
      message: 'must be a valid anchor position',
      severity: 'error',
    });
  }
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Validate raw unknown data as NKC format.
 *
 * Use this when loading from JSON.parse() result before casting to CanvasData.
 */
export function validateNkc(data: unknown, options: NkcValidateOptions = {}): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  if (!isRecord(data)) {
    return {
      valid: false,
      errors: [{ field: '', message: 'data must be an object', severity: 'error' }],
      warnings: [],
    };
  }

  validateRoot(data, errors, warnings);

  // Validate nodes if root nodes is an array
  const nodes = data['nodes'];
  if (isArray(nodes)) {
    for (let i = 0; i < nodes.length; i++) {
      validateNode(nodes[i], `nodes[${i}]`, errors, warnings);
    }
  }

  // Validate connections if root connections is an array
  const connections = data['connections'];
  if (isArray(connections)) {
    for (let i = 0; i < connections.length; i++) {
      validateConnection(connections[i], `connections[${i}]`, errors, warnings);
    }
  }

  const effectiveErrors = options.strict ? [...errors, ...warnings] : errors;

  return {
    valid: effectiveErrors.length === 0,
    errors: effectiveErrors.filter((e) => e.severity === 'error'),
    warnings: options.strict ? [] : warnings,
  };
}
