/**
 * Prompt Fragment — a sub-package-contributed chunk of prompt text injected
 * into the agent's composed system prompt at the L3 environment layer.
 *
 * Purpose (PR3e): sub-packages like neko-cut / neko-canvas can teach the
 * agent domain-specific usage conventions for their tools (e.g. "timestamps
 * are in milliseconds") without polluting tool `description` fields or
 * baking the guidance into Skills (which would couple the advice to a
 * persona).
 *
 * Scope (PR3e): fragments are unconditional — whatever a provider returns
 * is always injected. Activation filters (by skill / stage / tool) and
 * locale variants are deferred until real use cases demand them.
 *
 * Id convention: fragment ids must be globally unique across all providers.
 * By convention use `{package-name}:{local-id}` so collisions are obvious
 * (e.g. `neko-cut:timeline-basics`, `neko-canvas:shot-composition`). The
 * SubpackageFragmentsModule drops duplicates silently (first-writer-wins).
 */
export interface PromptFragment {
  /**
   * Globally-unique fragment id. Convention: `{package}:{local-id}`.
   * Used as the composer section id (prefixed `fragment:`) so fragments
   * can be bulk-cleared via `removeSectionsByPrefix('fragment:')`.
   */
  readonly id: string;

  /**
   * Prompt text content. Markdown preferred; no wrapper headings added by
   * the module — the fragment body is emitted verbatim.
   */
  readonly content: string;

  /**
   * Optional per-fragment priority within the environment layer. Defaults
   * to 70 (between AGENTS.md=80 and memory:project=60). Higher values
   * appear earlier in the composed output.
   */
  readonly priority?: number;
}
