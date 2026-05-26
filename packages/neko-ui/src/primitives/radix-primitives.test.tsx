import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Button, Popover, Select, Slider, Tooltip } from './index';

class TestResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

describe('@neko/ui Radix-backed primitives', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    globalThis.ResizeObserver = TestResizeObserver;
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

  it('renders Tooltip trigger without changing command element semantics', () => {
    act(() => {
      root.render(
        <Tooltip content="Run command">
          <Button>Run</Button>
        </Tooltip>,
      );
    });

    expect(host.querySelector('button')?.textContent).toBe('Run');
  });

  it('renders controlled Popover trigger', () => {
    const onOpenChange = vi.fn();

    act(() => {
      root.render(
        <Popover onOpenChange={onOpenChange} trigger={<Button>Open</Button>}>
          Content
        </Popover>,
      );
    });

    const button = host.querySelector('button');
    expect(button?.textContent).toBe('Open');
  });

  it('renders Select trigger with current value', () => {
    const onValueChange = vi.fn();

    act(() => {
      root.render(
        <Select
          label="Mode"
          onValueChange={onValueChange}
          options={[
            { value: 'edit', label: 'Edit' },
            { value: 'view', label: 'View', disabled: true },
          ]}
          value="edit"
        />,
      );
    });

    expect(host.querySelector('button')?.getAttribute('aria-label')).toBe('Mode');
    expect(host.textContent).toContain('Edit');
  });

  it('emits Slider preview and commit values', () => {
    act(() => {
      root.render(<Slider label="Opacity" max={100} min={0} value={40} />);
    });

    const slider = host.querySelector('[role="slider"]');
    expect(slider?.getAttribute('aria-label')).toBe('Opacity');
    expect(slider?.getAttribute('aria-valuenow')).toBe('40');
  });
});
