/**
 * Permission → ApprovalEngine adapter.
 *
 * See: docs/architecture/dual-flow-architecture.md §5
 *      plan v2 P4 (Approval unification — adapter migration)
 *
 * The existing PermissionHooks calls a user-supplied `onConfirmTool`
 * callback whenever a tool hits the 'ask' permission decision. This
 * adapter wraps that callback: an ApprovalEngine is consulted first;
 * only when no strategy pack auto-decides (or when the engine
 * escalates) does the original user callback run.
 *
 * Strategy packs in execution ring already handle the common case
 * (idempotent + non-destructive auto-accept, destructive + non-
 * idempotent auto-reject). This adapter wires that logic into the
 * existing permission flow without modifying PermissionHooks.
 *
 * Opt-in: callers that don't pass the adapter keep the old behaviour.
 */

import type {
  ConfirmToolCallback,
  ToolConfirmationRequest,
  ToolConfirmationResponse,
} from '../../permission/types';
import type { IApprovalEngine, ApprovalRequest } from '../index';
import type { FlowKind } from '@neko-agent/types';
import { getLogger } from '../../utils/logger';

const logger = getLogger('PermissionApprovalAdapter');

// =============================================================================
// Types
// =============================================================================

export interface PermissionApprovalAdapterDeps {
  /** Engine to consult. */
  engine: IApprovalEngine;
  /** Live flow accessor — determines which strategy pack runs. */
  getFlow: () => FlowKind;
  /**
   * Fallback user callback. Invoked when the engine returns 'escalate'
   * or no pack auto-decides. If omitted, unresolved requests default
   * to rejection (same semantics as the engine's no-decision path).
   */
  userConfirm?: ConfirmToolCallback;
  /**
   * Optional classifier for tool destructive/idempotent metadata.
   * Strategy packs inspect ApprovalSubject.{destructive, idempotent}
   * to decide. Without a classifier, both fields are left undefined
   * and packs cannot short-circuit — the engine will fall through to
   * userConfirm.
   */
  classifyTool?: (request: ToolConfirmationRequest) => {
    destructive?: boolean;
    idempotent?: boolean;
  };
  /** Clock injection. */
  now?: () => number;
}

// =============================================================================
// Adapter
// =============================================================================

/**
 * Build a ConfirmToolCallback that routes through the ApprovalEngine.
 *
 * Returns a callback with the same signature PermissionHooks expects,
 * so the adapter is a drop-in replacement for any `onConfirmTool`.
 */
export function createPermissionApprovalAdapter(
  deps: PermissionApprovalAdapterDeps,
): ConfirmToolCallback {
  const clock = deps.now ?? (() => Date.now());

  return async function confirmToolThroughEngine(
    request: ToolConfirmationRequest,
  ): Promise<ToolConfirmationResponse> {
    const traits = deps.classifyTool?.(request) ?? {};
    const approvalRequest: ApprovalRequest = {
      channel: 'permission',
      flow: deps.getFlow(),
      subject: {
        label: request.description ?? request.toolCall.name,
        kind: `tool:${request.toolCall.name}`,
        destructive: traits.destructive,
        idempotent: traits.idempotent,
      },
      context: {
        arguments: request.toolCall.arguments,
        toolCallId: request.toolCall.id,
      },
      id: request.confirmationToken ?? `${request.toolCall.id}-${clock()}`,
      at: clock(),
    };

    let response;
    try {
      response = await deps.engine.evaluate(approvalRequest);
    } catch (err) {
      logger.warn(
        `ApprovalEngine threw on tool "${request.toolCall.name}"; deferring to userConfirm: ${String(err)}`,
      );
      return fallbackToUser(deps, request);
    }

    const token = request.confirmationToken;
    switch (response.resolution) {
      case 'auto-accept':
      case 'user-accept':
        return { confirmationToken: token, approved: true, allowAlways: false };
      case 'auto-reject':
      case 'user-reject':
        // 'no-decision' (auto-reject without a pack deciding) also lands
        // here — the engine's contract is that no-decision = reject.
        return { confirmationToken: token, approved: false, allowAlways: false };
      case 'escalate':
        return fallbackToUser(deps, request);
    }
  };
}

async function fallbackToUser(
  deps: PermissionApprovalAdapterDeps,
  request: ToolConfirmationRequest,
): Promise<ToolConfirmationResponse> {
  if (!deps.userConfirm) {
    // No user callback available — reject so the run is safe by default.
    return {
      confirmationToken: request.confirmationToken,
      approved: false,
      allowAlways: false,
    };
  }
  return deps.userConfirm(request);
}
