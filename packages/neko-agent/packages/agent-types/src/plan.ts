/**
 * Plan Types — Shared plan/step definitions for agent execution review
 *
 * SSOT: sourced from agent/plan/types.ts (title required, filePath optional)
 */

export interface PlanStep {
  id: string;
  description: string;
  status: 'pending' | 'approved' | 'rejected' | 'modified';
  /** For modified steps, store the original description */
  originalDescription?: string;
}

export interface Plan {
  id: string;
  title: string;
  steps: PlanStep[];
  /** Overall plan status */
  status: 'pending' | 'approved' | 'rejected' | 'partial';
  /** File path where the plan is stored */
  filePath?: string;
}
