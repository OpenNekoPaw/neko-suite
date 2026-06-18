// @vitest-environment jsdom

import { act } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAudioStore } from '../stores/audioStore';
import { TransportBar } from './TransportBar';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock('../i18n', () => ({
  t: (key: string, params?: Record<string, string>) =>
    params ? `${key}:${params.start}-${params.end}` : key,
}));

vi.mock('../shared/useVscodeMessage', () => ({
  postMessage: vi.fn(),
}));

vi.mock('./shared/AudioUiPrimitives', () => ({
  AudioButton: ({ children, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
  AudioIconButton: ({
    active: _active,
    children,
    label,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & { readonly label: string }) => (
    <button type="button" aria-label={label} {...props}>
      {children}
    </button>
  ),
  AudioSelect: () => <select aria-label="mock-select" />,
  AudioSlider: () => <div data-testid="mock-slider" />,
}));

describe('Audio media time labels', () => {
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

  it('renders transport and selection labels through shared media time formatting', () => {
    const store = useAudioStore.getState();
    store.setFileInfo('/project/song.wav', 'song.wav', {
      duration: 3661.25,
      codec: 'pcm',
      sampleRate: 48000,
      channels: 2,
      format: 'wav',
    });
    store.setCurrentTime(65.678);
    store.setSelection({ start: 1.234, end: 12.345 });

    act(() => {
      root.render(<TransportBar onTogglePlay={vi.fn()} onSeek={vi.fn()} onStop={vi.fn()} />);
    });

    expect(host.textContent).toContain('1:05.67 / 1:01:01.25');
    expect(host.textContent).toContain('audio.waveform.selection:0:01.23-0:12.34');
  });
});
