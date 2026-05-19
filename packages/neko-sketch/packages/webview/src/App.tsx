/**
 * NekoSketch App - Root component
 *
 * Assembles the sketch editor layout:
 * Toolbar | Canvas | Side panels (Brush/Color/Layers)
 */
import { useEffect, useCallback, useState } from 'react';
import { ResizeHandle, useResizable } from '@neko/shared/components';
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
  FillPanel,
  ParticlePanel,
  ScenePanel,
  PalettePanel,
  AIPanel,
  SpriteSheetPlayer,
  VectorToolbar,
  PerspectiveGridPanel,
  CollapsiblePanel,
} from './components';
import { deserializeDocument, serializeDocument } from './utils/document-serializer';
import { dispatchKeyboardAction } from './utils/keyboard-dispatcher';
import { isEditableTarget } from './utils/editable-target';
import { getSketchKeyboardAction } from './utils/sketch-keyboard-shortcuts';
import { importImageAsLayer, importImageFromBlob, isImageMimeType } from './utils/image-import';
import { createTextureStampAssetFromBase64 } from './brush';
import { exportLayerImageDataBase64 } from './utils/layer-export';
import { mapPsdDocumentTree } from './utils/psd-layer-mapper';
import { applySketchAIResult } from './ai/ai-result-applier';
import { applySketchAIResultWithSession, type SketchAIApplySnapshot } from './ai/ai-apply-flow';
import { SketchAISessionStore } from './ai/ai-session-store';
import type {
  SketchAIOperationParams,
  SketchAIOperationType,
  SketchAIResult,
  SketchAIRun,
} from './ai/ai-progress-types';
import { i18nService, setLocale } from './i18n';
import { I18nProvider } from './i18n/I18nContext';
import type { SketchRuntimeFeatureFlags, SupportedLocale } from '@neko/shared';
import type { CanvasConfig, LayerData } from './types';

interface AppSketchAIApplySnapshot extends SketchAIApplySnapshot {
  readonly wasDirty: boolean;
}

interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

interface SketchWebviewWindow {
  acquireVsCodeApi(): VsCodeApi;
  __vscode_api__?: VsCodeApi;
}

// Acquire VSCode API once and expose it to operation sync helpers.
const webviewWindow = window as unknown as SketchWebviewWindow;
const vscode = webviewWindow.acquireVsCodeApi();
webviewWindow.__vscode_api__ = vscode;
const aiSessionStore = new SketchAISessionStore();
const DEFAULT_FEATURE_FLAGS: SketchRuntimeFeatureFlags = {
  psdImportEnabled: false,
  aiOps: {
    enabled: false,
    operations: {},
  },
};

function isSketchAIOperationEnabled(
  flags: SketchRuntimeFeatureFlags,
  operation: SketchAIOperationType,
): boolean {
  return flags.aiOps.enabled && flags.aiOps.operations[operation] !== false;
}

function hasAvailableSketchAIOperations(flags: SketchRuntimeFeatureFlags): boolean {
  if (!flags.aiOps.enabled) {
    return false;
  }
  const operationFlags = Object.values(flags.aiOps.operations);
  return operationFlags.length === 0 || operationFlags.some((enabled) => enabled);
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
  const [aiRuns, setAIRuns] = useState<readonly SketchAIRun[]>(() => aiSessionStore.list());
  const [featureFlags, setFeatureFlags] =
    useState<SketchRuntimeFeatureFlags>(DEFAULT_FEATURE_FLAGS);

  // Drag-over visual state
  const [isDragOver, setIsDragOver] = useState(false);

  const {
    isResizing: isHResizing,
    containerRef: rootRef,
    handleProps: sidebarResizeHandleProps,
  } = useResizable<HTMLDivElement>({
    edge: 'right',
    mode: 'pixel',
    size: sidebarWidth,
    onSizeChange: setSidebarWidth,
  });

  useEffect(() => {
    vscode.postMessage({
      type: 'status:update',
      data: {
        zoom: viewport.zoom,
        rotation: viewport.rotation,
        canvasSize: `${canvasState.width} x ${canvasState.height}`,
        activeTool,
        layerCount,
        brushSize,
      },
    });
  }, [
    viewport.zoom,
    viewport.rotation,
    canvasState.width,
    canvasState.height,
    activeTool,
    layerCount,
    brushSize,
  ]);

  // Notify extension that webview is ready
  useEffect(() => {
    vscode.postMessage({ type: 'ready' });
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      const action = getSketchKeyboardAction(event);
      if (!action) {
        return;
      }
      event.preventDefault();
      dispatchKeyboardAction(action, store.getState(), vscode);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [store]);

  useEffect(() => aiSessionStore.subscribe(setAIRuns), []);

  const handleCancelAIRun = useCallback((runId: string) => {
    aiSessionStore.cancel(runId, 'Cancelling');
    vscode.postMessage({ type: 'ai:cancel', runId });
  }, []);

  const handleDismissAIRun = useCallback((runId: string) => {
    aiSessionStore.delete(runId);
  }, []);

  const handleApplyAIResult = useCallback((runId: string) => {
    const pending = aiSessionStore.getPendingResult(runId);
    if (!pending) {
      return;
    }
    void handleAIResultApply(pending.runId, pending.operation, pending.result);
  }, []);

  const handleDiscardAIResult = useCallback((runId: string) => {
    aiSessionStore.clearPendingResult(runId);
    aiSessionStore.delete(runId);
    notifyAIResultApplied(runId, false, 'discarded');
  }, []);

  const handleOpenAgentForAI = useCallback(
    (operation: SketchAIOperationType, prompt: string, params: SketchAIOperationParams) => {
      if (!isSketchAIOperationEnabled(featureFlags, operation)) {
        return;
      }
      vscode.postMessage({ type: 'ai:openAgent', operation, prompt, params });
    },
    [featureFlags],
  );

  // Handle messages from extension
  const handleMessage = useCallback(
    async (event: MessageEvent<ExtensionToWebviewMessage>) => {
      const msg = event.data;
      switch (msg.type) {
        case 'document:load': {
          const parsed = deserializeDocument(msg.data);
          if (parsed) {
            setCanvas(parsed.canvas);
            setLayers(parsed.layers);
            setViewport(parsed.viewport);
            // Restore scenes (lighting, camera, atmosphere)
            const state = store.getState();
            state.clearScenes();
            for (const scene of parsed.scenes) {
              store.setState((s) => ({ scenes: [...s.scenes, scene] }));
            }
            if (parsed.scenes.length > 0) {
              state.setActiveScene(parsed.scenes[0]!.id);
            }
            // Restore global filters — always clear first to prevent bleed between documents
            state.clearFilters();
            if (parsed.filters.length > 0) {
              store.setState({ filters: parsed.filters });
            }
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
          const doc = serializeDocument(
            state.canvas,
            state.layers,
            state.viewport,
            gl,
            state.scenes,
            state.filters,
          );
          vscode.postMessage({ type: 'document:save', data: doc });
          markClean();
          break;
        }

        case 'keyboardAction': {
          if (isEditableTarget(document.activeElement)) {
            break;
          }
          dispatchKeyboardAction(msg.action, store.getState(), vscode);
          break;
        }

        case 'file:imported': {
          void handleFileImport(msg.name, msg.data);
          break;
        }

        case 'file:importedPsdTree': {
          handlePsdTreeImport(msg.payload);
          break;
        }

        case 'stamp:imported': {
          void handleTextureStampImport(msg.name, msg.data, msg.mimeType);
          break;
        }

        case 'file:importResult': {
          // Extension already owns user-visible import errors; this message keeps
          // the protocol explicit for kill switch and failure telemetry.
          break;
        }

        case 'featureFlags:update': {
          setFeatureFlags(msg.flags);
          break;
        }

        case 'ai:progress': {
          aiSessionStore.recordProgress(msg.runId, msg.operation, msg.percent, msg.stage);
          break;
        }

        case 'ai:resultApply': {
          aiSessionStore.stageResult(msg.runId, msg.operation, msg.result);
          break;
        }

        case 'ai:error': {
          aiSessionStore.fail(msg.runId, msg.message);
          break;
        }

        case 'ai:cancel': {
          aiSessionStore.cancel(msg.runId);
          break;
        }

        case 'setLocale': {
          setLocale(msg.locale as SupportedLocale);
          break;
        }

        // ─── Phase 2/3: Extension → Webview data requests ───

        case 'request:exportCanvas':
        case 'request:canvasImageData': {
          const canvas = document.getElementById('sketch-canvas') as HTMLCanvasElement | null;
          let data: string | null = null;
          if (canvas) {
            try {
              const dataUrl = canvas.toDataURL('image/png');
              data = dataUrl.split(',')[1] ?? null;
            } catch {
              // WebGL canvas may lack preserveDrawingBuffer — data stays null
            }
          }
          const responseType =
            msg.type === 'request:exportCanvas'
              ? 'response:exportCanvas'
              : 'response:canvasImageData';
          vscode.postMessage({ type: responseType, requestId: msg.requestId, data });
          break;
        }

        case 'request:layerImageData': {
          const canvas = document.getElementById('sketch-canvas') as HTMLCanvasElement | null;
          const state = store.getState();
          const data = exportLayerImageDataBase64({
            layers: state.layers,
            activeLayerId: state.activeLayerId,
            layerId: msg.layerId,
            gl: canvas?.getContext('webgl2') ?? null,
          });
          vscode.postMessage({ type: 'response:layerImageData', requestId: msg.requestId, data });
          break;
        }

        case 'request:selectionMask': {
          const state = store.getState();
          const sel = state.selection;
          if (!sel) {
            vscode.postMessage({
              type: 'response:selectionMask',
              requestId: msg.requestId,
              data: null,
            });
            break;
          }

          // Compute bounding box of selected pixels
          let minX = sel.width,
            maxX = 0,
            minY = sel.height,
            maxY = 0,
            found = false;
          for (let y = 0; y < sel.height; y++) {
            for (let x = 0; x < sel.width; x++) {
              if ((sel.data[y * sel.width + x] ?? 0) > 0) {
                minX = Math.min(minX, x);
                maxX = Math.max(maxX, x);
                minY = Math.min(minY, y);
                maxY = Math.max(maxY, y);
                found = true;
              }
            }
          }
          if (!found) {
            vscode.postMessage({
              type: 'response:selectionMask',
              requestId: msg.requestId,
              data: null,
            });
            break;
          }

          // Build grayscale mask PNG via OffscreenCanvas
          let maskBase64: string | null = null;
          let canvasBase64: string | null = null;
          try {
            const oc = new OffscreenCanvas(sel.width, sel.height);
            const octx = oc.getContext('2d')!;
            const imgData = new ImageData(sel.width, sel.height);
            for (let i = 0; i < sel.data.length; i++) {
              const v = sel.data[i] ?? 0;
              imgData.data[i * 4] = v;
              imgData.data[i * 4 + 1] = v;
              imgData.data[i * 4 + 2] = v;
              imgData.data[i * 4 + 3] = 255;
            }
            octx.putImageData(imgData, 0, 0);
            const blob = await oc.convertToBlob({ type: 'image/png' });
            maskBase64 = await new Promise<string>((res) => {
              const fr = new FileReader();
              fr.onload = () => res((fr.result as string).split(',')[1] ?? '');
              fr.readAsDataURL(blob);
            });

            // Composite canvas as source image for inpainting
            const sketchCanvas = document.getElementById(
              'sketch-canvas',
            ) as HTMLCanvasElement | null;
            if (sketchCanvas) {
              canvasBase64 = sketchCanvas.toDataURL('image/png').split(',')[1] ?? null;
            }
          } catch {
            /* OffscreenCanvas may not be available */
          }

          if (!maskBase64 || !canvasBase64) {
            vscode.postMessage({
              type: 'response:selectionMask',
              requestId: msg.requestId,
              data: null,
            });
            break;
          }

          vscode.postMessage({
            type: 'response:selectionMask',
            requestId: msg.requestId,
            data: {
              x: minX,
              y: minY,
              width: maxX - minX + 1,
              height: maxY - minY + 1,
              mask: maskBase64,
              layerImageData: canvasBase64,
            },
          });
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
        <AIRunMonitor
          runs={aiRuns}
          getPendingResult={(runId) => aiSessionStore.getPendingResult(runId)?.result ?? null}
          onApply={handleApplyAIResult}
          onCancel={handleCancelAIRun}
          onDiscard={handleDiscardAIResult}
          onDismiss={handleDismissAIRun}
        />
        <div ref={rootRef} className="flex flex-1 overflow-hidden">
          <Toolbar />
          <div className="sketch-canvas-container">
            <SketchCanvas />
          </div>
          {store((s) => s.showSidebar) && (
            <>
              {/* Horizontal Resize Handle */}
              <ResizeHandle
                handleProps={sidebarResizeHandleProps}
                className={`w-1 flex-shrink-0 cursor-ew-resize border-l border-vscode-panel-border transition-colors ${
                  isHResizing ? 'bg-vscode-accent' : 'hover:bg-vscode-accent/50'
                }`}
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
                  {activeTool === 'fill' && (
                    <CollapsiblePanel titleKey="sketch.panel.fill">
                      <FillPanel />
                    </CollapsiblePanel>
                  )}
                  <CollapsiblePanel titleKey="sketch.panel.palette">
                    <PalettePanel />
                  </CollapsiblePanel>
                  <CollapsiblePanel titleKey="sketch.panel.perspective" defaultExpanded={false}>
                    <PerspectiveGridPanel />
                  </CollapsiblePanel>
                  {hasAvailableSketchAIOperations(featureFlags) && (
                    <CollapsiblePanel titleKey="sketch.panel.ai" defaultExpanded={false}>
                      <AIPanel
                        operationAvailability={featureFlags.aiOps.operations}
                        onOpenAgent={handleOpenAgentForAI}
                      />
                    </CollapsiblePanel>
                  )}
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

function AIRunMonitor({
  runs,
  getPendingResult,
  onApply,
  onCancel,
  onDiscard,
  onDismiss,
}: {
  readonly runs: readonly SketchAIRun[];
  readonly getPendingResult: (runId: string) => SketchAIResult | null;
  readonly onApply: (runId: string) => void;
  readonly onCancel: (runId: string) => void;
  readonly onDiscard: (runId: string) => void;
  readonly onDismiss: (runId: string) => void;
}): JSX.Element | null {
  const visibleRuns = runs.filter((run) => run.state !== 'completed' && run.state !== 'idle');
  if (visibleRuns.length === 0) {
    return null;
  }

  return (
    <div className="absolute right-3 bottom-10 z-40 flex w-[min(360px,calc(100vw-1.5rem))] flex-col gap-2 pointer-events-none">
      {visibleRuns.slice(-3).map((run) => {
        const canCancel = run.state === 'preparing' || run.state === 'running';
        const pendingResult = getPendingResult(run.runId);
        const preview = pendingResult ? getAIResultPreview(pendingResult) : null;
        return (
          <div
            key={run.runId}
            className="pointer-events-auto border border-[var(--neko-border)] bg-[var(--neko-surface)] shadow-lg"
            style={{ borderRadius: 6 }}
          >
            <div className="flex items-start gap-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-xs font-medium text-[var(--vscode-foreground)]">
                    {formatAIOperation(run.operation)}
                  </span>
                  <span className="shrink-0 text-[10px] uppercase text-[var(--vscode-descriptionForeground)]">
                    {run.state}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden bg-[var(--vscode-progressBar-background,#0e70c0)]/20">
                  <div
                    className="h-full bg-[var(--vscode-progressBar-background,#0e70c0)] transition-[width]"
                    style={{ width: `${Math.round(run.progress * 100)}%` }}
                  />
                </div>
                {run.stage && (
                  <div className="mt-1 truncate text-[11px] text-[var(--vscode-descriptionForeground)]">
                    {run.stage}
                  </div>
                )}
                {preview && (
                  <div className="mt-2 overflow-hidden border border-[var(--neko-border)] bg-[var(--vscode-editor-background)]">
                    <img
                      src={preview.src}
                      alt={preview.alt}
                      className="h-28 w-full object-contain"
                      draggable={false}
                    />
                  </div>
                )}
                {typeof run.metadata.error === 'string' && (
                  <div className="mt-1 line-clamp-2 text-[11px] text-[var(--vscode-errorForeground,#f85149)]">
                    {run.metadata.error}
                  </div>
                )}
              </div>
              {run.state === 'previewing' && pendingResult ? (
                <div className="flex shrink-0 flex-col gap-1">
                  <button
                    type="button"
                    className="border border-[var(--vscode-button-border)] bg-[var(--vscode-button-background)] px-2 py-0.5 text-xs text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)]"
                    style={{ borderRadius: 4 }}
                    onClick={() => onApply(run.runId)}
                    aria-label={`Apply ${formatAIOperation(run.operation)}`}
                    title="Apply"
                  >
                    Apply
                  </button>
                  <button
                    type="button"
                    className="border border-[var(--vscode-button-border)] px-2 py-0.5 text-xs hover:bg-[var(--vscode-button-hoverBackground)]"
                    style={{ borderRadius: 4 }}
                    onClick={() => onDiscard(run.runId)}
                    aria-label={`Discard ${formatAIOperation(run.operation)}`}
                    title="Discard"
                  >
                    Discard
                  </button>
                </div>
              ) : canCancel ? (
                <button
                  type="button"
                  className="shrink-0 border border-[var(--vscode-button-border)] px-2 py-0.5 text-xs hover:bg-[var(--vscode-button-hoverBackground)]"
                  style={{ borderRadius: 4 }}
                  onClick={() => onCancel(run.runId)}
                  aria-label={`Cancel ${formatAIOperation(run.operation)}`}
                  title="Cancel"
                >
                  Cancel
                </button>
              ) : run.state === 'failed' || run.state === 'cancelled' ? (
                <button
                  type="button"
                  className="shrink-0 border border-[var(--vscode-button-border)] px-2 py-0.5 text-xs hover:bg-[var(--vscode-button-hoverBackground)]"
                  style={{ borderRadius: 4 }}
                  onClick={() => onDismiss(run.runId)}
                  aria-label={`Dismiss ${formatAIOperation(run.operation)}`}
                  title="Dismiss"
                >
                  Dismiss
                </button>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function getAIResultPreview(
  result: SketchAIResult,
): { readonly src: string; readonly alt: string } | null {
  switch (result.kind) {
    case 'layer':
    case 'selection':
      return result.data.kind === 'webviewUri'
        ? { src: result.data.ref, alt: `${result.kind} preview` }
        : null;
    case 'palette':
    case 'brushPreset':
      return null;
    default:
      return null;
  }
}

function formatAIOperation(operation: SketchAIRun['operation']): string {
  return operation
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/** Import an image file as a new layer */
async function handleFileImport(name: string, base64Data: string): Promise<void> {
  try {
    const { layer } = await importImageAsLayer(name, base64Data);
    applyImportedLayers({ layers: [layer], sourceName: name, sourceKind: 'image' });
  } catch {
    // Silently fail — extension already logged the error
  }
}

/** Import an image from a Blob/File (clipboard paste or drag-drop) */
async function handleBlobImport(blob: Blob, name: string): Promise<void> {
  try {
    const { layer } = await importImageFromBlob(blob, name);
    applyImportedLayers({ layers: [layer], sourceName: name, sourceKind: 'image' });
  } catch {
    // Silently fail — bitmap decode may fail for unsupported formats
  }
}

async function handleTextureStampImport(
  name: string,
  base64Data: string,
  mimeType: string,
): Promise<void> {
  try {
    const asset = await createTextureStampAssetFromBase64(name, base64Data, mimeType);
    useSketchStore.getState().addTextureStampAsset(asset);
  } catch {
    // Extension owns file-level errors; decode failures keep the current brush unchanged.
  }
}

function handlePsdTreeImport(payload: import('@neko/shared').PsdImportPayloadWire): void {
  const result = mapPsdDocumentTree(payload.tree, payload.issues);
  applyImportedLayers({
    layers: result.layers,
    canvas: result.canvas,
    sourceName: payload.name,
    sourceKind: 'PSD',
  });
}

async function handleAIResultApply(
  runId: string,
  operation: import('./ai/ai-progress-types').SketchAIOperationType,
  result: import('./ai/ai-progress-types').SketchAIResult,
): Promise<void> {
  await applySketchAIResultWithSession(runId, operation, result, {
    sessionStore: aiSessionStore,
    applyResult: (aiResult) =>
      applySketchAIResult(aiResult, {
        getLayers: () => useSketchStore.getState().layers,
        setLayers: (layers) => useSketchStore.getState().setLayers(layers),
        setActiveLayer: (id) => useSketchStore.getState().setActiveLayer(id),
        setSelectionMask: (mask) => useSketchStore.getState().setSelectionMask(mask),
        setBrushSettings: (updates) => useSketchStore.getState().setBrushSettings(updates),
        markDirty: () => useSketchStore.getState().markDirty(),
      }),
    captureSnapshot: captureAIApplySnapshot,
    rollbackSnapshot: rollbackAIApplySnapshot,
    pushHistorySnapshot,
    notifyDocumentEdited,
    notifyResultApplied: notifyAIResultApplied,
  });
}

function applyImportedLayers(params: {
  readonly layers: readonly LayerData[];
  readonly canvas?: CanvasConfig;
  readonly sourceName: string;
  readonly sourceKind: 'image' | 'PSD';
}): void {
  const state = useSketchStore.getState();
  const before = captureLayerHistorySnapshot();
  const shouldAdoptCanvas = params.canvas !== undefined && state.layers.length === 0;
  if (!shouldAdoptCanvas && params.layers.length === 0) {
    return;
  }

  if (shouldAdoptCanvas && params.canvas) {
    state.setCanvas(params.canvas);
  }
  if (params.layers.length > 0) {
    state.setLayers([...state.layers, ...params.layers]);
  }
  const activeLayer = findLastRasterLayer(params.layers) ?? params.layers[params.layers.length - 1];
  if (activeLayer) {
    state.setActiveLayer(activeLayer.id);
  }
  state.markDirty();
  pushHistorySnapshot({
    type: 'layer-add',
    label: `Import ${params.sourceKind}: ${params.sourceName}`,
    before,
    after: captureLayerHistorySnapshot(),
  });
  notifyDocumentEdited(`Import ${params.sourceKind}: ${params.sourceName}`);
}

function captureHistorySnapshotForAIResult(
  result: SketchAIResult,
): import('./types').HistoryStateSnapshot {
  if (result.kind === 'selection') {
    return captureSelectionHistorySnapshot();
  }
  return captureLayerHistorySnapshot();
}

function captureAIApplySnapshot(result: SketchAIResult): AppSketchAIApplySnapshot {
  return {
    state: captureHistorySnapshotForAIResult(result),
    wasDirty: useSketchStore.getState().isDirty,
  };
}

function rollbackAIApplySnapshot(snapshot: AppSketchAIApplySnapshot): void {
  const state = useSketchStore.getState();
  if (snapshot.state.layers !== undefined) {
    state.setLayers([...snapshot.state.layers]);
  }
  if (snapshot.state.activeLayerId !== undefined) {
    useSketchStore.setState({ activeLayerId: snapshot.state.activeLayerId });
  }
  if (snapshot.state.selection !== undefined) {
    state.setSelectionMask(
      snapshot.state.selection
        ? {
            width: snapshot.state.selection.width,
            height: snapshot.state.selection.height,
            data: new Uint8Array(snapshot.state.selection.data),
          }
        : null,
    );
  }
  if (snapshot.wasDirty) {
    state.markDirty();
  } else {
    state.markClean();
  }
}

function captureLayerHistorySnapshot(): import('./types').HistoryStateSnapshot {
  const state = useSketchStore.getState();
  return {
    layers: [...state.layers],
    activeLayerId: state.activeLayerId,
  };
}

function captureSelectionHistorySnapshot(): import('./types').HistoryStateSnapshot {
  const selection = useSketchStore.getState().selection;
  return {
    selection: selection
      ? {
          width: selection.width,
          height: selection.height,
          data: new Uint8Array(selection.data),
        }
      : null,
  };
}

function pushHistorySnapshot(params: {
  readonly type: import('./types').HistoryActionType;
  readonly label: string;
  readonly before: import('./types').HistoryStateSnapshot;
  readonly after: import('./types').HistoryStateSnapshot;
}): void {
  useSketchStore.getState().pushHistory({
    type: params.type,
    label: params.label,
    snapshot: null,
    stateSnapshot: {
      before: params.before,
      after: params.after,
    },
  });
}

function findLastRasterLayer(layers: readonly LayerData[]): LayerData | undefined {
  for (let i = layers.length - 1; i >= 0; i--) {
    const layer = layers[i];
    if (!layer) continue;
    const child = findLastRasterLayer(layer.children);
    if (child) return child;
    if (layer.type === 'raster') return layer;
  }
  return undefined;
}

function notifyDocumentEdited(description: string): void {
  vscode.postMessage({
    type: 'operationApplied',
    operation: {
      type: 'sketch.import',
      meta: {
        id: `sketch-import-${Date.now()}`,
        timestamp: Date.now(),
        source: 'user',
        description,
      },
      payload: {},
    },
  });
}

function notifyAIResultApplied(runId: string, success: boolean, reason?: string): void {
  vscode.postMessage({
    type: 'ai:resultApplied',
    runId,
    success,
    reason,
  });
}
