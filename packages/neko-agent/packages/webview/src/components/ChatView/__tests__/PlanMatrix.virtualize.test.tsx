/**
 * PlanMatrix virtualization smoke test.
 *
 * Ensures that when the shot count exceeds the virtualization threshold,
 * the component renders a scrollable viewport containing only a window of
 * rows (plus spacer rows to keep the scrollbar accurate).  Below the
 * threshold, it falls back to rendering every row directly.
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import { PlanMatrix } from '../PlanMatrix';
import type { WorkflowShotBindingSummary } from '@neko-agent/types';

// Ensure ResizeObserver + rAF exist in jsdom before the hook mounts.
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

function buildShot(i: number): WorkflowShotBindingSummary {
  return {
    shotId: `shot_${i}`,
    primary: {
      character: {
        slot: 'character',
        entityId: 'alice',
        assetId: 'alice_casual',
        provenance: 'L1',
        confidence: 0.95,
      },
    },
    alternatives: {},
    unmatched: [],
  };
}

describe('PlanMatrix — virtualization', () => {
  it('renders every row when shot count is below threshold', () => {
    const shots = Array.from({ length: 10 }, (_, i) => buildShot(i));
    const { queryByTestId, container } = render(
      <PlanMatrix planId="p" shots={shots} virtualizeThreshold={40} />,
    );
    expect(queryByTestId('plan-matrix-virtual-viewport')).toBeNull();
    // 10 shot rows rendered as <tr>
    const rows = container.querySelectorAll('tbody > tr');
    expect(rows.length).toBe(10);
  });

  it('switches to a virtualized viewport above the threshold', () => {
    const shots = Array.from({ length: 120 }, (_, i) => buildShot(i));
    const { getByTestId, container } = render(
      <PlanMatrix
        planId="p"
        shots={shots}
        virtualizeThreshold={40}
        rowHeightPx={28}
        maxViewportPx={280}
      />,
    );
    // The scroll container is rendered.
    const viewport = getByTestId('plan-matrix-virtual-viewport');
    expect(viewport.style.maxHeight).toContain('280');

    // Body contains strictly fewer rendered rows than the shot count.
    const rows = container.querySelectorAll('tbody > tr');
    expect(rows.length).toBeLessThan(shots.length);

    // Virtualized label appears in the header.
    expect(container.textContent).toContain('virtualized');
  });

  it('includes spacer rows when paddingBottom is > 0', () => {
    const shots = Array.from({ length: 80 }, (_, i) => buildShot(i));
    const { container } = render(
      <PlanMatrix
        planId="p"
        shots={shots}
        virtualizeThreshold={40}
        rowHeightPx={28}
        maxViewportPx={140}
      />,
    );
    const spacers = container.querySelectorAll('tr[aria-hidden="true"]');
    // Initial render: paddingTop=0 (scrollTop=0) so only the bottom spacer.
    expect(spacers.length).toBeGreaterThanOrEqual(1);
  });
});
