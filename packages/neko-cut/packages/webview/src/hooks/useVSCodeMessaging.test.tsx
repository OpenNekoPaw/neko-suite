// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PROJECT_FILE_SNAPSHOT_REQUEST, PROJECT_FILE_SNAPSHOT_RESPONSE } from '@neko/shared';
import { useEditorStore } from '../stores/editor-store';
import { useVSCodeMessaging } from './useVSCodeMessaging';
import type { ProjectData } from '../types';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const vscodePostMessage = vi.hoisted(() => vi.fn());

vi.mock('../utils/vscodeApi', () => ({
  getVSCodeAPI: () => ({
    postMessage: vscodePostMessage,
    getState: vi.fn(),
    setState: vi.fn(),
  }),
  postMessage: vscodePostMessage,
}));

vi.mock('../services/frameServerMessages', () => ({
  isFrameServerMessage: vi.fn(() => false),
  publishFrameServerMessage: vi.fn(),
}));

vi.mock('../utils/fileUri', () => ({
  getFileUri: vi.fn(),
  handleFileUriResponse: vi.fn(),
  requestFileUri: vi.fn(),
}));

vi.mock('../services', () => ({
  getMediaInfoService: () => ({
    getDuration: vi.fn(async () => 12),
  }),
}));

vi.mock('../services/mediaProxyFactory', () => ({
  getMediaProxy: () => ({
    probeMediaInfo: vi.fn(async () => ({ hasAudio: false })),
    extractSubtitles: vi.fn(async () => []),
  }),
}));

describe('useVSCodeMessaging project snapshot protocol', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    vscodePostMessage.mockClear();
    useEditorStore.setState({ project: createProject(), projectRoot: undefined });
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    document.body.innerHTML = '';
    useEditorStore.setState({ project: null, projectRoot: undefined });
  });

  it('returns the current Cut project when the host requests a project-file snapshot', () => {
    act(() => {
      root.render(<Harness subscribeToExtensionMessages />);
    });

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: PROJECT_FILE_SNAPSHOT_REQUEST,
            requestId: 'snapshot-1',
            formatId: 'nkv',
            saveReason: 'vscode-save',
          },
        }),
      );
    });

    expect(vscodePostMessage).toHaveBeenCalledWith({
      type: PROJECT_FILE_SNAPSHOT_RESPONSE,
      requestId: 'snapshot-1',
      ok: true,
      document: createProject(),
    });
  });

  it('does not register host message handlers for send-only callers', () => {
    act(() => {
      root.render(<Harness />);
    });

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: PROJECT_FILE_SNAPSHOT_REQUEST,
            requestId: 'snapshot-send-only',
            formatId: 'nkv',
            saveReason: 'vscode-save',
          },
        }),
      );
    });

    expect(vscodePostMessage).not.toHaveBeenCalled();
  });

  it('sends project-changed snapshots when the Cut store changes locally', () => {
    act(() => {
      root.render(<Harness subscribeToExtensionMessages />);
    });

    const changedProject = createProject({ name: 'Changed Locally' });
    act(() => {
      useEditorStore.setState({ project: changedProject });
    });

    expect(vscodePostMessage).toHaveBeenCalledWith({
      type: 'project:changed',
      document: changedProject,
    });
  });

  it('does not echo extension update messages as project-changed snapshots', () => {
    act(() => {
      root.render(<Harness subscribeToExtensionMessages />);
    });

    const loadedProject = createProject({ name: 'Loaded From Extension' });
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'update',
            content: loadedProject,
            projectRoot: '/workspace/project',
          },
        }),
      );
    });

    expect(vscodePostMessage).not.toHaveBeenCalledWith({
      type: 'project:changed',
      document: loadedProject,
    });
  });

  it('does not echo VS Code save confirmations as project-changed snapshots', () => {
    act(() => {
      root.render(<Harness subscribeToExtensionMessages />);
    });

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'saved',
          },
        }),
      );
    });

    expect(vscodePostMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'project:changed',
      }),
    );
  });

  it('adds project:addSource results to the timeline before project snapshots are saved', async () => {
    act(() => {
      root.render(<Harness subscribeToExtensionMessages />);
    });

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: 'project:sourceAdded',
            result: {
              requestId: 'add-source-1',
              ok: true,
              durablePath: 'cases/720P.mp4',
              diagnostics: [],
              ingest: {
                status: 'ready',
                request: {
                  mode: 'link',
                  destination: { kind: 'project', directory: 'media', copyMode: 'link' },
                  metadata: {
                    addToTimeline: true,
                    mediaType: 'video',
                    name: '720P.mp4',
                  },
                },
                source: { kind: 'file', path: 'cases/720P.mp4' },
                contractedPath: 'cases/720P.mp4',
              },
            },
          },
        }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });

    const projectChanged = vscodePostMessage.mock.calls.find(
      ([message]) =>
        typeof message === 'object' &&
        message !== null &&
        (message as { type?: unknown }).type === 'project:changed',
    )?.[0] as { document?: ProjectData } | undefined;
    expect(projectChanged?.document?.tracks[0]?.elements[0]).toMatchObject({
      type: 'media',
      src: 'cases/720P.mp4',
      name: '720P.mp4',
      duration: 12,
    });

    vscodePostMessage.mockClear();
    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: PROJECT_FILE_SNAPSHOT_REQUEST,
            requestId: 'snapshot-after-add',
            formatId: 'nkv',
            saveReason: 'vscode-save',
          },
        }),
      );
    });

    expect(vscodePostMessage).toHaveBeenCalledWith({
      type: PROJECT_FILE_SNAPSHOT_RESPONSE,
      requestId: 'snapshot-after-add',
      ok: true,
      document: expect.objectContaining({
        tracks: [
          expect.objectContaining({
            elements: [
              expect.objectContaining({
                type: 'media',
                src: 'cases/720P.mp4',
                name: '720P.mp4',
              }),
            ],
          }),
        ],
      }),
    });
  });
});

function Harness({
  subscribeToExtensionMessages = false,
}: {
  readonly subscribeToExtensionMessages?: boolean;
}): React.ReactElement | null {
  useVSCodeMessaging({ subscribeToExtensionMessages });
  return null;
}

function createProject(overrides: Partial<ProjectData> = {}): ProjectData {
  return {
    version: '2.0',
    name: 'Snapshot Test',
    resolution: { width: 1920, height: 1080 },
    fps: 30,
    tracks: [
      {
        id: 'track-1',
        name: 'Main Track',
        type: 'media',
        elements: [],
        muted: false,
        locked: false,
        hidden: false,
        isMain: true,
      },
    ],
    ...overrides,
  };
}
