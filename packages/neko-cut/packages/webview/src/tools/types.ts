/**
 * Tool Types for Webview
 */

import { useEditorStore } from '../stores/editor-store';

/**
 * Tool execution request from Extension
 */
export interface ToolExecuteRequest {
  type: 'tool.execute';
  requestId: string;
  toolName: string;
  params: Record<string, unknown>;
}

/**
 * Tool execution result to Extension
 */
export interface ToolExecuteResult {
  type: 'tool.result';
  requestId: string;
  success: boolean;
  result?: unknown;
  error?: string;
}

/**
 * Tool handler function type
 */
export type ToolHandler = (params: Record<string, unknown>) => Promise<ToolHandlerResult>;

/**
 * Tool handler result
 */
export interface ToolHandlerResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

/**
 * Push current project state to history stack before making changes.
 * Call this at the start of any tool handler that modifies project state.
 * @returns true if history was pushed, false if no project loaded
 */
export function pushHistoryBeforeChange(): boolean {
  const store = useEditorStore.getState();
  const { project, pushHistory } = store;
  if (!project) return false;
  pushHistory(project);
  return true;
}
