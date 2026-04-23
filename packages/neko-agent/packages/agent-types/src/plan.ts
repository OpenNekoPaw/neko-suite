/**
 * Plan types — shared between the agent runtime, extension, and webview.
 *
 * Plan is the parsed output of the agent's `parsePlanMarkdown` function:
 * a structured view of a plan-mode markdown message with numbered steps.
 * It has no relationship to:
 *   - IDC stages (see `./stage` — Specify/Plan/Tasks/Implement are process
 *     stages, not document structures)
 *   - The deleted `WorkflowLitePlan` (a router/pipeline artifact)
 *
 * Only lives in agent-types because the webview ContentBlock.plan field
 * carries it across the IPC boundary and React components need the shape
 * without depending on the agent runtime package.
 */

/**
 * Lifecycle status of a plan or plan step.
 *
 *   pending / in-progress / completed / failed — execution-side progress
 *   approved / rejected / modified              — user-review decisions
 *
 * Both axes share one union because plan-mode renders the same card for
 * "user is reviewing" and "agent is executing".
 */
export type PlanStatus =
  | 'pending'
  | 'in-progress'
  | 'completed'
  | 'failed'
  | 'approved'
  | 'rejected'
  | 'modified';

export interface PlanStep {
  /** Stable step id formed from the plan id + index. */
  id: string;
  /** Step description body (may include the heading text). */
  description: string;
  /** Execution / review status. */
  status: PlanStatus;
  /**
   * Original description preserved when the user edits the step in
   * plan-mode review. Undefined when the step has not been modified.
   */
  originalDescription?: string;
}

export interface Plan {
  /** Stable plan identifier injected by the agent. */
  id: string;
  /** Plan title (usually the first `#` heading). */
  title: string;
  /** Ordered list of steps parsed from `##` / `###` headings. */
  steps: PlanStep[];
  /** Overall plan status (execution or review). */
  status: PlanStatus;
  /** Optional absolute path of the source markdown when persisted. */
  filePath?: string;
}
