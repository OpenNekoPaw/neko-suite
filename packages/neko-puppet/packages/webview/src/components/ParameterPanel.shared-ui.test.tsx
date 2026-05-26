import React from 'react';
import type { ComponentProps } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ParameterPanel } from './ParameterPanel';
import { usePuppetStore } from '../stores/puppet-store';
import type { IPuppetController } from '../animation';
import type { PropertyPanel as SharedPropertyPanel } from '@neko/ui/creative';

let lastPropertyPanelProps: ComponentProps<typeof SharedPropertyPanel> | undefined;

vi.mock('@neko/ui/creative', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@neko/ui/creative')>();

  return {
    ...actual,
    PropertyPanel: (props: ComponentProps<typeof actual.PropertyPanel>) => {
      lastPropertyPanelProps = props;
      return <actual.PropertyPanel {...props} />;
    },
  };
});

vi.mock('../i18n/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string, params?: Record<string, string>) =>
      params?.['name'] ? `${key}:${params['name']}` : key,
  }),
}));

class TestResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

describe('Puppet ParameterPanel shared UI migration', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    globalThis.ResizeObserver = TestResizeObserver;
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    lastPropertyPanelProps = undefined;
    usePuppetStore.setState({
      puppetLoaded: true,
      puppetParameters: [{ name: 'ParamAngleX', min: -30, max: 30, default: 0, current: 12 }],
      nativeBlendShapes: [],
    });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
    usePuppetStore.getState().resetAnimation();
  });

  it('renders parameter sliders through shared PropertyPanel and reset commits defaults', () => {
    const controller = {
      setParameter: vi.fn().mockResolvedValue(undefined),
    } as unknown as IPuppetController;

    act(() => {
      root.render(<ParameterPanel controller={controller} />);
    });

    const propertyRow = host.querySelector('[data-property-id="ParamAngleX"]');
    expect(propertyRow).not.toBeNull();
    expect(propertyRow?.querySelector('[role="slider"]')?.getAttribute('aria-valuenow')).toBe('12');

    const resetButton = Array.from(host.querySelectorAll('button')).find(
      (button) => button.textContent === 'Reset',
    );
    act(() => {
      resetButton?.click();
    });

    expect(controller.setParameter).toHaveBeenCalledWith('ParamAngleX', 0);
    expect(usePuppetStore.getState().puppetParameters[0]?.current).toBe(0);
  });

  it('keeps parameter preview local and sends engine RPC only on commit', () => {
    const controller = {
      setParameter: vi.fn().mockResolvedValue(undefined),
    } as unknown as IPuppetController;

    act(() => {
      root.render(<ParameterPanel controller={controller} />);
    });

    expect(lastPropertyPanelProps).toBeDefined();

    act(() => {
      lastPropertyPanelProps?.onPreviewChange?.('ParamAngleX', 18);
    });

    expect(usePuppetStore.getState().puppetParameters[0]?.current).toBe(18);
    expect(controller.setParameter).not.toHaveBeenCalled();

    act(() => {
      lastPropertyPanelProps?.onCommit?.('ParamAngleX', 18);
    });

    expect(controller.setParameter).toHaveBeenCalledTimes(1);
    expect(controller.setParameter).toHaveBeenCalledWith('ParamAngleX', 18);
  });
});
