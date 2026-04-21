/**
 * ApprovalEngine — single entry point for all three approval channels.
 *
 * See: docs/architecture/agent-unified-workflow.md §9 (approval governance)
 *
 * Pipeline per request:
 *   1. Paradigm-specific strategy pack evaluates (if registered).
 *      Pack scope is matched against request.paradigm (declarative /
 *      imperative).
 *   2. 'shared' strategy pack evaluates (if registered).
 *   3. Neither auto-decided → user prompt (callback supplied by caller).
 *   4. No prompt → auto-reject ('no-decision').
 *
 * Strategy packs are pure sync functions; the user prompt is async.
 * The engine itself is async to accommodate (3).
 */

import { getLogger } from '../utils/logger';
import type {
  ApprovalRequest,
  ApprovalResponse,
  StrategyPack,
  UserApprovalPrompt,
} from './approval-types';

const logger = getLogger('ApprovalEngine');

// =============================================================================
// Types
// =============================================================================

export interface ApprovalEngineConfig {
  /** Optional strategy packs. Can be added later via register(). */
  strategyPacks?: readonly StrategyPack[];
  /** Optional user prompt. When absent, unresolved requests auto-reject. */
  userPrompt?: UserApprovalPrompt;
  /** Clock injection. */
  now?: () => number;
}

export type ApprovalDecisionListener = (
  request: ApprovalRequest,
  response: ApprovalResponse,
) => void;

export interface IApprovalEngine {
  register(pack: StrategyPack): void;
  setUserPrompt(prompt: UserApprovalPrompt | undefined): void;
  evaluate(request: ApprovalRequest): Promise<ApprovalResponse>;
  /**
   * Subscribe to every finalised decision (auto-accept / auto-reject /
   * escalate → resolved). Called after the response is stamped and
   * before `evaluate()` returns. Listener exceptions are swallowed so
   * one misbehaving subscriber can't break the engine.
   *
   * Returns an unsubscribe function.
   */
  onDecision(listener: ApprovalDecisionListener): () => void;
}

// =============================================================================
// Implementation
// =============================================================================

class ApprovalEngine implements IApprovalEngine {
  private readonly _packs: StrategyPack[] = [];
  private _userPrompt: UserApprovalPrompt | undefined;
  private readonly _now: () => number;
  private readonly _decisionListeners = new Set<ApprovalDecisionListener>();

  constructor(config: ApprovalEngineConfig = {}) {
    this._now = config.now ?? (() => Date.now());
    if (config.strategyPacks) {
      for (const p of config.strategyPacks) this.register(p);
    }
    this._userPrompt = config.userPrompt;
  }

  register(pack: StrategyPack): void {
    this._packs.push(pack);
  }

  setUserPrompt(prompt: UserApprovalPrompt | undefined): void {
    this._userPrompt = prompt;
  }

  onDecision(listener: ApprovalDecisionListener): () => void {
    this._decisionListeners.add(listener);
    return () => {
      this._decisionListeners.delete(listener);
    };
  }

  async evaluate(request: ApprovalRequest): Promise<ApprovalResponse> {
    // 1. Paradigm-specific packs.
    for (const pack of this._packs) {
      if (pack.scope !== request.paradigm) continue;
      const decision = this._safeEvaluate(pack, request);
      if (decision) return this._finalise(request, this._stamp(decision));
    }
    // 2. Shared packs.
    for (const pack of this._packs) {
      if (pack.scope !== 'shared') continue;
      const decision = this._safeEvaluate(pack, request);
      if (decision) return this._finalise(request, this._stamp(decision));
    }
    // 3. User prompt.
    if (this._userPrompt) {
      try {
        const response = await this._userPrompt(request);
        if (response) return this._finalise(request, this._stamp(response));
      } catch (err) {
        logger.warn(`User prompt threw on request ${request.id}: ${String(err)}`);
      }
    }
    // 4. No decision → auto-reject.
    return this._finalise(
      request,
      this._stamp({
        requestId: request.id,
        resolution: 'auto-reject',
        reason: 'no-decision',
        decidedAt: this._now(),
      }),
    );
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private _safeEvaluate(
    pack: StrategyPack,
    request: ApprovalRequest,
  ): ApprovalResponse | undefined {
    try {
      return pack.evaluate(request);
    } catch (err) {
      logger.warn(`Strategy pack "${pack.name}" threw; skipping: ${String(err)}`);
      return undefined;
    }
  }

  private _stamp(response: ApprovalResponse): ApprovalResponse {
    // Ensure decidedAt is filled even if the strategy pack omitted it.
    return response.decidedAt ? response : { ...response, decidedAt: this._now() };
  }

  /**
   * Broadcast the decision to subscribers, then return it. One listener's
   * throw must not starve siblings or block the evaluate() contract.
   */
  private _finalise(request: ApprovalRequest, response: ApprovalResponse): ApprovalResponse {
    for (const listener of this._decisionListeners) {
      try {
        listener(request, response);
      } catch (err) {
        logger.warn(`Approval decision listener threw: ${String(err)}`);
      }
    }
    return response;
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createApprovalEngine(config?: ApprovalEngineConfig): IApprovalEngine {
  return new ApprovalEngine(config);
}
