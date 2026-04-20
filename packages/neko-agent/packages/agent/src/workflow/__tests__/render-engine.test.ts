import { describe, expect, it, vi } from 'vitest';
import {
  collectAnchorShotIds,
  createRenderEngineStage,
  type RenderEngineStageDeps,
} from '../stages/render-engine';
import type { WorkflowContext, WorkflowReferenceChainEntry } from '../types';

// =============================================================================
// collectAnchorShotIds
// =============================================================================

describe('collectAnchorShotIds', () => {
  it('returns [] when no chain is set', () => {
    expect(collectAnchorShotIds({})).toEqual([]);
  });

  it('extracts unique anchor shot ids from chain entries', () => {
    const ctx: WorkflowContext = {
      referenceChain: [
        { shotId: 's2', slot: 'character', references: ['s1'], strategy: 'anchored' },
        { shotId: 's3', slot: 'character', references: ['s1', 's2'], strategy: 'hybrid' },
      ],
    };
    // Set semantics → s1, s2 in any order, no dupes
    expect(collectAnchorShotIds(ctx).sort()).toEqual(['s1', 's2']);
  });

  it('drops self-references defensively', () => {
    const ctx: WorkflowContext = {
      referenceChain: [
        {
          shotId: 's1',
          slot: 'character',
          references: ['s1', 's0'],
          strategy: 'sequential',
        },
      ],
    };
    expect(collectAnchorShotIds(ctx)).toEqual(['s0']);
  });

  it('drops empty-string references', () => {
    const ctx: WorkflowContext = {
      referenceChain: [
        {
          shotId: 's2',
          slot: 'character',
          references: ['', 's1'],
          strategy: 'sequential',
        } as unknown as WorkflowReferenceChainEntry,
      ],
    };
    expect(collectAnchorShotIds(ctx)).toEqual(['s1']);
  });
});

// =============================================================================
// createRenderEngineStage
// =============================================================================

function makeStage(
  renderAnchor: RenderEngineStageDeps['renderAnchor'],
  logger?: RenderEngineStageDeps['logger'],
) {
  return createRenderEngineStage({
    renderAnchor,
    ...(logger ? { logger } : {}),
  });
}

describe('renderEngine stage', () => {
  it('returns ctx unchanged when chain is empty', async () => {
    const stage = makeStage(async () => ['/unused']);
    const ctx: WorkflowContext = {};
    if (stage.type !== 'linear') throw new Error('unexpected stage shape');
    const result = await stage.execute(ctx);
    expect(result).toBe(ctx);
  });

  it('calls renderAnchor once per unique anchor and merges paths into ctx', async () => {
    const calls: string[] = [];
    const stage = makeStage(async (shotId) => {
      calls.push(shotId);
      return [`/rendered/${shotId}.png`];
    });
    const ctx: WorkflowContext = {
      referenceChain: [
        { shotId: 's2', slot: 'character', references: ['s1'], strategy: 'anchored' },
        { shotId: 's3', slot: 'character', references: ['s1', 's2'], strategy: 'hybrid' },
      ],
    };
    if (stage.type !== 'linear') throw new Error('unexpected stage shape');
    const result = await stage.execute(ctx);
    calls.sort();
    expect(calls).toEqual(['s1', 's2']);
    expect(result.renderedAnchorPaths?.['s1']).toEqual(['/rendered/s1.png']);
    expect(result.renderedAnchorPaths?.['s2']).toEqual(['/rendered/s2.png']);
  });

  it('skips anchors that return an empty list', async () => {
    const stage = makeStage(async (shotId) => (shotId === 's1' ? ['/a.png'] : []));
    const ctx: WorkflowContext = {
      referenceChain: [
        { shotId: 's2', slot: 'character', references: ['s1'], strategy: 'anchored' },
        { shotId: 's3', slot: 'character', references: ['s2'], strategy: 'anchored' },
      ],
    };
    if (stage.type !== 'linear') throw new Error('unexpected stage shape');
    const result = await stage.execute(ctx);
    expect(result.renderedAnchorPaths).toEqual({ s1: ['/a.png'] });
  });

  it('swallows adapter errors and logs them', async () => {
    const warn = vi.fn();
    const stage = makeStage(
      async (shotId) => {
        if (shotId === 's1') throw new Error('boom');
        return ['/b.png'];
      },
      { warn },
    );
    const ctx: WorkflowContext = {
      referenceChain: [
        { shotId: 's3', slot: 'character', references: ['s1', 's2'], strategy: 'hybrid' },
      ],
    };
    if (stage.type !== 'linear') throw new Error('unexpected stage shape');
    const result = await stage.execute(ctx);
    expect(result.renderedAnchorPaths).toEqual({ s2: ['/b.png'] });
    expect(warn).toHaveBeenCalledOnce();
    const [msg, arg] = warn.mock.calls[0]!;
    expect(msg).toContain('adapter threw');
    expect((arg as { shotId?: string } | undefined)?.shotId).toBe('s1');
  });

  it('preserves caller-supplied renderedAnchorPaths when adding new entries', async () => {
    const stage = makeStage(async (shotId) => [`/${shotId}.png`]);
    const ctx: WorkflowContext = {
      referenceChain: [
        { shotId: 's2', slot: 'character', references: ['s1'], strategy: 'anchored' },
      ],
      renderedAnchorPaths: { pre: ['/pre.png'] },
    };
    if (stage.type !== 'linear') throw new Error('unexpected stage shape');
    const result = await stage.execute(ctx);
    expect(result.renderedAnchorPaths?.['pre']).toEqual(['/pre.png']);
    expect(result.renderedAnchorPaths?.['s1']).toEqual(['/s1.png']);
  });
});
