// @vitest-environment jsdom

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildAIMenuSection, PositionedContextMenu } from './index';

describe('@neko/ui positioned context menu', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    document.body.replaceChildren();
  });

  it('renders manual-position menu items, separators, and action callbacks', () => {
    const onClose = vi.fn();
    const onRename = vi.fn();

    act(() => {
      root.render(
        <PositionedContextMenu
          x={12}
          y={24}
          items={[
            { label: 'Rename', shortcut: 'Enter', onClick: onRename },
            { separator: true },
            { label: 'Delete', danger: true, onClick: vi.fn() },
          ]}
          onClose={onClose}
        />,
      );
    });

    const menu = document.body.querySelector<HTMLElement>('.neko-menu');
    expect(menu?.getAttribute('role')).toBe('menu');
    expect(menu?.style.left).toBe('12px');
    expect(menu?.style.top).toBe('24px');
    expect(document.body.querySelectorAll('.neko-menu-sep')).toHaveLength(1);
    expect(document.body.textContent).toContain('Enter');

    act(() => {
      document.body.querySelector<HTMLButtonElement>('.neko-menu-item')?.click();
    });

    expect(onRename).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('closes on outside pointer down and Escape', () => {
    const onClose = vi.fn();

    act(() => {
      root.render(
        <PositionedContextMenu
          x={0}
          y={0}
          items={[{ label: 'Rename', onClick: vi.fn() }]}
          onClose={onClose}
        />,
      );
    });

    act(() => {
      document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    });
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'Escape' }));
    });

    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('builds standard AI menu sections with quick actions and agent submenu', () => {
    const quick = vi.fn();
    const agent = vi.fn();

    const items = buildAIMenuSection({
      quickActions: [{ id: 'generate', label: 'Generate', icon: 'AI', onClick: quick }],
      agentActions: [{ id: 'understand', label: 'Understand', onClick: agent }],
      sendToAgentLabel: 'Send to Agent',
    });

    expect(items).toHaveLength(4);
    expect(items[0]).toEqual({ separator: true });
    expect(items[1]).toMatchObject({ label: 'Generate', icon: 'AI' });
    expect(items[2]).toEqual({ separator: true });
    expect(items[3]).toMatchObject({ label: 'Send to Agent', icon: '🤖' });
  });
});
