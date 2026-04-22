/**
 * CapabilityKind — ADR §5.1 / §5.3 flat capability pool discriminant.
 *
 * The ADR models L1 capabilities as three kinds:
 *
 *   - `'skill'`     scene package with a persona + orchestration guidance
 *   - `'tool'`      single atomic invocation (non-authoritative)
 *   - `'operation'` single atomic invocation that mutates authoritative
 *                   state (project data, external resource)
 *
 * In the codebase Tool and Operation share the same `Tool` interface —
 * they differ only by the `isDestructive` trait:
 *
 *   isDestructive = true  → kind 'operation'
 *   isDestructive = false → kind 'tool'
 *
 * Keeping one interface is intentional: the ApprovalEngine + autoheal
 * chain already route on `isDestructive`, and splitting the TS type
 * would force parallel registries for no runtime gain. What ADR labels
 * "Operation" is a **policy bucket** over Tools, not a separate class.
 *
 * This module supplies:
 *   - the discriminant union (for code that wants to classify capabilities
 *     without re-deriving the rule every time)
 *   - a helper `capabilityKindOf()` for Skill + Tool objects
 *
 * No registry merge — `IToolRegistry` and `ISkillRegistry` stay
 * separate because their lookup paths differ (tools by name / category,
 * skills by description match / command). The ADR's "flat pool" is a
 * conceptual frame for how the Agent sees capabilities at composition
 * time, not a data-structure mandate.
 */

export type CapabilityKind = 'skill' | 'tool' | 'operation';

// =============================================================================
// Structural shapes the helper recognises
// =============================================================================

/** Minimum shape needed to classify something as a Skill. */
export interface CapabilityKindSkillLike {
  name: string;
  content: string;
}

/** Minimum shape needed to classify something as a Tool or Operation. */
export interface CapabilityKindToolLike {
  name: string;
  parameters: unknown;
  execute: (...args: readonly unknown[]) => unknown;
  isDestructive?: boolean;
}

export type CapabilityKindInput = CapabilityKindSkillLike | CapabilityKindToolLike;

// =============================================================================
// Classifier
// =============================================================================

/**
 * Classify an object as a `'skill' | 'tool' | 'operation'`.
 *
 * Decision order:
 *   1. Has `content: string` → `'skill'` (Skill's unique field)
 *   2. Has `execute` + `isDestructive === true` → `'operation'`
 *   3. Has `execute` → `'tool'`
 *
 * Throws when the object matches neither shape. Callers that prefer a
 * silent classifier can use `safeCapabilityKindOf()`.
 */
export function capabilityKindOf(input: CapabilityKindInput): CapabilityKind {
  if (_isSkillLike(input)) return 'skill';
  if (_isToolLike(input)) {
    return input.isDestructive === true ? 'operation' : 'tool';
  }
  throw new Error(
    `capabilityKindOf: input does not look like a Skill or Tool (name="${
      (input as { name?: string }).name ?? '<anonymous>'
    }")`,
  );
}

/**
 * Non-throwing classifier. Returns null when the input is neither a
 * Skill nor a Tool — useful in UI layers iterating over mixed arrays.
 */
export function safeCapabilityKindOf(input: unknown): CapabilityKind | null {
  if (typeof input !== 'object' || input === null) return null;
  const rec = input as Record<string, unknown>;
  if (typeof rec.content === 'string' && typeof rec.name === 'string') return 'skill';
  if (typeof rec.execute === 'function') {
    return rec.isDestructive === true ? 'operation' : 'tool';
  }
  return null;
}

// =============================================================================
// Internals
// =============================================================================

function _isSkillLike(input: CapabilityKindInput): input is CapabilityKindSkillLike {
  return typeof (input as CapabilityKindSkillLike).content === 'string';
}

function _isToolLike(input: CapabilityKindInput): input is CapabilityKindToolLike {
  return typeof (input as CapabilityKindToolLike).execute === 'function';
}
