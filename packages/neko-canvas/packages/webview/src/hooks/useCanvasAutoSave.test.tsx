// @vitest-environment jsdom
import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CanvasData } from '@neko/shared';
import { useCanvasAutoSave } from './useCanvasAutoSave';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const BASE_CANVAS: CanvasData = {
  version: '2.1',
  name: 'Loaded Canvas',
  viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
  nodes: [],
  connections: [],
};

describe('useCanvasAutoSave', () => {
  let host: HTMLDivElement;
  let root: Root;
  let onBeforeSave: ReturnType<typeof vi.fn<() => void>>;
  let onSave: ReturnType<typeof vi.fn<(canvasData: CanvasData) => void>>;
  let savedApi: UseCanvasAutoSaveHarnessApi | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    onBeforeSave = vi.fn<() => void>();
    onSave = vi.fn();
    savedApi = undefined;
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('does not save immediately after a loaded document is marked as saved', () => {
    act(() => {
      root.render(
        <UseCanvasAutoSaveHarness
          canvasData={BASE_CANVAS}
          isReady
          onBeforeSave={onBeforeSave}
          onSave={onSave}
          onReady={(api) => {
            savedApi = api;
          }}
        />,
      );
    });

    act(() => {
      savedApi?.markSaved(BASE_CANVAS);
      vi.advanceTimersByTime(301);
    });

    expect(onBeforeSave).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('does not save when the loaded document becomes ready after its baseline is marked', () => {
    act(() => {
      root.render(
        <UseCanvasAutoSaveHarness
          canvasData={BASE_CANVAS}
          isReady={false}
          onBeforeSave={onBeforeSave}
          onSave={onSave}
          onReady={(api) => {
            savedApi = api;
          }}
        />,
      );
    });

    act(() => {
      savedApi?.markSaved(BASE_CANVAS);
    });

    act(() => {
      root.render(
        <UseCanvasAutoSaveHarness
          canvasData={BASE_CANVAS}
          isReady
          onBeforeSave={onBeforeSave}
          onSave={onSave}
          onReady={(api) => {
            savedApi = api;
          }}
        />,
      );
    });

    act(() => {
      vi.advanceTimersByTime(301);
    });

    expect(onBeforeSave).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('saves once after semantic canvas data changes', () => {
    act(() => {
      root.render(
        <UseCanvasAutoSaveHarness
          canvasData={BASE_CANVAS}
          isReady
          onBeforeSave={onBeforeSave}
          onSave={onSave}
          onReady={(api) => {
            savedApi = api;
          }}
        />,
      );
    });

    act(() => {
      savedApi?.markSaved(BASE_CANVAS);
    });

    const updatedCanvas: CanvasData = {
      ...BASE_CANVAS,
      nodes: [
        {
          id: 'node-1',
          type: 'text',
          position: { x: 0, y: 0 },
          size: { width: 240, height: 120 },
          zIndex: 0,
          data: { content: 'Note' },
        },
      ],
    };

    act(() => {
      root.render(
        <UseCanvasAutoSaveHarness
          canvasData={updatedCanvas}
          isReady
          onBeforeSave={onBeforeSave}
          onSave={onSave}
          onReady={(api) => {
            savedApi = api;
          }}
        />,
      );
    });

    act(() => {
      vi.advanceTimersByTime(301);
    });

    expect(onBeforeSave).toHaveBeenCalledOnce();
    expect(onSave).toHaveBeenCalledWith(updatedCanvas);
  });

  it('keeps a save pending until the extension confirms it', () => {
    act(() => {
      root.render(
        <UseCanvasAutoSaveHarness
          canvasData={BASE_CANVAS}
          isReady
          onBeforeSave={onBeforeSave}
          onSave={onSave}
          onReady={(api) => {
            savedApi = api;
          }}
        />,
      );
    });

    act(() => {
      savedApi?.markSaved(BASE_CANVAS);
    });

    const updatedCanvas: CanvasData = {
      ...BASE_CANVAS,
      nodes: [
        {
          id: 'node-1',
          type: 'text',
          position: { x: 0, y: 0 },
          size: { width: 240, height: 120 },
          zIndex: 0,
          data: { content: 'Note' },
        },
      ],
    };

    act(() => {
      root.render(
        <UseCanvasAutoSaveHarness
          canvasData={updatedCanvas}
          isReady
          onBeforeSave={onBeforeSave}
          onSave={onSave}
          onReady={(api) => {
            savedApi = api;
          }}
        />,
      );
    });

    act(() => {
      vi.advanceTimersByTime(301);
    });

    expect(onSave).toHaveBeenCalledTimes(1);

    act(() => {
      root.render(
        <UseCanvasAutoSaveHarness
          canvasData={updatedCanvas}
          isReady
          onBeforeSave={onBeforeSave}
          onSave={onSave}
          onReady={(api) => {
            savedApi = api;
          }}
        />,
      );
      vi.advanceTimersByTime(301);
    });

    expect(onSave).toHaveBeenCalledTimes(1);

    act(() => {
      savedApi?.markSaved(updatedCanvas);
      vi.advanceTimersByTime(301);
    });

    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it('does not save viewport-only changes', () => {
    act(() => {
      root.render(
        <UseCanvasAutoSaveHarness
          canvasData={BASE_CANVAS}
          isReady
          onBeforeSave={onBeforeSave}
          onSave={onSave}
          onReady={(api) => {
            savedApi = api;
          }}
        />,
      );
    });

    act(() => {
      savedApi?.markSaved(BASE_CANVAS);
    });

    const viewportOnlyChange: CanvasData = {
      ...BASE_CANVAS,
      viewport: { pan: { x: 100, y: 200 }, zoom: 0.75 },
    };

    act(() => {
      root.render(
        <UseCanvasAutoSaveHarness
          canvasData={viewportOnlyChange}
          isReady
          onBeforeSave={onBeforeSave}
          onSave={onSave}
          onReady={(api) => {
            savedApi = api;
          }}
        />,
      );
    });

    act(() => {
      vi.advanceTimersByTime(301);
    });

    expect(onBeforeSave).not.toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });
});

interface UseCanvasAutoSaveHarnessApi {
  readonly markSaved: (canvasData: CanvasData) => void;
}

function UseCanvasAutoSaveHarness({
  canvasData,
  isReady,
  onBeforeSave,
  onSave,
  onReady,
}: {
  readonly canvasData: CanvasData | null;
  readonly isReady: boolean;
  readonly onBeforeSave: () => void;
  readonly onSave: (canvasData: CanvasData) => void;
  readonly onReady: (api: UseCanvasAutoSaveHarnessApi) => void;
}): null {
  const api = useCanvasAutoSave({
    canvasData,
    isReady,
    delayMs: 300,
    onBeforeSave,
    onSave,
  });

  React.useEffect(() => {
    onReady(api);
  }, [api, onReady]);

  return null;
}
