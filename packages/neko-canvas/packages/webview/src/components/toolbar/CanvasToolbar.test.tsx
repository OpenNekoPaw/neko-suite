// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CanvasToolbar } from './CanvasToolbar';
import { setLocale } from '../../i18n';

vi.mock('@neko/ui/icons', () => ({
  DownloadIcon: ({ size = 16 }: { size?: number }) => <span data-icon="download">{size}</span>,
  LayersIcon: ({ size = 16 }: { size?: number }) => <span data-icon="layers">{size}</span>,
  PackageIcon: ({ size = 16 }: { size?: number }) => <span data-icon="package">{size}</span>,
  RedoIcon: ({ size = 16 }: { size?: number }) => <span data-icon="redo">{size}</span>,
  RightPanelIcon: ({ size = 16 }: { size?: number }) => <span data-icon="right-panel">{size}</span>,
  RightPanelOffIcon: ({ size = 16 }: { size?: number }) => (
    <span data-icon="right-panel-off">{size}</span>
  ),
  UndoIcon: ({ size = 16 }: { size?: number }) => <span data-icon="undo">{size}</span>,
}));

describe('CanvasToolbar', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    setLocale('en');
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
  });

  it('renders as the shared left vertical toolbar surface', () => {
    act(() => {
      root.render(<CanvasToolbar onUndo={() => undefined} onRedo={() => undefined} />);
    });

    expect(host.querySelector('.neko-vtoolbar')).not.toBeNull();
    expect(host.querySelector('.canvas-left-toolbar')?.getAttribute('aria-label')).toBe(
      'Canvas tools',
    );
    expect(host.querySelectorAll('.neko-toolbar-btn').length).toBeGreaterThan(0);
    expect(host.querySelector('[data-creative-left-rail-action="toggle-pan-mode"]')).not.toBeNull();
    expect(
      host.querySelector('[data-creative-left-rail-action="open-add-node-popover"]'),
    ).toBeNull();
    expect(host.querySelector('[data-creative-left-rail-action="import-file"]')).toBeNull();
  });

  it('controls the right node tree panel from the left toolbar', () => {
    const onToggleNodeLibrary = vi.fn();

    act(() => {
      root.render(
        <CanvasToolbar
          onUndo={() => undefined}
          onRedo={() => undefined}
          isNodeLibraryVisible={true}
          onToggleNodeLibrary={onToggleNodeLibrary}
          isHudVisible={true}
          onToggleHud={() => undefined}
        />,
      );
    });

    const toggleButton = host.querySelector<HTMLButtonElement>(
      '[data-creative-left-rail-action="toggle-right-node-tree"]',
    );
    expect(toggleButton?.getAttribute('aria-label')).toBe('Hide right node tree');
    expect(toggleButton?.getAttribute('aria-controls')).toBe('canvas-right-node-tree-panel');
    expect(toggleButton?.getAttribute('aria-expanded')).toBe('true');
    expect(toggleButton?.getAttribute('aria-pressed')).toBe('true');
    expect(toggleButton?.getAttribute('data-creative-left-rail-kind')).toBe('visibility-toggle');
    expect(toggleButton?.getAttribute('data-creative-left-rail-target')).toBe('right-panel');

    act(() => {
      toggleButton?.click();
    });
    expect(onToggleNodeLibrary).toHaveBeenCalledTimes(1);

    act(() => {
      root.render(
        <CanvasToolbar
          onUndo={() => undefined}
          onRedo={() => undefined}
          isNodeLibraryVisible={false}
          onToggleNodeLibrary={onToggleNodeLibrary}
          isHudVisible={true}
          onToggleHud={() => undefined}
        />,
      );
    });

    const collapsedButton = host.querySelector<HTMLButtonElement>(
      '[data-creative-left-rail-action="toggle-right-node-tree"]',
    );
    expect(collapsedButton?.getAttribute('aria-label')).toBe('Show right node tree');
    expect(collapsedButton?.getAttribute('aria-expanded')).toBe('false');
    expect(collapsedButton?.getAttribute('aria-pressed')).toBe('false');
  });

  it('opens separate Extension Host-owned export and package flows', () => {
    const onOpenExport = vi.fn();
    const onOpenPackage = vi.fn();

    act(() => {
      root.render(
        <CanvasToolbar
          onUndo={() => undefined}
          onRedo={() => undefined}
          onOpenExport={onOpenExport}
          onOpenPackage={onOpenPackage}
        />,
      );
    });

    const exportButton = host.querySelector<HTMLButtonElement>(
      '[data-creative-left-rail-action="open-export"]',
    );
    const packageButton = host.querySelector<HTMLButtonElement>(
      '[data-creative-left-rail-action="open-package"]',
    );
    expect(exportButton?.getAttribute('aria-label')).toBe('Export');
    expect(exportButton?.getAttribute('data-creative-left-rail-kind')).toBe('common-action');
    expect(exportButton?.querySelector('[data-icon="download"]')).not.toBeNull();
    expect(packageButton?.getAttribute('aria-label')).toBe('Package');
    expect(packageButton?.getAttribute('data-creative-left-rail-kind')).toBe('common-action');
    expect(packageButton?.querySelector('[data-icon="package"]')).not.toBeNull();

    act(() => {
      exportButton?.click();
      packageButton?.click();
    });
    expect(onOpenExport).toHaveBeenCalledTimes(1);
    expect(onOpenPackage).toHaveBeenCalledTimes(1);
  });

  it('controls canvas HUD visibility from the bottom visibility cluster', () => {
    const onToggleHud = vi.fn();

    act(() => {
      root.render(
        <CanvasToolbar
          onUndo={() => undefined}
          onRedo={() => undefined}
          isHudVisible={false}
          onToggleHud={onToggleHud}
        />,
      );
    });

    const toggleButton = host.querySelector<HTMLButtonElement>(
      '[data-creative-left-rail-action="toggle-hud-controls"]',
    );
    expect(toggleButton?.getAttribute('aria-label')).toBe('Show canvas HUD');
    expect(toggleButton?.getAttribute('aria-controls')).toBe('canvas-hud-controls');
    expect(toggleButton?.getAttribute('aria-expanded')).toBe('false');
    expect(toggleButton?.getAttribute('aria-pressed')).toBe('false');
    expect(toggleButton?.getAttribute('data-creative-left-rail-kind')).toBe('visibility-toggle');
    expect(toggleButton?.getAttribute('data-creative-left-rail-target')).toBe('hud');

    act(() => {
      toggleButton?.click();
    });
    expect(onToggleHud).toHaveBeenCalledTimes(1);
  });
});
