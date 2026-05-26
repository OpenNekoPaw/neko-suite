// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CanvasToolbar } from './CanvasToolbar';
import { setLocale } from '../../i18n';

vi.mock('@neko/ui/icons', () => ({
  PlusIcon: ({ size = 16 }: { size?: number }) => <span data-icon="plus">{size}</span>,
  RedoIcon: ({ size = 16 }: { size?: number }) => <span data-icon="redo">{size}</span>,
  RightPanelIcon: ({ size = 16 }: { size?: number }) => <span data-icon="right-panel">{size}</span>,
  RightPanelOffIcon: ({ size = 16 }: { size?: number }) => (
    <span data-icon="right-panel-off">{size}</span>
  ),
  UndoIcon: ({ size = 16 }: { size?: number }) => <span data-icon="undo">{size}</span>,
  UploadIcon: ({ size = 16 }: { size?: number }) => <span data-icon="upload">{size}</span>,
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
      root.render(
        <CanvasToolbar
          onAddText={() => undefined}
          onUndo={() => undefined}
          onRedo={() => undefined}
        />,
      );
    });

    expect(host.querySelector('.neko-vtoolbar')).not.toBeNull();
    expect(host.querySelectorAll('.neko-toolbar-btn').length).toBeGreaterThan(0);
  });

  it('keeps add-node choices in the toolbar popover', () => {
    const onAddShot = vi.fn();

    act(() => {
      root.render(
        <CanvasToolbar
          onAddText={() => undefined}
          onUndo={() => undefined}
          onRedo={() => undefined}
          onAddShot={onAddShot}
        />,
      );
    });

    const addButton = host
      .querySelector('[data-icon="plus"]')
      ?.closest<HTMLButtonElement>('.neko-toolbar-btn');

    act(() => {
      addButton?.click();
    });

    const menuItem = host.querySelector<HTMLButtonElement>('.neko-menu-item');

    act(() => {
      menuItem?.click();
    });

    expect(onAddShot).toHaveBeenCalledTimes(1);
  });

  it('controls the right node tree panel from the left toolbar', () => {
    const onToggleNodeLibrary = vi.fn();

    act(() => {
      root.render(
        <CanvasToolbar
          onAddText={() => undefined}
          onUndo={() => undefined}
          onRedo={() => undefined}
          isNodeLibraryVisible={true}
          onToggleNodeLibrary={onToggleNodeLibrary}
        />,
      );
    });

    const toggleButton = host.querySelector<HTMLButtonElement>(
      '[data-canvas-toolbar-action="toggle-right-node-tree"]',
    );
    expect(toggleButton?.getAttribute('aria-label')).toBe('Hide right node tree');
    expect(toggleButton?.getAttribute('aria-controls')).toBe('canvas-right-node-tree-panel');
    expect(toggleButton?.getAttribute('aria-expanded')).toBe('true');
    expect(toggleButton?.getAttribute('aria-pressed')).toBe('true');

    act(() => {
      toggleButton?.click();
    });
    expect(onToggleNodeLibrary).toHaveBeenCalledTimes(1);

    act(() => {
      root.render(
        <CanvasToolbar
          onAddText={() => undefined}
          onUndo={() => undefined}
          onRedo={() => undefined}
          isNodeLibraryVisible={false}
          onToggleNodeLibrary={onToggleNodeLibrary}
        />,
      );
    });

    const collapsedButton = host.querySelector<HTMLButtonElement>(
      '[data-canvas-toolbar-action="toggle-right-node-tree"]',
    );
    expect(collapsedButton?.getAttribute('aria-label')).toBe('Show right node tree');
    expect(collapsedButton?.getAttribute('aria-expanded')).toBe('false');
    expect(collapsedButton?.getAttribute('aria-pressed')).toBe('false');
  });
});
