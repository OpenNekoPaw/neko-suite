import type * as vscode from 'vscode';
import type {
  AgentTurnTimelineSnapshotRequest,
  WebviewToExtensionMessage,
} from '@neko-agent/types';

/** Explicit ownership router for active-turn snapshot providers outside the normal Agent turn handler. */
export interface AgentTurnTimelineSnapshotRouter {
  owns(request: AgentTurnTimelineSnapshotRequest): boolean;
  requestSnapshot(
    webview: vscode.Webview,
    request: AgentTurnTimelineSnapshotRequest,
  ): Promise<void>;
}

export async function tryRouteOwnedAgentTurnTimelineSnapshot(input: {
  readonly router: AgentTurnTimelineSnapshotRouter | undefined;
  readonly webview: vscode.Webview;
  readonly message: WebviewToExtensionMessage;
}): Promise<boolean> {
  if (input.message.type !== 'requestAgentTurnTimelineSnapshot') return false;
  if (!input.router?.owns(input.message)) return false;
  await input.router.requestSnapshot(input.webview, input.message);
  return true;
}
