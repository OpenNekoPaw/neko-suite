/**
 * Stable hash of a RawInput — used to dedupe LLMRouter calls within a session
 * (and to key persisted router-memory entries).
 *
 * Hash inputs:
 *   - input.kind
 *   - input-specific primary field (text / path / paths / project path)
 *   - optional workDir (so the same prompt in two projects isn't confused)
 *
 * Stays inside `node:crypto` for determinism; no external dependency.
 */

import { createHash } from 'node:crypto';
import type { RawInput } from '../types';

export interface HashInputOptions {
  /** Optional workspace directory; when provided, mixed into the hash */
  workDir?: string;
  /** Truncate the returned hex string (default: full 64-char sha256 hex) */
  bytes?: number;
}

/**
 * Produce a stable hex digest for a RawInput.
 * Two calls with identical (input, workDir) always yield the same digest.
 */
export function hashInput(input: RawInput, options: HashInputOptions = {}): string {
  const payload = canonicalisePayload(input);
  const hash = createHash('sha256');
  hash.update(payload);
  if (options.workDir !== undefined) {
    hash.update('\0workDir=');
    hash.update(options.workDir);
  }
  const hex = hash.digest('hex');
  if (options.bytes !== undefined && options.bytes > 0) {
    return hex.slice(0, options.bytes);
  }
  return hex;
}

function canonicalisePayload(input: RawInput): string {
  switch (input.kind) {
    case 'prompt':
      return `prompt:${input.text}`;
    case 'file':
      return `file:${input.path}`;
    case 'files':
      // Sort for order-independence — router decisions shouldn't depend on drag order.
      return `files:${[...input.paths].sort().join('\n')}`;
    case 'project':
      return `project:${input.path}:${input.workflow ?? ''}`;
  }
}
