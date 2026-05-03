/**
 * VSCode project search host adapter for @neko/agent mention projection.
 */

import * as vscode from 'vscode';
import type { AgentProjectFileCandidate, AgentProjectFileSearchPlan } from '@neko/agent/runtime';

export async function searchVSCodeProjectFiles(
  plan: AgentProjectFileSearchPlan,
): Promise<readonly AgentProjectFileCandidate[]> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders || workspaceFolders.length === 0) {
    return [];
  }

  const files = await vscode.workspace.findFiles(
    plan.includePattern,
    plan.excludePattern,
    plan.limit,
  );

  return files.map((file) => ({
    relativePath: vscode.workspace.asRelativePath(file),
  }));
}
