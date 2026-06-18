/**
 * NekoSketch App - Root component
 *
 * Assembles the sketch editor layout:
 * Toolbar | Canvas | Side panels (Brush/Color/Layers)
 */
import { useEffect, useCallback, useRef, useState } from 'react';
import {
  isEditableTarget,
  isKeyboardFocusMessage,
  useFocusedWebviewRoot,
  useReportWebviewKeyboardFocus,
} from '@neko/ui/keyboard';
import { CreativeWorkbenchShell } from '@neko/ui/workbench';
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
import {
  handleSketchKeyboardEvent,
  SKETCH_KEYBOARD_EVENT_LISTENER_OPTIONS,
} from './utils/sketch-keyboard-handler';
import { importImageAsLayer, isImageMimeType } from './utils/image-import';
import { createTextureStampAssetFromBase64 } from './brush';
import { exportLayerImageDataBase64 } from './utils/layer-export';
import { mapPsdDocumentTree } from './utils/psd-layer-mapper';
import { postSketchMessage, type SketchVSCodeApi } from './utils/vscode';
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
import {
  createProjectSourceAddClient,
  isProjectFileSnapshotRequestMessage,
  PROJECT_FILE_SNAPSHOT_RESPONSE,
  type SketchRuntimeFeatureFlags,
  type SupportedLocale,
} from '@neko/shared';
import type { CanvasConfig, LayerData, ToolType } from './types';

type SketchRightDockMode = 'basic' | 'professional';

interface AppSketchAIApplySnapshot extends SketchAIApplySnapshot {
  readonly wasDirty: boolean;
}

const vscode: Pick<NonNullable<SketchVSCodeApi>, 'postMessage'> = {
  postMessage(message: unknown): void {
    postSketchMessage(message);
  },
};
const aiSessionStore = new SketchAISessionStore();
const DEFAULT_FEATURE_FLAGS: SketchRuntimeFeatureFlags = {
  psdImportEnabled: false,
  aiOps: {
    enabled: false,
    operations: {},
  },
};

const VECTOR_INSPECTOR_TOOLS = new Set<ToolType>(['shape', 'vector']);
const FILL_INSPECTOR_TOOLS = new Set<ToolType>(['fill', 'gradient']);

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
  const showSidebar = store((s) => s.showSidebar);
  const showFrameTimeline = store((s) => s.showFrameTimeline);
  const [aiRuns, setAIRuns] = useState<readonly SketchAIRun[]>(() => aiSessionStore.list());
  const [featureFlags, setFeatureFlags] =
    useState<SketchRuntimeFeatureFlags>(DEFAULT_FEATURE_FLAGS);
  const [rightDockMode, setRightDockMode] = useState<SketchRightDockMode>('basic');

  // Drag-over visual state
  const [isDragOver, setIsDragOver] = useState(false);
  const keyboardRootRef = useRef<HTMLDivElement | null>(null);

  const { isKeyboardFocused, isKeyboardFocusedRef, setKeyboardFocused } = useFocusedWebviewRoot(
    keyboardRootRef,
    false,
  );
  useReportWebviewKeyboardFocus(keyboardRootRef, vscode);

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
      handleSketchKeyboardEvent(event, {
        isKeyboardFocused: isKeyboardFocusedRef.current || document.hasFocus(),
        clearTextSelection: () => window.getSelection()?.removeAllRanges(),
        dispatch: (action) => dispatchKeyboardAction(action, store.getState(), vscode),
      });
    };

    window.addEventListener('keydown', handleKeyDown, SKETCH_KEYBOARD_EVENT_LISTENER_OPTIONS);
    return () =>
      window.removeEventListener('keydown', handleKeyDown, SKETCH_KEYBOARD_EVENT_LISTENER_OPTIONS);
  }, [store, isKeyboardFocusedRef]);

  useEffect(() => aiSessionStore.subscribe(setAIRuns), []);

  const handleOpenExport = useCallback(() => {
    dispatchKeyboardAction('export', store.getState(), vscode);
  }, [store]);

  const handleOpenPackage = useCallback(() => {
    vscode.postMessage({ type: 'project:package' });
  }, []);

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

  const serializeCurrentSketchDocument = useCallback(() => {
    const state = store.getState();
    const canvas = document.getElementById('sketch-canvas') as HTMLCanvasElement | null;
    const gl = canvas?.getContext('webgl2') ?? null;
    return serializeDocument(
      state.canvas,
      state.layers,
      state.viewport,
      gl,
      state.scenes,
      state.filters,
    );
  }, [store]);

  // Handle messages from extension
  const handleMessage = useCallback(
    async (event: MessageEvent<ExtensionToWebviewMessage>) => {
      const msg = event.data;
      const focusMessage = isKeyboardFocusMessage(msg) ? msg : null;
      if (focusMessage) {
        setKeyboardFocused(focusMessage.focused);
        return;
      }
      if (isProjectFileSnapshotRequestMessage(msg)) {
        try {
          vscode.postMessage({
            type: PROJECT_FILE_SNAPSHOT_RESPONSE,
            requestId: msg.requestId,
            ok: true,
            document: serializeCurrentSketchDocument(),
          });
        } catch (error) {
          vscode.postMessage({
            type: PROJECT_FILE_SNAPSHOT_RESPONSE,
            requestId: msg.requestId,
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }

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
          vscode.postMessage({ type: 'document:save', data: serializeCurrentSketchDocument() });
          markClean();
          break;
        }

        case 'keyboardAction': {
          if (!isKeyboardFocusedRef.current) {
            break;
          }
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
    [
      setCanvas,
      setLayers,
      setViewport,
      setActiveLayer,
      markClean,
      clearHistory,
      serializeCurrentSketchDocument,
    ],
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
            void addSketchImageSource({
              kind: 'paste',
              file,
              name: file.name || 'pasted-image.png',
            });
          }
          return; // Only import the first image
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  // --- Drag-and-drop: acquire image files through project:addSource before import ---
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
      const client = createSketchProjectSourceAddClient();

      if (e.dataTransfer.files.length > 0) {
        for (const file of Array.from(e.dataTransfer.files)) {
          if (isImageMimeType(file.type)) {
            void addSketchImageSource({
              client,
              kind: 'drag-drop',
              file,
              name: file.name,
            });
            return; // Import the first valid image
          }
        }
      }

      const uriList = e.dataTransfer.getData('text/uri-list');
      if (uriList) {
        const sourceUri = uriList
          .split('\n')
          .map((uri) => uri.trim())
          .find((uri) => uri.length > 0 && !uri.startsWith('#'));
        if (sourceUri) {
          void addSketchImageSource({
            client,
            kind: 'drag-drop',
            sourceUri,
            name: basenameFromSource(sourceUri),
          });
        }
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
      <div
        ref={keyboardRootRef}
        className="flex flex-col h-screen w-screen overflow-hidden relative"
        data-neko-keyboard-focused={isKeyboardFocused ? 'true' : 'false'}
      >
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
        <CreativeWorkbenchShell
          className="sketch-workbench-shell"
          bodyClassName="sketch-workbench-body"
          mainClassName="sketch-main-panel"
          mainKind="drawing-canvas"
          leftRail={<Toolbar onOpenExport={handleOpenExport} onOpenPackage={handleOpenPackage} />}
          main={
            <div className="sketch-canvas-container">
              <SketchCanvas isKeyboardFocusedRef={isKeyboardFocusedRef} />
            </div>
          }
          rightDock={
            showSidebar
              ? {
                  id: 'sketch-right-sidebar',
                  className: 'sketch-right-sidebar',
                  contentClassName: 'sketch-right-sidebar-content',
                  resizeHandleClassName: 'sketch-right-sidebar-resize-handle',
                  size: sidebarWidth,
                  minSize: 220,
                  maxSize: 440,
                  onSizeChange: setSidebarWidth,
                  groups: {
                    label: i18nService.t('sketch.rightDock.mode.label'),
                    activeId: rightDockMode,
                    onActiveIdChange: (id) => setRightDockMode(toSketchRightDockMode(id)),
                    items: [
                      {
                        id: 'basic',
                        label: i18nService.t('sketch.rightDock.mode.basic'),
                        description: i18nService.t('sketch.rightDock.mode.basic.description'),
                      },
                      {
                        id: 'professional',
                        label: i18nService.t('sketch.rightDock.mode.professional'),
                        description: i18nService.t(
                          'sketch.rightDock.mode.professional.description',
                        ),
                      },
                    ],
                  },
                  children: (
                    <SketchInspectorStack
                      mode={rightDockMode}
                      activeTool={activeTool}
                      featureFlags={featureFlags}
                      showFrameTimeline={showFrameTimeline}
                      onOpenAgentForAI={handleOpenAgentForAI}
                    />
                  ),
                }
              : undefined
          }
          bottomPanel={
            showFrameTimeline ? (
              <FrameTimeline isKeyboardFocusedRef={isKeyboardFocusedRef} />
            ) : undefined
          }
        />
      </div>
    </I18nProvider>
  );
}

function toSketchRightDockMode(id: string): SketchRightDockMode {
  return id === 'professional' ? 'professional' : 'basic';
}

interface SketchInspectorStackProps {
  readonly mode: SketchRightDockMode;
  readonly activeTool: ToolType;
  readonly featureFlags: SketchRuntimeFeatureFlags;
  readonly showFrameTimeline: boolean;
  readonly onOpenAgentForAI: (
    operation: SketchAIOperationType,
    prompt: string,
    params: SketchAIOperationParams,
  ) => void;
}

function SketchInspectorStack({
  mode,
  activeTool,
  featureFlags,
  showFrameTimeline,
  onOpenAgentForAI,
}: SketchInspectorStackProps): JSX.Element {
  const showVectorInspector = VECTOR_INSPECTOR_TOOLS.has(activeTool);
  const showFillInspector = FILL_INSPECTOR_TOOLS.has(activeTool);
  const showAIInspector = hasAvailableSketchAIOperations(featureFlags);

  return (
    <div className="sketch-right-sidebar-stack sketch-inspector-compact">
      <CollapsiblePanel
        titleKey={activeTool === 'eraser' ? 'sketch.tool.eraser' : 'sketch.panel.brush'}
      >
        <BrushPanel />
      </CollapsiblePanel>
      {showVectorInspector && (
        <CollapsiblePanel titleKey="sketch.panel.vector">
          <VectorToolbar />
        </CollapsiblePanel>
      )}
      {showFillInspector && (
        <CollapsiblePanel titleKey="sketch.panel.fill">
          <FillPanel />
        </CollapsiblePanel>
      )}
      <CollapsiblePanel titleKey="sketch.panel.palette">
        <PalettePanel />
      </CollapsiblePanel>
      <CollapsiblePanel titleKey="sketch.panel.layers">
        <LayerPanel />
      </CollapsiblePanel>
      {showAIInspector && (
        <CollapsiblePanel titleKey="sketch.panel.ai" defaultExpanded={false}>
          <AIPanel
            operationAvailability={featureFlags.aiOps.operations}
            onOpenAgent={onOpenAgentForAI}
          />
        </CollapsiblePanel>
      )}
      {mode === 'professional' && showFrameTimeline && (
        <CollapsiblePanel titleKey="sketch.panel.frames">
          <FrameControls />
        </CollapsiblePanel>
      )}
      {mode === 'professional' && (
        <CollapsiblePanel titleKey="sketch.panel.advanced" defaultExpanded={false}>
          {showFrameTimeline && (
            <CollapsiblePanel titleKey="sketch.panel.spritesheet" defaultExpanded={false}>
              <SpriteSheetPlayer />
            </CollapsiblePanel>
          )}
          <CollapsiblePanel titleKey="sketch.panel.filters" defaultExpanded={false}>
            <FilterPanel />
          </CollapsiblePanel>
          <CollapsiblePanel titleKey="sketch.panel.perspective" defaultExpanded={false}>
            <PerspectiveGridPanel />
          </CollapsiblePanel>
          <CollapsiblePanel titleKey="sketch.panel.particles" defaultExpanded={false}>
            <ParticlePanel />
          </CollapsiblePanel>
          <CollapsiblePanel titleKey="sketch.panel.scene" defaultExpanded={false}>
            <ScenePanel />
          </CollapsiblePanel>
        </CollapsiblePanel>
      )}
    </div>
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

function createSketchProjectSourceAddClient() {
  return createProjectSourceAddClient({
    postMessage: (message) => vscode.postMessage(message),
    addMessageListener: (listener) => {
      const handleMessage = (event: MessageEvent) => listener(event.data);
      window.addEventListener('message', handleMessage);
      return () => window.removeEventListener('message', handleMessage);
    },
    timeoutMs: 30000,
  });
}

async function addSketchImageSource(input: {
  readonly client?: ReturnType<typeof createSketchProjectSourceAddClient>;
  readonly kind: 'drag-drop' | 'paste';
  readonly file?: File;
  readonly sourceUri?: string;
  readonly name: string;
}): Promise<void> {
  const client = input.client ?? createSketchProjectSourceAddClient();
  const result = await client.addSource({
    kind: input.kind,
    formatId: 'nks',
    ...(input.file ? { file: input.file } : {}),
    ...(input.sourceUri ? { sourceUri: input.sourceUri, browserFile: { name: input.name } } : {}),
    target: { role: 'image' },
    destination: {
      kind: 'project',
      directory: 'imports',
      copyMode: input.file ? 'copy' : 'link',
    },
    ingestMode: input.file ? 'create-asset' : 'link',
    metadata: { sketchImport: true, name: input.name },
  });
  if (!result.ok) {
    // Extension owns user-visible diagnostics; keep durable document state untouched.
    return;
  }
}

function basenameFromSource(value: string): string {
  const withoutQuery = value.split(/[?#]/, 1)[0] ?? value;
  const normalized = decodeURIComponentSafe(withoutQuery).replace(/\\/g, '/');
  return normalized.split('/').pop() || value;
}

function decodeURIComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
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
