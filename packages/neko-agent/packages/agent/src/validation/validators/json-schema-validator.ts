/**
 * JSON Schema Validator
 *
 * Validates JSON content against JSON Schema using ajv
 */

import type { ValidationError, ValidationWarning, ValidationResult } from '../types';

/**
 * Ajv validate function type with errors property
 */
type AjvValidateFunction = {
  (data: unknown): boolean;
  errors?: Array<{ message?: string; instancePath?: string }> | null;
};

/**
 * Ajv module type for dynamic import
 */
type AjvModule = {
  default: new (options?: Record<string, unknown>) => {
    compile: (schema: object) => AjvValidateFunction;
  };
};

/**
 * Cached ajv module
 */
let ajvModule: AjvModule | null = null;
let ajvLoadFailed = false;

/**
 * JSON Schema validation result
 */
export interface JsonSchemaValidationResult {
  valid: boolean;
  errors?: Array<{ path: string; message: string }>;
}

/**
 * JSON Schema validator interface
 */
export interface IJsonSchemaValidator {
  /**
   * Validate data against JSON Schema
   */
  validate(data: unknown, schema: object): Promise<JsonSchemaValidationResult>;

  /**
   * Check if ajv library is available
   */
  isLibraryAvailable(): Promise<boolean>;
}

/**
 * JSON Schema validator implementation
 */
export class JsonSchemaValidator implements IJsonSchemaValidator {
  /**
   * Validate data against JSON Schema
   */
  async validate(data: unknown, schema: object): Promise<JsonSchemaValidationResult> {
    const Ajv = await this.loadAjv();

    if (!Ajv) {
      // Return valid if library not available (skip validation)
      return { valid: true };
    }

    try {
      const ajv = new Ajv({ allErrors: true });
      const validate = ajv.compile(schema);
      const valid = validate(data);

      if (!valid && validate.errors) {
        const errors: Array<{ path: string; message: string }> = [];
        for (const err of validate.errors) {
          errors.push({
            path: err.instancePath || '/',
            message: err.message || 'Unknown error',
          });
        }
        return { valid: false, errors };
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        errors: [
          {
            path: '/',
            message: `Schema compilation error: ${error instanceof Error ? error.message : 'Unknown error'}`,
          },
        ],
      };
    }
  }

  /**
   * Check if ajv library is available
   */
  async isLibraryAvailable(): Promise<boolean> {
    const ajv = await this.loadAjv();
    return ajv !== null;
  }

  /**
   * Load ajv module dynamically
   */
  private async loadAjv(): Promise<AjvModule['default'] | null> {
    if (ajvLoadFailed) {
      return null;
    }

    if (ajvModule) {
      return ajvModule.default;
    }

    try {
      ajvModule = (await import('ajv')) as AjvModule;
      return ajvModule.default;
    } catch {
      ajvLoadFailed = true;
      return null;
    }
  }
}

/**
 * Validate JSON content against schema, returning ValidationResult format
 */
export async function validateJsonAgainstSchema(
  content: unknown,
  schema: object
): Promise<ValidationResult> {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  const validator = new JsonSchemaValidator();
  const isAvailable = await validator.isLibraryAvailable();

  if (!isAvailable) {
    warnings.push({
      type: 'schema',
      code: 'AJV_UNAVAILABLE',
      message: 'JSON Schema validation skipped: ajv library not available',
    });
    return { errors, warnings };
  }

  const result = await validator.validate(content, schema);

  if (!result.valid && result.errors) {
    for (const err of result.errors) {
      errors.push({
        type: 'schema',
        code: 'SCHEMA_VALIDATION_ERROR',
        message: `Schema validation failed: ${err.message}`,
        details: { path: err.path },
      });
    }
  }

  return { errors, warnings };
}

/**
 * Create a JSON schema validator instance
 */
export function createJsonSchemaValidator(): IJsonSchemaValidator {
  return new JsonSchemaValidator();
}
