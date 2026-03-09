/**
 * Plan types — shared between agent, extension, and webview
 */

export interface PlanStep {
  id: string;
  description: string;
  status: 'pending' | 'approved' | 'rejected' | 'modified';
  originalDescription?: string;
}

export interface Plan {
  id: string;
  title: string;
  steps: PlanStep[];
  status: 'pending' | 'approved' | 'rejected' | 'partial';
  filePath?: string;
}
