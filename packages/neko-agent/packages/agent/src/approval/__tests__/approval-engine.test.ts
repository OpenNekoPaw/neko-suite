/**
 * ApprovalEngine + strategy pack tests (P4)
 *
 * Covers:
 * - Ring-specific pack precedence over shared pack
 * - Shared pack runs when ring pack declines
 * - User prompt invoked only when no pack decided
 * - User prompt throw → auto-reject with 'no-decision'
 * - Creation pack: idempotent+non-destructive plan auto-accepted
 * - Creation pack: destructive plan → undefined (ask user)
 * - Execution pack: idempotent + non-destructive → auto-accept
 * - Execution pack: destructive + non-idempotent → auto-reject
 * - Execution pack: quality-gate verdict routing
 */

import { describe, it, expect, vi } from 'vitest';
import { createApprovalEngine } from '../approval-engine';
import { creationStrategyPack } from '../strategies/creation-strategy-pack';
import { executionStrategyPack } from '../strategies/execution-strategy-pack';
import type { ApprovalRequest, ApprovalResponse, StrategyPack } from '../approval-types';

function request(
  overrides: Partial<ApprovalRequest> &
    Partial<{ kind: string; label: string; destructive: boolean; idempotent: boolean }> = {},
): ApprovalRequest {
  const { kind = 'tool:x', label = 'X', destructive, idempotent, ...rest } = overrides;
  return {
    channel: 'permission',
    paradigm: 'imperative',
    subject: { kind, label, destructive, idempotent },
    id: rest.id ?? 'req-1',
    at: rest.at ?? 0,
    ...rest,
  };
}

describe('ApprovalEngine', () => {
  it('ring-specific pack takes precedence over shared pack', async () => {
    const ring: StrategyPack = {
      name: 'ring',
      scope: 'imperative',
      evaluate: () => ({
        requestId: 'req-1',
        resolution: 'auto-accept',
        reason: 'ring-pick',
        decidedAt: 0,
      }),
    };
    const shared: StrategyPack = {
      name: 'shared',
      scope: 'shared',
      evaluate: () =>
        ({
          requestId: 'req-1',
          resolution: 'auto-reject',
          reason: 'shared-pick',
          decidedAt: 0,
        }) satisfies ApprovalResponse,
    };
    const engine = createApprovalEngine({ strategyPacks: [shared, ring] });
    const res = await engine.evaluate(request());
    expect(res.reason).toBe('ring-pick');
  });

  it('shared pack runs when ring pack returns undefined', async () => {
    const ring: StrategyPack = {
      name: 'ring',
      scope: 'imperative',
      evaluate: () => undefined,
    };
    const shared: StrategyPack = {
      name: 'shared',
      scope: 'shared',
      evaluate: () => ({
        requestId: 'req-1',
        resolution: 'auto-accept',
        reason: 'shared-pick',
        decidedAt: 0,
      }),
    };
    const engine = createApprovalEngine({ strategyPacks: [ring, shared] });
    const res = await engine.evaluate(request());
    expect(res.reason).toBe('shared-pick');
  });

  it('user prompt runs when no pack decides', async () => {
    const prompt = vi.fn(async (req: ApprovalRequest) => ({
      requestId: req.id,
      resolution: 'user-accept' as const,
      reason: 'user-said-yes',
      decidedAt: 7,
    }));
    const engine = createApprovalEngine({ userPrompt: prompt });
    const res = await engine.evaluate(request());
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(res.resolution).toBe('user-accept');
  });

  it('user prompt throw → no-decision auto-reject', async () => {
    const engine = createApprovalEngine({
      userPrompt: async () => {
        throw new Error('UI broken');
      },
    });
    const res = await engine.evaluate(request());
    expect(res.resolution).toBe('auto-reject');
    expect(res.reason).toBe('no-decision');
  });

  it('strategy pack throw does not break the pipeline', async () => {
    const bad: StrategyPack = {
      name: 'bad',
      scope: 'imperative',
      evaluate: () => {
        throw new Error('bug');
      },
    };
    const ok: StrategyPack = {
      name: 'ok',
      scope: 'imperative',
      evaluate: () => ({
        requestId: 'req-1',
        resolution: 'auto-accept',
        reason: 'ok-pick',
        decidedAt: 0,
      }),
    };
    const engine = createApprovalEngine({ strategyPacks: [bad, ok] });
    const res = await engine.evaluate(request());
    expect(res.reason).toBe('ok-pick');
  });
});

describe('creationStrategyPack', () => {
  it('auto-accepts idempotent + non-destructive plan reviews', async () => {
    const engine = createApprovalEngine({ strategyPacks: [creationStrategyPack] });
    const res = await engine.evaluate(
      request({
        channel: 'proposal-review',
        paradigm: 'declarative',
        idempotent: true,
        destructive: false,
      }),
    );
    expect(res.resolution).toBe('auto-accept');
    expect(res.reason).toBe('preview-only-proposal');
  });

  it('defers destructive plan reviews to the user', async () => {
    const engine = createApprovalEngine({
      strategyPacks: [creationStrategyPack],
      userPrompt: async () => undefined, // user declines
    });
    const res = await engine.evaluate(
      request({
        channel: 'proposal-review',
        paradigm: 'declarative',
        destructive: true,
      }),
    );
    // User prompt returned undefined → engine auto-rejects.
    expect(res.resolution).toBe('auto-reject');
  });

  it('auto-accepts non-destructive permission requests', async () => {
    const engine = createApprovalEngine({ strategyPacks: [creationStrategyPack] });
    const res = await engine.evaluate(
      request({ channel: 'permission', paradigm: 'declarative', destructive: false }),
    );
    expect(res.resolution).toBe('auto-accept');
    expect(res.reason).toBe('non-destructive-read');
  });
});

describe('executionStrategyPack', () => {
  it('auto-accepts idempotent + non-destructive tool calls', async () => {
    const engine = createApprovalEngine({ strategyPacks: [executionStrategyPack] });
    const res = await engine.evaluate(
      request({ channel: 'permission', paradigm: 'imperative', idempotent: true }),
    );
    expect(res.resolution).toBe('auto-accept');
    expect(res.reason).toBe('idempotent-non-destructive');
  });

  it('auto-rejects destructive + non-idempotent tools', async () => {
    const engine = createApprovalEngine({ strategyPacks: [executionStrategyPack] });
    const res = await engine.evaluate(
      request({
        channel: 'permission',
        paradigm: 'imperative',
        destructive: true,
        idempotent: false,
      }),
    );
    expect(res.resolution).toBe('auto-reject');
    expect(res.reason).toBe('destructive-and-non-idempotent');
  });

  it('quality gate: pass / warn / fail routing', async () => {
    const engine = createApprovalEngine({ strategyPacks: [executionStrategyPack] });

    const pass = await engine.evaluate(
      request({ channel: 'quality-gate', paradigm: 'imperative', context: { verdict: 'pass' } }),
    );
    expect(pass.resolution).toBe('auto-accept');

    const warn = await engine.evaluate(
      request({ channel: 'quality-gate', paradigm: 'imperative', context: { verdict: 'warn' } }),
    );
    expect(warn.resolution).toBe('escalate');

    const fail = await engine.evaluate(
      request({ channel: 'quality-gate', paradigm: 'imperative', context: { verdict: 'fail' } }),
    );
    expect(fail.resolution).toBe('auto-reject');
  });
});
