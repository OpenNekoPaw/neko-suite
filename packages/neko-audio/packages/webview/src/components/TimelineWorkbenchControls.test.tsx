// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioProjectData, TimelineElement, TimelineTrack } from '@neko/shared';
import { TimelineToolModeBar } from './TimelineToolModeBar';
import { SelectionActionBar } from './SelectionActionBar';
import { AddSourceStrip } from './AddSourceStrip';
import { useAudioStore } from '../stores/audioStore';
import { useAudioProjectStore } from '../stores/audioProjectStore';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const postedMessages: unknown[] = [];
const addSourceMock = vi.fn();

vi.mock('../i18n', () => ({
  t: (key: string) => key,
}));

vi.mock('@neko/ui/icons', () => ({
  PlusIcon: ({ size = 16 }: { readonly size?: number }) => <span data-icon="plus">{size}</span>,
  UploadIcon: ({ size = 16 }: { readonly size?: number }) => <span data-icon="upload">{size}</span>,
}));

vi.mock('../shared/useVscodeMessage', () => ({
  getVsCodeApi: () => ({
    postMessage: (message: unknown) => postedMessages.push(message),
  }),
  postMessage: (message: unknown) => postedMessages.push(message),
}));

vi.mock('@neko/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@neko/shared')>();
  return {
    ...actual,
    createProjectSourceAddClient: () => ({
      addSource: addSourceMock,
    }),
  };
});

function createElement(
  overrides: Partial<Extract<TimelineElement, { type: 'audio' }>> = {},
): TimelineElement {
  return {
    id: 'clip-1',
    type: 'audio',
    name: 'Clip 1',
    src: 'audio/clip.wav',
    duration: 10,
    startTime: 2,
    trimStart: 0,
    trimEnd: 0,
    transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0, anchorX: 0, anchorY: 0 },
    opacity: 1,
    blendMode: 'normal',
    effects: [],
    muted: false,
    hidden: false,
    locked: false,
    ...overrides,
  };
}

function createTrack(overrides: Partial<TimelineTrack> = {}): TimelineTrack {
  return {
    id: 'track-1',
    name: 'Voice',
    type: 'audio',
    elements: [createElement()],
    muted: false,
    locked: false,
    hidden: false,
    isMain: true,
    ...overrides,
  };
}

function createProject(overrides: Partial<AudioProjectData> = {}): AudioProjectData {
  return {
    version: '2.2',
    name: 'Project',
    sampleRate: 48000,
    channels: 2,
    tracks: [createTrack()],
    masterEffectsChain: [],
    markers: [],
    ...overrides,
  };
}

describe('timeline workbench controls', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    postedMessages.length = 0;
    addSourceMock.mockReset().mockResolvedValue({ ok: true, diagnostics: [], requestId: 'req-1' });
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    useAudioStore.getState().reset();
    useAudioProjectStore.getState().reset();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    host.remove();
  });

  it('switches active timeline tool mode', () => {
    act(() => {
      root.render(<TimelineToolModeBar />);
    });

    const split = host.querySelector<HTMLButtonElement>('button[title="audio.toolMode.split"]');
    expect(split).not.toBeNull();
    act(() => {
      split?.click();
    });

    expect(useAudioStore.getState().activeTimelineTool).toBe('split');
    expect(split?.getAttribute('aria-pressed')).toBe('true');
  });

  it('renders selection actions and routes split through project store', () => {
    useAudioProjectStore.getState().initProject(createProject());
    useAudioStore.getState().setCurrentTime(5);
    useAudioStore
      .getState()
      .setSelectedWorkbenchTarget({ kind: 'clip', trackId: 'track-1', elementId: 'clip-1' });

    act(() => {
      root.render(<SelectionActionBar />);
    });

    const split = host.querySelector<HTMLButtonElement>(
      'button[title="audio.workbench.actions.split"]',
    );
    expect(split).not.toBeNull();
    expect(split?.disabled).toBe(false);

    act(() => {
      split?.click();
    });

    const elements = useAudioProjectStore.getState().audioProjectData?.tracks[0]?.elements;
    expect(elements).toHaveLength(2);
  });

  it('does not render selection actions without target or region', () => {
    useAudioProjectStore.getState().initProject(createProject());

    act(() => {
      root.render(<SelectionActionBar />);
    });

    expect(host.querySelector('.selection-action-bar')).toBeNull();
  });

  it('uses project add-source client and local track/panel actions', async () => {
    useAudioProjectStore.getState().initProject(createProject({ tracks: [] }));

    await act(async () => {
      root.render(<AddSourceStrip />);
    });

    const buttons = Array.from(host.querySelectorAll<HTMLButtonElement>('button'));
    const importButton = buttons.find((button) =>
      button.textContent?.includes('audio.addSource.import'),
    );
    const trackButton = buttons.find((button) =>
      button.textContent?.includes('audio.addSource.track'),
    );
    const recordButton = buttons.find((button) =>
      button.textContent?.includes('audio.addSource.record'),
    );
    const aiButton = buttons.find((button) =>
      button.textContent?.includes('audio.addSource.aiGenerate'),
    );

    await act(async () => {
      importButton?.click();
    });
    expect(addSourceMock).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'file-picker',
        formatId: 'nka',
        target: { role: 'audio' },
      }),
    );

    act(() => {
      recordButton?.click();
    });
    expect(useAudioStore.getState().activeSidePanel).toBe('recording');

    act(() => {
      aiButton?.click();
    });
    expect(useAudioStore.getState().activeSidePanel).toBe('ai');

    act(() => {
      trackButton?.click();
    });
    expect(useAudioProjectStore.getState().audioProjectData?.tracks).toHaveLength(1);
  });

  it('keeps the compact bottom source strip focused on source and track actions', async () => {
    useAudioProjectStore.getState().initProject(createProject());

    await act(async () => {
      root.render(<AddSourceStrip />);
    });

    expect(host.querySelector('.add-source-strip.compact')).not.toBeNull();
    expect(host.textContent).toContain('audio.addSource.import');
    expect(host.textContent).toContain('audio.addSource.track');
    expect(host.textContent).not.toContain('audio.addSource.record');
    expect(host.textContent).not.toContain('audio.addSource.aiGenerate');
    expect(host.textContent).not.toContain('audio.package.project');
  });
});
