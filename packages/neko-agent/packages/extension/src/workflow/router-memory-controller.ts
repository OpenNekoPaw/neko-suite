/**
 * Router Memory Controller — handles webview messages that inspect or
 * mutate the Phase-3 Router memory store.  Extracted from the old
 * WorkflowPlanHandler god-class.
 *
 * Responsibilities are tight: list recent entries, forget one by hash,
 * or clear all.  After a mutation the updated list is re-posted so the
 * webview re-renders without a follow-up request.
 */

import * as vscode from 'vscode';
import type {
  WorkflowRouterMemoryDeleteMessage,
  WorkflowRouterMemoryEntry,
  WorkflowRouterMemoryRequestMessage,
} from '@neko-agent/types';
import type { Orchestrator } from './orchestrator-bootstrap';
import { postRouterMemory, toWireRouterMemoryEntry } from './plan-wire';

export interface RouterMemoryControllerDeps {
  orchestrator: Orchestrator;
  getWebview: () => vscode.Webview | undefined;
}

export class RouterMemoryController {
  constructor(private readonly deps: RouterMemoryControllerDeps) {}

  /**
   * Return recent router-memory entries.  Posts `workflow/routerMemory`
   * with the entries + total; when no memory is wired the message still
   * posts (empty entries + errorMessage).
   */
  handleRouterMemoryRequest(msg: WorkflowRouterMemoryRequestMessage): WorkflowRouterMemoryEntry[] {
    const memory = this.deps.orchestrator.routerMemory;
    if (!memory) {
      postRouterMemory(this.deps.getWebview, {
        entries: [],
        total: 0,
        errorMessage: 'Router memory is not available (no workspace folder or file IO).',
      });
      return [];
    }
    const entries = memory.listRecent({
      ...(msg.limit !== undefined && { limit: msg.limit }),
      ...(msg.level !== undefined && { level: msg.level }),
      ...(msg.source !== undefined && { source: msg.source }),
    });
    const wire = entries.map(toWireRouterMemoryEntry);
    postRouterMemory(this.deps.getWebview, { entries: wire, total: memory.count() });
    return wire;
  }

  /**
   * Delete a single entry by hash, or clear all entries when `hash` is
   * omitted.  After mutating, re-post the updated list so the webview
   * re-renders without a separate request.
   */
  async handleRouterMemoryDelete(msg: WorkflowRouterMemoryDeleteMessage): Promise<boolean> {
    const memory = this.deps.orchestrator.routerMemory;
    if (!memory) {
      postRouterMemory(this.deps.getWebview, {
        entries: [],
        total: 0,
        errorMessage: 'Router memory is not available.',
      });
      return false;
    }
    let changed = false;
    if (msg.hash !== undefined) {
      changed = await memory.deleteByHash(msg.hash);
    } else {
      await memory.clearAll();
      changed = true;
    }
    const entries = memory.listRecent().map(toWireRouterMemoryEntry);
    postRouterMemory(this.deps.getWebview, { entries, total: memory.count() });
    return changed;
  }
}
