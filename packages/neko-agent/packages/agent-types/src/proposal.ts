/**
 * Proposal — Specify-stage artifact (ADR §5.2, §7.5).
 *
 * The declarative "what" of SDD. Produced by creation-persona at the
 * end of the Specify stage; reviewed by the user; compiled into an
 * ExecutionPlan at the Plan stage. Persisted as
 * `.neko/proposals/<id>.nkproposal.md`.
 *
 * Shape mirrors ADR §5 "three layers" — intent / approach / artifact —
 * plus §7.5 frontmatter minimum (id / kind / status / domain / timestamps).
 *
 * The AI writes the entire artifact (frontmatter + body). Programs
 * don't mutate fields; they read the file, parse the frontmatter for
 * indexing, and surface the body verbatim.
 */

// =============================================================================
// Status
// =============================================================================

/**
 * Lifecycle status. Only AI or user-acknowledged state transitions
 * should mutate this — programs don't auto-bump it (ADR §7.5 "AI
 * completely owns semantic artifact ownership").
 *
 *   draft            — still being composed, not yet shown to the user
 *   pending_review   — handed to the user for approval
 *   approved         — user accepted; the Plan stage can compile from it
 *   refined          — user sent edits; status cycles back to pending_review
 *                      after the AI incorporates feedback
 *   rejected         — user declined; the run terminates or re-plans
 */
export type ProposalStatus = 'draft' | 'pending_review' | 'approved' | 'refined' | 'rejected';

// =============================================================================
// Proposal
// =============================================================================

export interface Proposal {
  /** Stable id, typically `<domain>-<shortName>-<seq>`. */
  id: string;
  /** Human-readable title rendered in the review card. */
  title: string;
  /** Lifecycle status. */
  status: ProposalStatus;
  /**
   * Domain tag — matches a skill's domain frontmatter
   * (cut / canvas / story / puppet / ...). Used for index filtering.
   */
  domain: string;
  /** ms epoch — when the AI first produced this proposal. */
  createdAt: number;
  /** ms epoch — last mutation (status change, refine, etc.). */
  updatedAt: number;
  /**
   * The three narrative layers that make a good Proposal (ADR §5.1).
   * All three are free-form markdown bodies composed by the AI.
   */
  intent: string;
  approach: string;
  artifact: string;
  /**
   * Optional reference chain (ADR §8.4) — asset:// URIs this proposal
   * depends on. Empty array = self-contained. Consumed by downstream
   * indexing so "find proposals that reference character X" works.
   */
  referenceChain?: readonly string[];
}
