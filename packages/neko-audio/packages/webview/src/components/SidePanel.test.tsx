// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SidePanel } from './SidePanel';
import { useAudioStore } from '../stores/audioStore';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock('./EffectsPanel', () => ({
  EffectsPanel: () => <div data-testid="effects-panel" />,
}));

vi.mock('./RecordingPanel', () => ({
  RecordingPanel: () => <div data-testid="recording-panel" />,
}));

vi.mock('./ExportPanel', () => ({
  ExportPanel: () => <div data-testid="export-panel" />,
}));

vi.mock('./PresetBrowser', () => ({
  PresetBrowser: () => <div data-testid="preset-browser" />,
}));

vi.mock('./AudioAiOperationPanel', () => ({
  AudioAiOperationPanel: () => <div data-testid="ai-panel" />,
}));

vi.mock('./AudioInspectorPanel', () => ({
  AudioInspectorPanel: () => <div data-testid="inspector-panel" />,
}));

vi.mock('./MarkersRegionsPanel', () => ({
  MarkersRegionsPanel: () => <div data-testid="markers-panel" />,
}));

vi.mock('../hooks/useEffectsChain', () => ({
  useEffectsChain: () => ({}),
}));

vi.mock('../i18n', () => ({
  t: (key: string) => key,
}));

vi.mock('@neko/ui/icons', () => ({
  CloseIcon: ({ className = '' }: { readonly className?: string }) => (
    <span data-icon="close" className={className} />
  ),
}));

describe('Audio SidePanel', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    useAudioStore.getState().reset();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
  });

  it('keeps right panel section switches inside the side panel', () => {
    useAudioStore.getState().openSidePanel('effects');

    act(() => {
      root.render(<SidePanel mode="professional" />);
    });

    expect(host.querySelector('#audio-side-panel')).toBeNull();
    expect(host.querySelector('[data-testid="effects-panel"]')).not.toBeNull();

    const tabs = host.querySelectorAll<HTMLButtonElement>('.audio-side-panel-tabs button');
    expect(tabs).toHaveLength(7);
    expect(tabs[2]?.getAttribute('aria-selected')).toBe('true');

    act(() => {
      tabs[4]?.click();
    });

    expect(useAudioStore.getState().activeSidePanel).toBe('recording');
  });

  it('hides professional effects chain from basic mode and falls back to recording', () => {
    useAudioStore.getState().openSidePanel('effects');

    act(() => {
      root.render(<SidePanel mode="basic" />);
    });

    expect(host.querySelector('[data-testid="effects-panel"]')).toBeNull();
    expect(host.querySelector('[data-testid="ai-panel"]')).not.toBeNull();

    const tabs = host.querySelectorAll<HTMLButtonElement>('.audio-side-panel-tabs button');
    expect(tabs).toHaveLength(5);
    expect(useAudioStore.getState().activeSidePanel).toBe('ai');
  });
});
