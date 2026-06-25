// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RouteStoryboardMatrix } from './RouteStoryboardMatrixView';
import type { RouteStoryboardMatrixViewModel } from './routeStoryboardMatrix';
import { setLocale } from '../../i18n';

(globalThis as { React?: typeof React }).React = React;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock('@neko/ui/icons', () => ({
  ChevronDownIcon: ({ size = 16 }: { size?: number }) => (
    <span data-icon="chevron-down">{size}</span>
  ),
  ChevronRightIcon: ({ size = 16 }: { size?: number }) => (
    <span data-icon="chevron-right">{size}</span>
  ),
  SendIcon: ({ size = 16 }: { size?: number }) => <span data-icon="send">{size}</span>,
}));

describe('RouteStoryboardMatrix', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    setLocale('en');
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
  });

  it('renders route families, aligned cells, diagnostics, and row send actions', () => {
    const onSelectRoute = vi.fn();
    const onSelectCell = vi.fn();
    const onSelectColumn = vi.fn();
    const onSelectFamily = vi.fn();
    const onToggleContainerFold = vi.fn();
    const onSendToCut = vi.fn();
    const onFocusCell = vi.fn();
    const onSelectSummaryCell = vi.fn();

    act(() => {
      root.render(
        <RouteStoryboardMatrix
          matrix={matrixFixture()}
          selectedRouteId="route-a"
          currentUnitId="unit-a"
          focusedCellId="cell:route-a:container:scene-a:shot-a"
          onSelectRoute={onSelectRoute}
          onSelectCell={onSelectCell}
          onSelectSummaryCell={onSelectSummaryCell}
          onSelectColumn={onSelectColumn}
          onSelectFamily={onSelectFamily}
          onToggleContainerFold={onToggleContainerFold}
          onSendToCut={onSendToCut}
          onFocusCell={onFocusCell}
        />,
      );
    });

    const matrix = host.querySelector<HTMLElement>(
      '[data-testid="canvas-route-storyboard-matrix"]',
    );
    expect(matrix).not.toBeNull();
    expect(matrix?.getAttribute('role')).toBe('grid');
    expect(matrix?.getAttribute('tabindex')).toBe('0');
    expect(host.querySelector('.canvas-route-storyboard-matrix-header')).not.toBeNull();
    expect(host.querySelector('.canvas-route-storyboard-matrix-header-columns')).not.toBeNull();
    expect(host.querySelector('.canvas-route-storyboard-matrix-body')).not.toBeNull();
    expect(host.textContent).toContain('Primary routes');
    expect(host.textContent).toContain('Alt routes');
    expect(host.textContent).toContain('Scene A');
    expect(host.textContent).toContain('Shot A');
    expect(host.textContent).toContain('Folded Scene');
    expect(host.textContent).toContain('Empty');
    expect(host.textContent).toContain('Missing preview metadata');
    expect(host.textContent).toContain('Second diagnostic');
    expect(host.textContent).not.toContain('Third diagnostic');
    expect(
      host.querySelector('.canvas-route-storyboard-matrix-row')?.getAttribute('data-selected'),
    ).toBe('true');
    expect(
      host
        .querySelectorAll('.canvas-route-storyboard-matrix-row')[1]
        ?.getAttribute('data-selected'),
    ).toBe('false');
    expect(
      host
        .querySelector('.canvas-route-storyboard-matrix-cell-playable')
        ?.getAttribute('data-media-state'),
    ).toBe('playable');
    expect(
      host
        .querySelector('.canvas-route-storyboard-matrix-cell-playable')
        ?.getAttribute('data-highlight'),
    ).toBe('true');
    expect(
      host
        .querySelector('.canvas-route-storyboard-matrix-cell-playable')
        ?.getAttribute('data-focused'),
    ).toBe('true');
    expect(
      host.querySelector('.canvas-route-storyboard-matrix-container')?.getAttribute('data-folded'),
    ).toBe('true');
    expect(
      host.querySelector('.canvas-route-storyboard-matrix-family')?.getAttribute('aria-selected'),
    ).toBe('true');
    expect(
      host
        .querySelectorAll('.canvas-route-storyboard-matrix-family')[1]
        ?.getAttribute('aria-selected'),
    ).toBe('false');

    act(() => {
      host
        .querySelector<HTMLButtonElement>('.canvas-route-storyboard-matrix-cell-playable')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      host
        .querySelector<HTMLButtonElement>('.canvas-route-storyboard-matrix-step')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      host
        .querySelector<HTMLButtonElement>('.canvas-route-storyboard-matrix-send')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      host
        .querySelector<HTMLButtonElement>('.canvas-route-storyboard-matrix-cell-summary')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onFocusCell).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'cell:route-a:container:scene-a:shot-a' }),
    );
    expect(onSelectCell).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'playable', unitId: 'unit-a' }),
    );
    expect(onSelectColumn).toHaveBeenCalledWith('column:container:scene-a:shot-a');
    expect(onSendToCut).toHaveBeenCalledWith(expect.objectContaining({ routeId: 'route-a' }));
    expect(onSelectSummaryCell).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'summary', containerNodeId: 'scene-a' }),
    );
  });

  it('handles keyboard navigation and activation instead of swallowing owned keys', () => {
    const onSelectCell = vi.fn();
    const onFocusCell = vi.fn();
    const onSelectColumn = vi.fn();
    const onClearFocus = vi.fn();

    act(() => {
      root.render(
        <RouteStoryboardMatrix
          matrix={matrixFixture()}
          onSelectRoute={() => undefined}
          onSelectCell={onSelectCell}
          onSelectColumn={onSelectColumn}
          onSelectFamily={() => undefined}
          onToggleContainerFold={() => undefined}
          onSendToCut={() => undefined}
          onFocusCell={onFocusCell}
          onClearFocus={onClearFocus}
        />,
      );
    });

    const matrix = host.querySelector<HTMLElement>(
      '[data-testid="canvas-route-storyboard-matrix"]',
    );

    expect(matrix?.getAttribute('data-neko-keyboard-scope')).toBe('media-preview');
    expect(matrix?.getAttribute('data-neko-keyboard-owner')).toBe('canvas-route-storyboard-matrix');
    expect(matrix?.getAttribute('data-neko-keyboard-owned-keys')).toBe(
      'Enter Escape Space ArrowLeft ArrowRight ArrowUp ArrowDown',
    );

    act(() => {
      matrix?.dispatchEvent(createKeyEvent('ArrowRight'));
    });
    expect(onFocusCell).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'cell:route-a:container:scene-a:shot-b:empty' }),
    );

    act(() => {
      matrix?.dispatchEvent(createKeyEvent('ArrowLeft'));
    });
    expect(onFocusCell).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'cell:route-a:container:scene-a:shot-a' }),
    );

    act(() => {
      matrix?.dispatchEvent(createKeyEvent('ArrowDown'));
    });
    expect(onFocusCell).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'cell:route-b:container:scene-a:summary' }),
    );

    act(() => {
      matrix?.dispatchEvent(createKeyEvent('ArrowUp'));
    });
    expect(onFocusCell).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: 'cell:route-a:container:scene-a:shot-a' }),
    );

    act(() => {
      matrix?.dispatchEvent(createKeyEvent('Enter'));
    });
    expect(onSelectCell).toHaveBeenCalledWith(expect.objectContaining({ unitId: 'unit-a' }));

    act(() => {
      matrix?.dispatchEvent(createKeyEvent(' '));
    });
    expect(onSelectCell).toHaveBeenCalledTimes(2);

    act(() => {
      matrix?.dispatchEvent(createKeyEvent('2'));
    });
    expect(onSelectColumn).toHaveBeenCalledWith('column:container:scene-a:shot-b');

    act(() => {
      matrix?.dispatchEvent(createKeyEvent('Escape'));
    });
    expect(onClearFocus).toHaveBeenCalled();
  });
});

function createKeyEvent(key: string): KeyboardEvent {
  return new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    key,
  });
}

function matrixFixture(): RouteStoryboardMatrixViewModel {
  return {
    planAdapterId: 'storyboard',
    activeRouteFamilyId: 'family:primary',
    selectedRouteId: 'route-a',
    families: [
      {
        id: 'family:primary',
        title: 'Primary routes',
        sourceKind: 'primary',
        routeIds: ['route-a', 'route-b'],
        visibleRouteIds: ['route-a'],
        foldedRouteIds: ['route-b'],
      },
      {
        id: 'family:selection:shot-c',
        title: 'Alt routes',
        sourceKind: 'selection',
        sourceNodeId: 'shot-c',
        routeIds: ['route-c'],
        visibleRouteIds: ['route-c'],
        foldedRouteIds: [],
      },
    ],
    rows: [
      {
        id: 'row:route-a',
        routeId: 'route-a',
        familyId: 'family:primary',
        title: 'Route A',
        sourceKind: 'entry',
        unitIds: ['unit-a'],
        totalDurationMs: 1000,
        diagnostics: [],
        cells: [
          {
            kind: 'playable',
            id: 'cell:route-a:container:scene-a:shot-a',
            rowId: 'row:route-a',
            routeId: 'route-a',
            containerId: 'container:scene-a',
            columnStart: 0,
            columnSpan: 1,
            unitId: 'unit-a',
            sourceNodeId: 'shot-a',
            stableIdentity: 'shot-a',
            label: 'Shot A',
            unitKind: 'shot',
            durationMs: 1000,
            startMs: 0,
            endMs: 1000,
            mediaState: 'playable',
            highlight: true,
            diagnostics: [],
          },
          {
            kind: 'empty',
            id: 'cell:route-a:container:scene-a:shot-b:empty',
            rowId: 'row:route-a',
            routeId: 'route-a',
            containerId: 'container:scene-a',
            columnStart: 1,
            columnSpan: 1,
            stableIdentity: 'shot-b',
            semanticAnchor: {
              containerNodeId: 'scene-a',
              previousUnitId: 'unit-a',
              previousSourceNodeId: 'shot-a',
            },
          },
        ],
      },
      {
        id: 'row:route-b',
        routeId: 'route-b',
        familyId: 'family:primary',
        title: 'Route B',
        sourceKind: 'entry',
        unitIds: ['unit-b'],
        totalDurationMs: 1000,
        diagnostics: [],
        cells: [
          {
            kind: 'summary',
            id: 'cell:route-b:container:scene-a:summary',
            rowId: 'row:route-b',
            routeId: 'route-b',
            containerId: 'container:scene-a',
            containerNodeId: 'scene-a',
            columnStart: 0,
            columnSpan: 2,
            label: 'Folded Scene',
            unitIds: ['unit-b'],
            durationMs: 1000,
            playableCount: 1,
          },
        ],
      },
    ],
    containerGroups: [
      {
        id: 'container:scene-a',
        title: 'Scene A',
        containerNodeId: 'scene-a',
        startColumnIndex: 0,
        slotCount: 2,
        folded: true,
        unitCount: 2,
      },
    ],
    columns: [
      {
        id: 'column:container:scene-a:shot-a',
        index: 0,
        containerId: 'container:scene-a',
        stableIdentity: 'shot-a',
        title: 'Shot A',
      },
      {
        id: 'column:container:scene-a:shot-b',
        index: 1,
        containerId: 'container:scene-a',
        stableIdentity: 'shot-b',
        title: 'Shot B',
      },
    ],
    diagnostics: [
      {
        code: 'matrix-playback-diagnostic',
        severity: 'warning',
        message: 'Missing preview metadata',
      },
      {
        code: 'matrix-playback-diagnostic',
        severity: 'warning',
        message: 'Second diagnostic',
      },
      {
        code: 'matrix-playback-diagnostic',
        severity: 'warning',
        message: 'Third diagnostic',
      },
    ],
  };
}
