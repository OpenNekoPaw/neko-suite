/**
 * PlanMatrix provenance-badge rendering.
 *
 * Phase 4.1 completion: the matrix surfaces L3 (semantic) and L4 (LLM)
 * alongside the existing L5 continuity asterisk so users can tell at a
 * glance *why* the matcher picked the asset it did.  L1/L2 stay
 * unbadged because they're the common-case explicit/name paths and
 * don't need a callout.
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import { PlanMatrix } from '../PlanMatrix';
import type { WorkflowBindingCandidate, WorkflowShotBindingSummary } from '@neko-agent/types';

beforeEach(() => {
  class ResizeObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  }
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub;
  (globalThis as { requestAnimationFrame?: unknown }).requestAnimationFrame = (
    cb: FrameRequestCallback,
  ): number => {
    cb(0);
    return 0;
  };
  (globalThis as { cancelAnimationFrame?: unknown }).cancelAnimationFrame = () => {};
  // @ts-expect-error — webview imports @/messages which calls acquireVsCodeApi
  globalThis.acquireVsCodeApi = () => ({
    postMessage: vi.fn(),
    getState: vi.fn(),
    setState: vi.fn(),
  });
});

function cellWithProvenance(
  provenance: WorkflowBindingCandidate['provenance'],
): WorkflowShotBindingSummary {
  return {
    shotId: 'shot_1',
    primary: {
      character: {
        slot: 'character',
        entityId: 'alice',
        assetId: 'alice_casual',
        provenance,
        confidence: 0.8,
      },
    },
    alternatives: {},
    unmatched: [],
  };
}

describe('PlanMatrix — provenance badges', () => {
  it('marks L3 semantic matches with a search glyph', () => {
    const { container } = render(<PlanMatrix planId="p" shots={[cellWithProvenance('L3')]} />);
    const badge = container.querySelector('[aria-label="Semantic match (CLIP)"]');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toBe('🔍');
  });

  it('marks L4 LLM matches with a bot glyph', () => {
    const { container } = render(<PlanMatrix planId="p" shots={[cellWithProvenance('L4')]} />);
    const badge = container.querySelector('[aria-label="LLM tie-breaker"]');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toBe('🤖');
  });

  it('marks L5 continuity with an asterisk (regression guard)', () => {
    const { container } = render(<PlanMatrix planId="p" shots={[cellWithProvenance('L5')]} />);
    const badge = container.querySelector('[aria-label="Continuity reuse from an earlier shot"]');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toBe('*');
  });

  it('leaves L1 explicit tags unbadged', () => {
    const { container } = render(<PlanMatrix planId="p" shots={[cellWithProvenance('L1')]} />);
    expect(container.querySelector('[aria-label="Semantic match (CLIP)"]')).toBeNull();
    expect(container.querySelector('[aria-label="LLM tie-breaker"]')).toBeNull();
    expect(
      container.querySelector('[aria-label="Continuity reuse from an earlier shot"]'),
    ).toBeNull();
  });

  it('leaves L2 name matches unbadged', () => {
    const { container } = render(<PlanMatrix planId="p" shots={[cellWithProvenance('L2')]} />);
    expect(container.querySelector('[aria-label="Semantic match (CLIP)"]')).toBeNull();
    expect(container.querySelector('[aria-label="LLM tie-breaker"]')).toBeNull();
  });
});
