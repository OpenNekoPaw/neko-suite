import type { AgentContext } from '@neko/shared';
import type { ValidationError, ValidationWarning } from './types';

const OUTPUT_VALIDATION_REPAIR_REQUEST_METADATA_KEY = 'outputValidationRepairRequest';
const OUTPUT_VALIDATION_REPAIR_ATTEMPTS_METADATA_KEY = 'outputValidationRepairAttempts';

export interface OutputValidationRepairRequest {
  readonly kind: 'output-validation-repair';
  readonly reason: 'artifact-validator';
  readonly attempt: number;
  readonly validators: readonly string[];
  readonly errors: readonly ValidationError[];
  readonly warnings: readonly ValidationWarning[];
  readonly instruction: string;
}

export interface QueueOutputValidationRepairRequestInput {
  readonly context: AgentContext;
  readonly validators: readonly string[];
  readonly errors: readonly ValidationError[];
  readonly warnings: readonly ValidationWarning[];
  readonly instruction: string;
}

export function queueOutputValidationRepairRequest(
  input: QueueOutputValidationRepairRequestInput,
): OutputValidationRepairRequest {
  const attempt = readOutputValidationRepairAttemptCount(input.context) + 1;
  const request: OutputValidationRepairRequest = {
    kind: 'output-validation-repair',
    reason: 'artifact-validator',
    attempt,
    validators: [...input.validators],
    errors: [...input.errors],
    warnings: [...input.warnings],
    instruction: input.instruction,
  };

  input.context.metadata = {
    ...input.context.metadata,
    [OUTPUT_VALIDATION_REPAIR_REQUEST_METADATA_KEY]: request,
    [OUTPUT_VALIDATION_REPAIR_ATTEMPTS_METADATA_KEY]: attempt,
  };
  input.context.messages.push({ role: 'user', content: input.instruction });

  return request;
}

export function consumeOutputValidationRepairRequest(
  context: AgentContext,
): OutputValidationRepairRequest | null {
  const value = context.metadata[OUTPUT_VALIDATION_REPAIR_REQUEST_METADATA_KEY];
  if (!isOutputValidationRepairRequest(value)) {
    return null;
  }

  const { [OUTPUT_VALIDATION_REPAIR_REQUEST_METADATA_KEY]: _removed, ...metadata } =
    context.metadata;
  void _removed;
  context.metadata = metadata;
  return value;
}

export function readOutputValidationRepairAttemptCount(context: AgentContext): number {
  const value = context.metadata[OUTPUT_VALIDATION_REPAIR_ATTEMPTS_METADATA_KEY];
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 0;
}

function isOutputValidationRepairRequest(value: unknown): value is OutputValidationRepairRequest {
  if (!isRecord(value)) return false;
  return (
    value['kind'] === 'output-validation-repair' &&
    value['reason'] === 'artifact-validator' &&
    typeof value['attempt'] === 'number' &&
    Array.isArray(value['validators']) &&
    Array.isArray(value['errors']) &&
    Array.isArray(value['warnings']) &&
    typeof value['instruction'] === 'string'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
