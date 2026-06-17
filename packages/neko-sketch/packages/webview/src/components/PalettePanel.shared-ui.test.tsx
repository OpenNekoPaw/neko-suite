// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSketchStore } from '../stores';
import { PalettePanel } from './PalettePanel';

vi.mock('@neko/ui/primitives', async () => {
  const actual = await vi.importActual<typeof import('@neko/ui/primitives')>('@neko/ui/primitives');
  return {
    ...actual,
    Select: ({
      label,
      onValueChange,
      options,
      value,
    }: {
      readonly label?: string;
      readonly onValueChange: (value: string) => void;
      readonly options: readonly { readonly value: string; readonly label: string }[];
      readonly value: string;
    }) => (
      <select
        aria-label={label}
        data-testid="shared-select"
        value={value}
        onChange={(event) => onValueChange(event.currentTarget.value)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    ),
  };
});

vi.mock('../i18n/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string>) =>
      params?.color ? `${key}:${params.color}` : key,
  }),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
(globalThis as { React?: typeof React }).React = React;

describe('Sketch PalettePanel shared UI migration', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    installLocalStorageMock();
    useSketchStore.setState({
      brushSettings: { ...useSketchStore.getState().brushSettings, color: '#FF004D' },
    });
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
    window.localStorage.clear();
  });

  it('uses shared controls and marks the active brush color as selected', () => {
    act(() => {
      root.render(<PalettePanel />);
    });

    expect(host.querySelector('[data-testid="shared-select"]')).not.toBeNull();
    expect(host.querySelectorAll<HTMLButtonElement>('.sketch-palette-swatch')).toHaveLength(16);

    const selected = host.querySelector<HTMLButtonElement>('[role="option"][aria-selected="true"]');
    expect(selected?.getAttribute('aria-label')).toBe('sketch.color.colorLabel:#FF004D');

    const target = host.querySelector<HTMLButtonElement>('[title="#00E436"]');
    act(() => {
      target?.click();
    });

    expect(useSketchStore.getState().brushSettings.color).toBe('#00E436');
  });

  it('announces palette import failures', async () => {
    act(() => {
      root.render(<PalettePanel />);
    });

    const fileInput = host.querySelector<HTMLInputElement>('input[type="file"]');
    const file = {
      name: 'broken.txt',
      arrayBuffer: async () => new TextEncoder().encode('not a palette').buffer,
    } as File;

    await act(async () => {
      Object.defineProperty(fileInput, 'files', {
        configurable: true,
        value: [file],
      });
      fileInput?.dispatchEvent(new Event('change', { bubbles: true }));
      await Promise.resolve();
    });

    expect(host.querySelector('[role="alert"]')?.textContent).toBe('sketch.palette.importFailed');
  });
});

function installLocalStorageMock(): void {
  const values = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return values.size;
    },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => Array.from(values.keys())[index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };

  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: storage,
  });
}
