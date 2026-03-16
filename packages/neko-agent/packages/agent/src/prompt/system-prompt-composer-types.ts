/**
 * System Prompt Composer Types
 *
 * Defines the layered prompt composition model.
 * Each section belongs to a layer with its own token budget.
 */

// =============================================================================
// Layer Definition
// =============================================================================

/** Prompt section layer, ordered by composition priority */
export type PromptLayer = 'base' | 'skill' | 'environment' | 'ephemeral';

/** Layer ordering for composition */
export const PROMPT_LAYER_ORDER: readonly PromptLayer[] = [
  'base',
  'skill',
  'environment',
  'ephemeral',
] as const;

// =============================================================================
// Section
// =============================================================================

/** A named section of the system prompt */
export interface PromptSection {
  /** Unique identifier (e.g., 'base', 'skill:commit-helper') */
  id: string;
  /** Which layer this section belongs to */
  layer: PromptLayer;
  /** The prompt text content */
  content: string;
  /** Higher priority = placed earlier within same layer (default: 50) */
  priority: number;
  /** Estimated token count (auto-calculated) */
  tokenEstimate: number;
  /** Timestamp when section was added */
  addedAt: number;
}

// =============================================================================
// Budget
// =============================================================================

/** Per-layer token budget configuration */
export interface PromptLayerBudget {
  base: number;
  skill: number;
  environment: number;
  ephemeral: number;
}

/** Default budget values */
export const DEFAULT_PROMPT_LAYER_BUDGET: PromptLayerBudget = {
  base: 8000,
  skill: 4000,
  environment: 2000,
  ephemeral: 1000,
};

// =============================================================================
// Composer Options
// =============================================================================

/** Options for SystemPromptComposer */
export interface SystemPromptComposerOptions {
  /** Per-layer token budgets (uses defaults if not specified) */
  budget?: Partial<PromptLayerBudget>;
  /** Section separator string (default: '\n\n---\n\n') */
  separator?: string;
}

// =============================================================================
// Composer Interface
// =============================================================================

/** Input for setSection (without auto-calculated fields) */
export interface PromptSectionInput {
  id: string;
  layer: PromptLayer;
  content: string;
  priority?: number;
}

/** Layer usage info */
export interface LayerUsage {
  used: number;
  budget: number;
}

/** System prompt composer interface */
export interface ISystemPromptComposer {
  /** Set the base prompt content */
  setBase(content: string): void;

  /** Add or replace a named section */
  setSection(input: PromptSectionInput): void;

  /** Remove a section by ID. Returns true if section existed. */
  removeSection(id: string): boolean;

  /** Check if a section exists */
  hasSection(id: string): boolean;

  /** Get a section by ID */
  getSection(id: string): PromptSection | undefined;

  /** Compose the final system prompt string */
  compose(): string;

  /** Get total estimated token usage across all sections */
  getTotalTokens(): number;

  /** Get usage breakdown by layer */
  getLayerUsage(): Record<PromptLayer, LayerUsage>;

  /** Clear all non-base sections */
  reset(): void;
}
