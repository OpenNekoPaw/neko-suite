/**
 * PuppetApp - Root component for the puppet editor
 *
 * Manages puppet loading (INP/MOC3), parameter control, and animation playback.
 * Communicates with the extension host via postMessage protocol.
 */
import React, { useEffect, useCallback, useRef, useState } from 'react';
import type { ExtensionToWebviewMessage } from './types';
import type { PuppetDocumentContext } from './types';
import { usePuppetStore } from './stores/puppet-store';
import { decodeMoc3ExternalTextures } from './utils/moc3-textures';
import { AnimationPanel } from './components/AnimationPanel';
import { ControlDriverPanel } from './components/ControlDriverPanel';
import { ParameterPanel } from './components/ParameterPanel';
import { PuppetNodeTree } from './components/PuppetNodeTree';
import { PuppetRuntimeStatus } from './components/PuppetRuntimeStatus';
import { PuppetKeyframeTimeline } from './components/PuppetKeyframeTimeline';
import { PuppetCanvas } from './components/PuppetCanvas';
import { PuppetEmptyState } from './components/empty-state/PuppetEmptyState';
import { PuppetController } from './animation';
import {
  PuppetViewportController,
  createIdlePuppetViewportController,
  handlePuppetMenuAction,
} from './viewport/PuppetViewportController';
import { usePuppetPlayback } from './hooks/usePuppetPlayback';
import { i18nService, setLocale } from './i18n';
import { I18nProvider, useTranslation } from './i18n/I18nContext';
import type { NkpNativeProjectData, SupportedLocale } from '@neko/shared';
import { createProjectSourceAddClient } from '@neko/shared';
import type { ViewportFrameMeta, ViewportMenuItem } from '@neko/shared';
import { CreativeWorkbenchShell } from '@neko/ui/workbench';
import { EngineClient } from '@neko/neko-client';
import { OverlayRenderer, ViewportShell } from '@neko/ui';
import {
  getState as getSharedState,
  postMessage as postRawMessage,
  setState as setSharedState,
  type VSCodeAPI,
} from '@neko/shared/vscode';
import { PUPPET_RIGHT_PANEL_RESIZE } from './layout/puppetResizeLayout';
import { PuppetToolbar } from './components/PuppetToolbar';

const vscode: VSCodeAPI = {
  postMessage(message: unknown): void {
    postRawMessage(message);
  },
  getState<T = unknown>(): T | undefined {
    return getSharedState<T>();
  },
  setState<T = unknown>(state: T): void {
    setSharedState(state);
  },
};

type PendingPuppetLoad =
  | Extract<ExtensionToWebviewMessage, { type: 'loadPuppet' }>
  | Extract<ExtensionToWebviewMessage, { type: 'loadPuppetSource' }>
  | Extract<ExtensionToWebviewMessage, { type: 'loadNativePuppet' }>;

type PuppetRightDockMode = 'basic' | 'professional';

/** Debounce timer ref for parameter save */
let saveTimer: ReturnType<typeof setTimeout> | null = null;

/** Send current parameters to extension for persistence */
function saveParametersToExtension(): void {
  const params = usePuppetStore.getState().puppetParameters;
  const paramMap: Record<string, number> = {};
  for (const p of params) {
    paramMap[p.name] = p.current;
  }
  vscode.postMessage({ type: 'state:save', parameters: paramMap });
}

/** Debounced parameter save (300ms) */
function debouncedSaveParameters(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(saveParametersToExtension, 300);
}

function extractNativeBlendShapes(project: NkpNativeProjectData) {
  return [...(project.blendShapes.shapes ?? []), ...(project.blendShapes.custom ?? [])].map(
    (shape) => ({
      name: shape.name,
      meshId: shape.meshId,
      current: 0,
    }),
  );
}

function PuppetWaitingPlaceholder() {
  const { t } = useTranslation();
  return <span>{t('puppet.status.loading')}</span>;
}

function PuppetLoadErrorPlaceholder({ message }: { message: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 text-center">
      <div className="text-sm font-medium">{t('puppet.status.loadFailed')}</div>
      <div className="max-w-xl text-xs opacity-70 break-words">{message}</div>
    </div>
  );
}

function PuppetLocalPreviewLabel() {
  const { t } = useTranslation();
  return (
    <div
      className="puppet-local-preview-badge"
      data-non-authoritative-preview="local-canvas-preview"
    >
      {t('puppet.viewport.localPreview')}
    </div>
  );
}

export function PuppetApp() {
  return (
    <I18nProvider service={i18nService}>
      <PuppetWorkbench />
    </I18nProvider>
  );
}

function PuppetWorkbench() {
  const { t } = useTranslation();
  const controllerRef = useRef<PuppetController | null>(null);
  const { onPlay, onStop, onSeek, onCrossfade } = usePuppetPlayback(controllerRef.current);
  const puppetLoaded = usePuppetStore((s) => s.puppetLoaded);
  const noPuppetSource = usePuppetStore((s) => s.noPuppetSource);
  const loadError = usePuppetStore((s) => s.loadError);
  const isKeyframeEditorOpen = usePuppetStore((s) => s.isKeyframeEditorOpen);
  const toggleKeyframeEditor = usePuppetStore((s) => s.toggleKeyframeEditor);
  const nativeRevision = usePuppetStore((s) => s.nativeRevision);
  const [controllerVersion, setControllerVersion] = useState(0);
  const [isRightPanelVisible, setIsRightPanelVisible] = useState(false);
  const [fitViewRequest, setFitViewRequest] = useState(0);
  const [isOnionSkinEnabled, setIsOnionSkinEnabled] = useState(false);
  const [rightDockMode, setRightDockMode] = useState<PuppetRightDockMode>('basic');
  const [documentContext, setDocumentContext] = useState<PuppetDocumentContext | null>(null);
  const isRightDockVisible = isRightPanelVisible && puppetLoaded;

  /** Pending parameter overrides received before puppet loads */
  const pendingStateRef = useRef<Record<string, number> | null>(null);
  /** Pending puppet source received before the engine port is ready. */
  const pendingLoadRef = useRef<PendingPuppetLoad | null>(null);

  const applyLoadedPuppet = useCallback(async (ctrl: PuppetController) => {
    const store = usePuppetStore.getState();

    // Get initial deformed meshes for rendering
    const meshes = await ctrl.getMeshes();
    store.setDeformedMeshes(meshes);

    // Load parameters and animations
    const params = await ctrl.getParameters();
    store.setPuppetParameters(params);
    vscode.postMessage({
      type: 'puppet:parametersLoaded',
      parameters: params.map((param) => param.name),
    });

    // Apply pending parameter overrides if any
    const pending = pendingStateRef.current;
    if (pending) {
      pendingStateRef.current = null;
      for (const p of params) {
        const override = pending[p.name];
        if (override !== undefined) {
          store.updateParameterValue(p.name, override);
          void ctrl.setParameter(p.name, override);
        }
      }
    }

    const anims = await ctrl.getAnimations();
    store.setAnimations(anims);
  }, []);

  const loadPuppetMessage = useCallback(
    async (msg: PendingPuppetLoad, ctrl: PuppetController): Promise<void> => {
      const store = usePuppetStore.getState();
      store.setLoadError(null);
      store.setPuppetLoaded(false);
      store.setPuppetSnapshot(null);
      store.setDeformedMeshes([]);
      store.setPuppetParameters([]);
      store.setNativeBlendShapes([]);
      store.setNativeControlDrivers([]);
      store.setNativeRevision(0);
      store.setAnimations([]);
      store.setPreviewFrame(null);
      store.setTextures([]);

      try {
        const texturePromise =
          msg.textures !== undefined
            ? decodeMoc3ExternalTextures(msg.textures)
            : Promise.resolve<ImageBitmap[]>([]);
        const snapshotPromise =
          msg.type === 'loadNativePuppet'
            ? ctrl.loadNativeProject(msg.project)
            : msg.type === 'loadPuppetSource'
              ? ctrl.loadSource(msg.source)
              : ctrl.load(base64ToArrayBuffer(msg.data));
        const [snapshot, textures] = await Promise.all([snapshotPromise, texturePromise]);

        store.setTextures(textures);
        store.setPuppetSnapshot(snapshot);
        store.setNativeBlendShapes(
          msg.type === 'loadNativePuppet' ? extractNativeBlendShapes(msg.project) : [],
        );
        store.setNativeControlDrivers(
          msg.type === 'loadNativePuppet' ? msg.project.controlDrivers : [],
        );
        store.setNativeRevision(msg.type === 'loadNativePuppet' ? 1 : 0);
        if ('auxiliary' in msg && msg.auxiliary) {
          await ctrl.loadAuxiliary(msg.auxiliary);
        }
        store.setPuppetLoaded(true);
        store.setNoPuppetSource(false);
        await applyLoadedPuppet(ctrl);
      } catch (error) {
        store.setPuppetLoaded(false);
        store.setLoadError(error instanceof Error ? error.message : String(error));
      }
    },
    [applyLoadedPuppet],
  );

  // Notify extension that webview is ready
  useEffect(() => {
    vscode.postMessage({ type: 'ready' });
  }, []);

  // Handle messages from extension
  const handleMessage = useCallback(
    (event: MessageEvent<ExtensionToWebviewMessage>) => {
      const msg = event.data;
      switch (msg.type) {
        case 'documentContext': {
          setDocumentContext(msg.context);
          break;
        }

        case 'enginePort': {
          const engine = new EngineClient(msg.port);
          const ctrl = new PuppetController(engine);
          controllerRef.current = ctrl;
          setControllerVersion((version) => version + 1);
          const pending = pendingLoadRef.current;
          if (pending) {
            pendingLoadRef.current = null;
            void loadPuppetMessage(pending, ctrl);
          }
          break;
        }

        case 'engineUnavailable': {
          const store = usePuppetStore.getState();
          store.setPuppetLoaded(false);
          store.setLoadError(msg.message ?? t('puppet.status.engineUnavailable'));
          break;
        }

        case 'loadPuppet':
        case 'loadPuppetSource':
        case 'loadNativePuppet': {
          const ctrl = controllerRef.current;
          if (!ctrl) {
            pendingLoadRef.current = msg;
            vscode.postMessage({ type: 'requestEnginePort' });
            break;
          }

          void loadPuppetMessage(msg, ctrl);
          break;
        }

        case 'loadPuppetTextures': {
          const store = usePuppetStore.getState();
          store.setLoadError(null);
          void decodeMoc3ExternalTextures(msg.textures)
            .then((textures) => {
              usePuppetStore.getState().setTextures(textures);
            })
            .catch((error) => {
              usePuppetStore
                .getState()
                .setLoadError(error instanceof Error ? error.message : String(error));
            });
          break;
        }

        case 'loadState': {
          // Parameter overrides from .nkp project
          const store = usePuppetStore.getState();
          if (store.puppetLoaded && controllerRef.current) {
            // Apply immediately
            const ctrl = controllerRef.current;
            for (const [name, value] of Object.entries(msg.parameters)) {
              store.updateParameterValue(name, value);
              void ctrl.setParameter(name, value);
            }
          } else {
            // Buffer until puppet loads
            pendingStateRef.current = msg.parameters;
          }
          break;
        }

        case 'noPuppetSource': {
          const store = usePuppetStore.getState();
          store.setLoadError(null);
          store.setNoPuppetSource(true);
          break;
        }

        case 'puppetImported': {
          const store = usePuppetStore.getState();
          store.setLoadError(null);
          store.setNoPuppetSource(false);
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
    [loadPuppetMessage, t],
  );

  const puppetViewportController = React.useMemo(() => {
    const controller = controllerRef.current;
    if (!controller) return null;
    return new PuppetViewportController({
      sceneId: 'puppet-main',
      viewportId: 'main',
      controller,
      onError: (message) => usePuppetStore.getState().setLoadError(message),
    });
  }, [controllerVersion]);
  const idlePuppetViewportController = React.useMemo(
    () => createIdlePuppetViewportController(),
    [],
  );
  const activePuppetViewportController =
    puppetLoaded && puppetViewportController
      ? puppetViewportController
      : idlePuppetViewportController;
  const puppetFrameMeta = React.useMemo<ViewportFrameMeta>(
    () => ({
      protocolVersion: 1,
      streamId: 'puppet-local-preview',
      sceneId: 'puppet-main',
      viewportId: 'main',
      frameId: 0,
      ptsUs: 0,
      durationUs: 16666,
      frameTimestamp: performance.now(),
      revision: nativeRevision,
      appliedSeq: 0,
      viewTransform: [1, 0, 0, 1, 0, 0],
      diagnostics: { authoritative: false, reason: 'local-canvas-preview' },
    }),
    [nativeRevision],
  );
  const handlePuppetContextMenuAction = useCallback((item: ViewportMenuItem) => {
    handlePuppetMenuAction(item);
  }, []);
  const handleImportPuppet = useCallback(() => {
    const client = createProjectSourceAddClient({
      postMessage: (message) => vscode.postMessage(message),
      addMessageListener: (listener) => {
        const handleMessage = (event: MessageEvent) => listener(event.data);
        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
      },
      timeoutMs: 30000,
    });
    void client.addSource({
      kind: 'file-picker',
      formatId: 'nkp',
      target: { role: 'puppet' },
      destination: { kind: 'project', directory: '.', copyMode: 'link' },
      ingestMode: 'link',
      metadata: { puppetAdd: true },
    });
  }, []);
  const handleOpenExport = useCallback(() => {
    vscode.postMessage({ type: 'puppet:export' });
  }, []);
  const handleOpenPackage = useCallback(() => {
    vscode.postMessage({ type: 'project:package' });
  }, []);
  const handleDropMoc3 = useCallback((file: { readonly name: string; readonly file: File }) => {
    const client = createProjectSourceAddClient({
      postMessage: (message) => vscode.postMessage(message),
      addMessageListener: (listener) => {
        const handleMessage = (event: MessageEvent) => listener(event.data);
        window.addEventListener('message', handleMessage);
        return () => window.removeEventListener('message', handleMessage);
      },
      timeoutMs: 30000,
    });
    void client.addSource({
      kind: 'drag-drop',
      formatId: 'nkp',
      file: file.file,
      target: { role: 'puppet' },
      destination: { kind: 'project', directory: '.', copyMode: 'copy' },
      ingestMode: 'create-asset',
      metadata: { puppetAdd: true, name: file.name },
    });
  }, []);
  const handleFitPuppetView = useCallback(() => {
    setFitViewRequest((value) => value + 1);
  }, []);
  const handleToggleOnionSkin = useCallback(() => {
    if (!puppetViewportController) return;
    const next = !isOnionSkinEnabled;
    setIsOnionSkinEnabled(next);
    void puppetViewportController.setOnionSkin(next).catch(() => {
      setIsOnionSkinEnabled(!next);
    });
  }, [isOnionSkinEnabled, puppetViewportController]);
  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  // Subscribe to parameter changes and debounce-save to extension
  useEffect(() => {
    let prev = usePuppetStore.getState().puppetParameters;
    const unsub = usePuppetStore.subscribe((state) => {
      if (state.puppetParameters !== prev) {
        prev = state.puppetParameters;
        if (state.puppetLoaded) {
          debouncedSaveParameters();
        }
      }
    });
    return unsub;
  }, []);

  return (
    <CreativeWorkbenchShell
      className="flex flex-col h-screen w-screen overflow-hidden"
      bodyClassName="flex flex-1 overflow-hidden"
      mainClassName="puppet-main-panel"
      mainKind="viewport-timeline"
      leftRail={
        <PuppetToolbar
          isRightPanelVisible={isRightDockVisible}
          puppetLoaded={puppetLoaded}
          onionSkinEnabled={isOnionSkinEnabled}
          onImport={handleImportPuppet}
          onOpenExport={handleOpenExport}
          onOpenPackage={handleOpenPackage}
          onFitView={handleFitPuppetView}
          onToggleOnionSkin={handleToggleOnionSkin}
          onToggleRightPanel={() => setIsRightPanelVisible((visible) => !visible)}
        />
      }
      main={
        <>
          {loadError ? (
            <div className="flex-1 flex items-center justify-center text-sm text-[var(--vscode-errorForeground)]">
              <PuppetLoadErrorPlaceholder message={loadError} />
            </div>
          ) : noPuppetSource || (puppetLoaded && puppetViewportController) ? (
            <ViewportShell
              sceneId="puppet-main"
              viewportId="main"
              controller={activePuppetViewportController}
              frameMeta={puppetFrameMeta}
              className="puppet-viewport-shell flex-1 relative overflow-hidden"
              surface={{
                kind: 'custom',
                node: (
                  <PuppetCanvas
                    overlayLayer={
                      noPuppetSource ? (
                        <PuppetEmptyState
                          onDropMoc3={handleDropMoc3}
                          onImportMoc3={handleImportPuppet}
                        />
                      ) : null
                    }
                    contextMenuLayer={null}
                    localPreviewLabel={noPuppetSource ? null : <PuppetLocalPreviewLabel />}
                    fitViewRequest={fitViewRequest}
                    emptyViewport={noPuppetSource}
                  />
                ),
              }}
              onContextMenuAction={handlePuppetContextMenuAction}
              renderOverlayLayer={({ frameMeta, overlays }) => (
                <>
                  <OverlayRenderer
                    className="puppet-viewport-overlay"
                    frameMeta={frameMeta}
                    overlays={overlays}
                  />
                </>
              )}
              renderToolbar={() => null}
            />
          ) : puppetLoaded ? (
            <PuppetCanvas
              localPreviewLabel={<PuppetLocalPreviewLabel />}
              fitViewRequest={fitViewRequest}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm opacity-50">
              <PuppetWaitingPlaceholder />
            </div>
          )}
        </>
      }
      rightDock={
        isRightDockVisible
          ? {
              id: 'puppet-right-panel',
              panelId: PUPPET_RIGHT_PANEL_RESIZE.panelId,
              defaultSize: PUPPET_RIGHT_PANEL_RESIZE.defaultSize,
              minSize: PUPPET_RIGHT_PANEL_RESIZE.minSize,
              maxSize: PUPPET_RIGHT_PANEL_RESIZE.maxSize,
              className: 'puppet-right-panel',
              contentClassName: 'puppet-right-panel-stack',
              resizeHandleClassName: 'puppet-resize-handle puppet-right-panel-resize-handle',
              resizePersistence: { api: vscode },
              groups: {
                label: t('puppet.rightDock.mode.label'),
                activeId: rightDockMode,
                onActiveIdChange: (id) => setRightDockMode(toPuppetRightDockMode(id)),
                items: [
                  {
                    id: 'basic',
                    label: t('puppet.rightDock.mode.basic'),
                    description: t('puppet.rightDock.mode.basic.description'),
                  },
                  {
                    id: 'professional',
                    label: t('puppet.rightDock.mode.professional'),
                    description: t('puppet.rightDock.mode.professional.description'),
                  },
                ],
              },
              children: (
                <>
                  <PuppetRuntimeStatus context={documentContext} />
                  <ParameterPanel
                    controller={controllerRef.current}
                    mode={rightDockMode}
                    viewportController={puppetViewportController}
                  />
                  {rightDockMode === 'professional' ? (
                    <>
                      <PuppetNodeTree />
                      <ControlDriverPanel />
                      <AnimationPanel
                        onPlay={onPlay}
                        onStop={onStop}
                        onSeek={onSeek}
                        onCrossfade={onCrossfade}
                      />
                    </>
                  ) : null}
                </>
              ),
            }
          : undefined
      }
      bottomPanel={
        puppetLoaded ? (
          <div className="flex flex-col border-t border-[var(--sketch-border)]">
            <button
              type="button"
              className="flex items-center gap-1 px-2 py-1 text-xs hover:bg-[var(--vscode-list-hoverBackground)] cursor-pointer"
              onClick={toggleKeyframeEditor}
              aria-expanded={isKeyframeEditorOpen}
              aria-label={
                isKeyframeEditorOpen ? t('puppet.keyframes.collapse') : t('puppet.keyframes.expand')
              }
            >
              <span className="w-3 text-center" aria-hidden>
                {isKeyframeEditorOpen ? '▾' : '▸'}
              </span>
              <span>{t('puppet.keyframes.title')}</span>
            </button>
            {isKeyframeEditorOpen && (
              <div style={{ height: 180 }}>
                <PuppetKeyframeTimeline controller={controllerRef.current} />
              </div>
            )}
          </div>
        ) : undefined
      }
    />
  );
}

function toPuppetRightDockMode(id: string): PuppetRightDockMode {
  return id === 'professional' ? 'professional' : 'basic';
}

function base64ToArrayBuffer(data: string): ArrayBuffer {
  const binaryStr = atob(data);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return bytes.buffer;
}
