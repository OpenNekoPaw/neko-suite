/**
 * RouterAskBroker — extension-side implementation of the LLMRouter
 * `ask_user` tool (see platform/workflow/router/llm-router-tools.ts).
 *
 * Posts `workflow/routerAsk` to the webview and awaits a matching
 * `workflow/routerAskResponse`.  Each ask is keyed by a UUID so
 * concurrent asks remain distinguishable.
 *
 * Timeout + signal behaviour:
 *   - The caller's `timeoutMs` starts a local timer that rejects the
 *     pending promise when it fires (`dismissed` result).
 *   - The caller's `signal` (propagated from LLMRouter) also dismisses
 *     the pending ask when aborted.
 *
 * The LLMRouter pauses its overall budget while the ask is in flight,
 * so the user can take as long as `timeoutMs` to answer.
 *
 * See docs/architecture/workflow-routing.md §6.
 */

import * as vscode from 'vscode';
import { Workflow } from '@neko/platform';
import type { WorkflowRouterAskMessage, WorkflowRouterAskResponseMessage } from '@neko-agent/types';
import { getLogger } from '../base';

const logger = getLogger('RouterAskBroker');

// =============================================================================
// Public API
// =============================================================================

interface PendingAsk {
  resolve: (result: Workflow.AskUserResult) => void;
  timer: ReturnType<typeof setTimeout>;
  abortHandler: (() => void) | undefined;
  signal: AbortSignal | undefined;
}

export interface RouterAskBrokerDeps {
  /**
   * Returns the currently active webview (chat panel).  Fetched fresh on
   * every ask so a webview dispose/recreate is handled transparently.
   */
  getWebview: () => vscode.Webview | undefined;
  /** Override the id generator for deterministic tests. */
  generateAskId?: () => string;
}

export class RouterAskBroker implements Workflow.AskUserBroker {
  private readonly pending = new Map<string, PendingAsk>();
  private readonly generateAskId: () => string;

  constructor(private readonly deps: RouterAskBrokerDeps) {
    this.generateAskId = deps.generateAskId ?? defaultAskIdGen;
  }

  // ---------------------------------------------------------------------------
  // AskUserBroker
  // ---------------------------------------------------------------------------

  async ask(
    args: Workflow.AskUserArgs,
    opts: { signal?: AbortSignal; timeoutMs: number },
  ): Promise<Workflow.AskUserResult> {
    const webview = this.deps.getWebview();
    if (!webview) {
      // No UI to surface the question to — resolve immediately as dismissed
      // so the LLM gives up gracefully.
      return {
        status: 'dismissed',
        note: 'No webview available for ask_user',
      };
    }

    if (opts.signal?.aborted) {
      return { status: 'dismissed', note: 'aborted before ask' };
    }

    const askId = this.generateAskId();

    return new Promise<Workflow.AskUserResult>((resolve) => {
      const cleanup = (): void => {
        const pending = this.pending.get(askId);
        if (!pending) return;
        clearTimeout(pending.timer);
        if (pending.abortHandler && pending.signal) {
          pending.signal.removeEventListener('abort', pending.abortHandler);
        }
        this.pending.delete(askId);
      };

      const timer = setTimeout(() => {
        cleanup();
        resolve({ status: 'dismissed', note: `timed out after ${opts.timeoutMs}ms` });
      }, opts.timeoutMs);

      let abortHandler: (() => void) | undefined;
      if (opts.signal) {
        abortHandler = (): void => {
          cleanup();
          resolve({ status: 'dismissed', note: 'aborted' });
        };
        opts.signal.addEventListener('abort', abortHandler, { once: true });
      }

      this.pending.set(askId, {
        resolve: (result) => {
          cleanup();
          resolve(result);
        },
        timer,
        abortHandler,
        signal: opts.signal,
      });

      const message: WorkflowRouterAskMessage = {
        type: 'workflow/routerAsk',
        askId,
        question: args.question,
        ...(args.options !== undefined && { options: args.options }),
        timeoutMs: opts.timeoutMs,
      };
      webview.postMessage(message).then(undefined, (err: unknown) => {
        logger.warn('Failed to post routerAsk to webview', {
          askId,
          error: err instanceof Error ? err.message : String(err),
        });
        // Posting failed — surface as dismissed so router falls back fast.
        const pending = this.pending.get(askId);
        if (pending) pending.resolve({ status: 'dismissed', note: 'postMessage failed' });
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Response handling — called from chatProvider's message routing
  // ---------------------------------------------------------------------------

  handleResponse(msg: WorkflowRouterAskResponseMessage): boolean {
    const pending = this.pending.get(msg.askId);
    if (!pending) {
      logger.debug('routerAskResponse ignored — askId not pending', { askId: msg.askId });
      return false;
    }
    if (msg.status === 'dismissed') {
      pending.resolve({ status: 'dismissed', note: 'user dismissed' });
    } else {
      pending.resolve({
        status: 'answered',
        ...(msg.choice !== undefined && { choice: msg.choice }),
        ...(msg.freeformAnswer !== undefined && { freeformAnswer: msg.freeformAnswer }),
      });
    }
    return true;
  }

  /** Diagnostic — current outstanding ask count. */
  getPendingCount(): number {
    return this.pending.size;
  }
}

// =============================================================================
// Helpers
// =============================================================================

function defaultAskIdGen(): string {
  return `ask_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
