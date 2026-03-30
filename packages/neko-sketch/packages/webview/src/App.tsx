/**
 * NekoSketch App - Root component
 *
 * Assembles the sketch editor layout:
 * Toolbar | Canvas | Side panels (Brush/Color/Layers)
 */
import { useEffect, useCallback, useState, useRef } from 'react';
import type { ExtensionToWebviewMessage } from './types';
import { useSketchStore } from './stores';
import {
  SketchCanvas,
  Toolbar,
  BrushPanel,
  LayerPanel,
  FrameTimeline,
  FrameControls,
  FilterPanel,
  ParticlePanel,
  ScenePanel,
  PalettePanel,
  SpriteSheetPlayer,
  VectorToolbar,
  CollapsiblePanel,
} from './components';
import { deserializeDocument, serializeDocument } from './utils/document-serializer';
import { dispatchKeyboardAction } from './utils/keyboard-dispatcher';
import { importImageAsLayer, importImageFromBlob, isImageMimeType } from './utils/image-import';
import { i18nService, setLocale } from './i18n';
import { I18nProvider } from './i18n/I18nContext';
import type { SupportedLocale } from '@neko/shared';

// Acquire VSCode API once
const vscode = (window as unknown as { acquireVsCodeApi: () => VsCodeApi }).acquireVsCodeApi();

interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

export function App() {
  const store = useSketchStore;
  const setCanvas = store((s) => s.setCanvas);
  const setLayers = store((s) => s.setLayers);
  const setViewport = store((s) => s.setViewport);
  const setActiveLayer = store((s) => s.setActiveLayer);
  const markClean = store((s) => s.markClean);
  const clearHistory = store((s) => s.clearHistory);
  // Sync status bar info to VSCode native status bar
  const viewport = store((s) => s.viewport);
  const canvasState = store((s) => s.canvas);
  const activeTool = store((s) => s.activeTool);
  const layerCount = store((s) => s.layers).length;
  const brushSize = store((s) => s.brushSettings).size;
  const sidebarWidth = store((s) => s.sidebarWidth);
  const setSidebarWidth = store((s) => s.setSidebarWidth);

  // Drag-over visual state
  const [isDragOver, setIsDragOver] = useState(false);

  // Horizontal resize for sidebar
  const [isHResizing, setIsHResizing] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const handleHResizeStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setIsHResizing(true);
  }, []);

  const handleHResizeMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isHResizing || !rootRef.current) return;
      const rootRect = rootRef.current.getBoundingClientRect();
      const newWidth = rootRect.right - e.clientX;
      setSidebarWidth(newWidth);
    },
    [isHResizing, setSidebarWidth],
  );

  const handleHResizeEnd = useCallback((e: React.PointerEvent) => {
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    setIsHResizing(false);
  }, []);

  useEffect(() => {
    vscode.postMessage({
      type: 'status:update',
      data: {
        zoom: viewport.zoom,
        canvasSize: `${canvasState.width} x ${canvasState.height}`,
        activeTool,
        layerCount,
        brushSize,
      },
    });
  }, [viewport.zoom, canvasState.width, canvasState.height, activeTool, layerCount, brushSize]);

  // Notify extension that webview is ready
  useEffect(() => {
    vscode.postMessage({ type: 'ready' });
  }, []);

  // Handle messages from extension
  const handleMessage = useCallback(
    (event: MessageEvent<ExtensionToWebviewMessage>) => {
      const msg = event.data;
      switch (msg.type) {
        case 'document:load': {
          const parsed = deserializeDocument(msg.data);
          if (parsed) {
            setCanvas(parsed.canvas);
            setLayers(parsed.layers);
            setViewport(parsed.viewport);
            // Auto-select the topmost raster layer (or last layer) for immediate editing
            const rasterLayer = [...parsed.layers].reverse().find((l) => l.type === 'raster');
            const fallback = parsed.layers[parsed.layers.length - 1];
            const target = rasterLayer ?? fallback;
            if (target) {
              setActiveLayer(target.id);
            }
          }
          markClean();
          break;
        }

        case 'document:revert': {
          // Re-request document from extension
          vscode.postMessage({ type: 'ready' });
          clearHistory();
          break;
        }

        case 'document:save': {
          const state = store.getState();
          const canvas = document.getElementById('sketch-canvas') as HTMLCanvasElement | null;
          const gl = canvas?.getContext('webgl2') ?? null;
          const doc = serializeDocument(state.canvas, state.layers, state.viewport, gl);
          vscode.postMessage({ type: 'document:save', data: doc });
          markClean();
          break;
        }

        case 'keyboardAction': {
          dispatchKeyboardAction(msg.action, store.getState(), vscode);
          break;
        }

        case 'file:imported': {
          void handleFileImport(msg.name, msg.data);
          break;
        }

        case 'setLocale': {
          setLocale(msg.locale as SupportedLocale);
          break;
        }

        default:
          break;
      }
    },
    [setCanvas, setLayers, setViewport, setActiveLayer, markClean, clearHistory],
  );

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  // --- Clipboard paste: import image from Ctrl+V / Cmd+V ---
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent): void => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (isImageMimeType(item.type)) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) {
            void handleBlobImport(file, 'Pasted Image');
          }
          return; // Only import the first image
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  // --- Drag-and-drop: import image files ---
  useEffect(() => {
    const root = document.getElementById('root');
    if (!root) return;

    const handleDragOver = (e: DragEvent): void => {
      // Only show feedback if transfer contains files or URIs
      if (
        e.dataTransfer?.types.includes('Files') ||
        e.dataTransfer?.types.includes('text/uri-list')
      ) {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer) {
          e.dataTransfer.dropEffect = 'copy';
        }
        setIsDragOver(true);
      }
    };

    const handleDragLeave = (e: DragEvent): void => {
      // Only reset when leaving the root element (not children)
      if (e.relatedTarget === null || !root.contains(e.relatedTarget as Node)) {
        setIsDragOver(false);
      }
    };

    const handleDrop = (e: DragEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      if (!e.dataTransfer) return;

      // Case 1: OS file manager drag — dataTransfer.files available
      if (e.dataTransfer.files.length > 0) {
        for (const file of Array.from(e.dataTransfer.files)) {
          if (isImageMimeType(file.type)) {
            void handleBlobImport(file, file.name);
            return; // Import the first valid image
          }
        }
      }

      // Case 2: VSCode Explorer drag — text/uri-list (sandbox blocks file data)
      const uriList = e.dataTransfer.getData('text/uri-list');
      if (uriList) {
        vscode.postMessage({ type: 'file:dropRequest', uris: uriList });
      }
    };

    root.addEventListener('dragover', handleDragOver);
    root.addEventListener('dragleave', handleDragLeave);
    root.addEventListener('drop', handleDrop);
    return () => {
      root.removeEventListener('dragover', handleDragOver);
      root.removeEventListener('dragleave', handleDragLeave);
      root.removeEventListener('drop', handleDrop);
    };
  }, []);

  return (
    <I18nProvider service={i18nService}>
      <div className="flex flex-col h-screen w-screen overflow-hidden relative">
        {/* Drag-over visual feedback */}
        {isDragOver && (
          <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none bg-black/30 border-2 border-dashed border-[var(--vscode-focusBorder,#007acc)]">
            <div className="text-white text-lg font-medium px-6 py-3 rounded-lg bg-black/60">
              Drop image to import as layer
            </div>
          </div>
        )}
        <div ref={rootRef} className="flex flex-1 overflow-hidden">
          <Toolbar />
          <div className="sketch-canvas-container">
            <SketchCanvas />
          </div>
          {store((s) => s.showSidebar) && (
            <>
              {/* Horizontal Resize Handle */}
              <div
                onPointerDown={handleHResizeStart}
                onPointerMove={handleHResizeMove}
                onPointerUp={handleHResizeEnd}
                className={`w-1 flex-shrink-0 cursor-ew-resize border-l border-vscode-panel-border transition-colors ${
                  isHResizing ? 'bg-vscode-accent' : 'hover:bg-vscode-accent/50'
                }`}
                style={{ touchAction: 'none' }}
              />
              <div
                className="flex-shrink-0 overflow-hidden border-l border-[var(--neko-border)]"
                style={{ width: sidebarWidth, background: 'var(--neko-surface)' }}
              >
                <div className="flex flex-col h-full overflow-y-auto">
                  <CollapsiblePanel
                    titleKey={activeTool === 'eraser' ? 'sketch.tool.eraser' : 'sketch.panel.brush'}
                  >
                    <BrushPanel />
                  </CollapsiblePanel>
                  {activeTool === 'shape' && (
                    <CollapsiblePanel titleKey="sketch.panel.vector">
                      <VectorToolbar />
                    </CollapsiblePanel>
                  )}
                  <CollapsiblePanel titleKey="sketch.panel.palette">
                    <PalettePanel />
                  </CollapsiblePanel>
                  <CollapsiblePanel titleKey="sketch.panel.layers">
                    <LayerPanel />
                  </CollapsiblePanel>
                  <CollapsiblePanel titleKey="sketch.panel.filters" defaultExpanded={false}>
                    <FilterPanel />
                  </CollapsiblePanel>
                  <CollapsiblePanel titleKey="sketch.panel.frames" defaultExpanded={false}>
                    <FrameControls />
                  </CollapsiblePanel>
                  <CollapsiblePanel titleKey="sketch.panel.spritesheet" defaultExpanded={false}>
                    <SpriteSheetPlayer />
                  </CollapsiblePanel>
                  <CollapsiblePanel titleKey="sketch.panel.particles" defaultExpanded={false}>
                    <ParticlePanel />
                  </CollapsiblePanel>
                  <CollapsiblePanel titleKey="sketch.panel.scene" defaultExpanded={false}>
                    <ScenePanel />
                  </CollapsiblePanel>
                </div>
              </div>
            </>
          )}
        </div>
        <FrameTimeline />
      </div>
    </I18nProvider>
  );
}

/** Import an image file as a new layer */
async function handleFileImport(name: string, base64Data: string): Promise<void> {
  try {
    const { layer } = await importImageAsLayer(name, base64Data);
    const state = useSketchStore.getState();
    state.setLayers([...state.layers, layer]);
    state.setActiveLayer(layer.id);
    state.markDirty();
  } catch {
    // Silently fail — extension already logged the error
  }
}

/** Import an image from a Blob/File (clipboard paste or drag-drop) */
async function handleBlobImport(blob: Blob, name: string): Promise<void> {
  try {
    const { layer } = await importImageFromBlob(blob, name);
    const state = useSketchStore.getState();
    state.setLayers([...state.layers, layer]);
    state.setActiveLayer(layer.id);
    state.markDirty();
  } catch {
    // Silently fail — bitmap decode may fail for unsupported formats
  }
}
