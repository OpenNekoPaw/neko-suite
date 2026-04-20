/**
 * PermissionApprovalAdapter tests
 *
 * Covers:
 * - auto-accept from execution strategy pack (idempotent + non-destructive)
 * - auto-reject from execution pack (destructive + non-idempotent)
 * - escalate from pack → falls back to user callback
 * - no user callback + escalate → safe-default reject
 * - engine throws → falls back to user callback
 * - confirmationToken round-trips through the response
 */

import { describe, it, expect, vi } from 'vitest';
import { createApprovalEngine } from '../approval-engine';
import { executionStrategyPack } from '../strategies/execution-strategy-pack';
import { createPermissionApprovalAdapter } from '../adapters/permission-approval-adapter';
import type { ToolConfirmationRequest } from '../../permission/types';

function request(overrides: Partial<ToolConfirmationRequest> = {}): ToolConfirmationRequest {
  return {
    toolCall: {
      id: 'call-1',
      name: 'canvas_generate_image',
      arguments: { prompt: 'cat' },
      index: 0,
    },
    action: 'read',
    description: 'Generate an image',
    details: {},
    confirmationToken: 'tok-1',
    ...overrides,
  };
}

describe('PermissionApprovalAdapter', () => {
  it('auto-accepts idempotent + non-destructive tool via execution pack', async () => {
    const engine = createApprovalEngine({ strategyPacks: [executionStrategyPack] });
    const adapter = createPermissionApprovalAdapter({
      engine,
      getFlow: () => 'execution',
      classifyTool: () => ({ idempotent: true, destructive: false }),
    });

    const response = await adapter(request());
    expect(response.approved).toBe(true);
    expect(response.confirmationToken).toBe('tok-1');
  });

  it('auto-rejects destructive + non-idempotent tool via execution pack', async () => {
    const engine = createApprovalEngine({ strategyPacks: [executionStrategyPack] });
    const adapter = createPermissionApprovalAdapter({
      engine,
      getFlow: () => 'execution',
      classifyTool: () => ({ idempotent: false, destructive: true }),
    });

    const response = await adapter(
      request({ toolCall: { id: 'x', name: 'canvas_delete_node', arguments: {}, index: 0 } }),
    );
    expect(response.approved).toBe(false);
  });

  it('no pack decision → falls back to user callback', async () => {
    const engine = createApprovalEngine(); // no packs registered
    const userConfirm = vi.fn(async () => ({
      confirmationToken: 'tok-1',
      approved: true,
      allowAlways: false,
    }));
    const adapter = createPermissionApprovalAdapter({
      engine,
      getFlow: () => 'execution',
      userConfirm,
    });

    // Without packs, engine returns 'auto-reject' with reason 'no-decision'.
    // The adapter maps auto-reject → approved: false. The user callback is
    // NOT invoked because 'no-decision' is still a decision per the engine.
    const response = await adapter(request());
    expect(response.approved).toBe(false);
    expect(userConfirm).not.toHaveBeenCalled();
  });

  it('escalate resolution → user callback invoked', async () => {
    // Build a pack that always escalates.
    const engine = createApprovalEngine({
      strategyPacks: [
        {
          name: 'always-escalate',
          scope: 'execution',
          evaluate: (req) => ({
            requestId: req.id,
            resolution: 'escalate',
            reason: 'need-review',
            decidedAt: 0,
          }),
        },
      ],
    });
    const userConfirm = vi.fn(async () => ({
      confirmationToken: 'tok-1',
      approved: true,
      allowAlways: false,
    }));
    const adapter = createPermissionApprovalAdapter({
      engine,
      getFlow: () => 'execution',
      userConfirm,
    });

    const response = await adapter(request());
    expect(userConfirm).toHaveBeenCalledTimes(1);
    expect(response.approved).toBe(true);
  });

  it('escalate + no user callback → safe-default reject', async () => {
    const engine = createApprovalEngine({
      strategyPacks: [
        {
          name: 'always-escalate',
          scope: 'execution',
          evaluate: (req) => ({
            requestId: req.id,
            resolution: 'escalate',
            reason: 'need-review',
            decidedAt: 0,
          }),
        },
      ],
    });
    const adapter = createPermissionApprovalAdapter({
      engine,
      getFlow: () => 'execution',
    });

    const response = await adapter(request());
    expect(response.approved).toBe(false);
    expect(response.confirmationToken).toBe('tok-1');
  });

  it('engine throw → falls back to user callback', async () => {
    const engine = {
      register: vi.fn(),
      setUserPrompt: vi.fn(),
      evaluate: async () => {
        throw new Error('engine boom');
      },
    } as unknown as ReturnType<typeof createApprovalEngine>;
    const userConfirm = vi.fn(async () => ({
      confirmationToken: 'tok-1',
      approved: true,
      allowAlways: false,
    }));
    const adapter = createPermissionApprovalAdapter({
      engine,
      getFlow: () => 'execution',
      userConfirm,
    });

    const response = await adapter(request());
    expect(userConfirm).toHaveBeenCalledTimes(1);
    expect(response.approved).toBe(true);
  });

  it('flow accessor is read live (creation vs execution)', async () => {
    // Use the execution pack only; a creation-scoped request won't match.
    const engine = createApprovalEngine({ strategyPacks: [executionStrategyPack] });
    let flow: 'creation' | 'execution' = 'creation';
    const userConfirm = vi.fn(async () => ({
      confirmationToken: 'tok-1',
      approved: true,
      allowAlways: false,
    }));
    const adapter = createPermissionApprovalAdapter({
      engine,
      getFlow: () => flow,
      classifyTool: () => ({ idempotent: true, destructive: false }),
      userConfirm,
    });

    // Creation flow + no matching pack → engine no-decision → reject.
    let response = await adapter(request());
    expect(response.approved).toBe(false);
    expect(userConfirm).not.toHaveBeenCalled();

    // Switch to execution flow — pack now matches and auto-accepts.
    flow = 'execution';
    response = await adapter(request());
    expect(response.approved).toBe(true);
  });
});
