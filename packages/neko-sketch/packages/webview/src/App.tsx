/**
 * NekoSketch App - Root component
 *
 * Assembles the sketch editor layout:
 * Toolbar | Canvas | Side panels (Brush/Color/Layers)
 */
import { useEffect, useCallback, useRef } from 'react';
import type { ExtensionToWebviewMessage } from './types';
import { useSketchStore } from './stores';
import {
  SketchCanvas,
  Toolbar,
  BrushPanel,
  ColorPanel,
  LayerPanel,
  AnimationPanel,
  ParameterPanel,
  PuppetNodeTree,
  FrameTimeline,
  FrameControls,
  FilterPanel,
  ParticlePanel,
  ScenePanel,
  AtmospherePanel,
  PalettePanel,
  SpriteSheetPlayer,
} from './components';
import { deserializeDocument, serializeDocument } from './utils/document-serializer';
import { dispatchKeyboardAction } from './utils/keyboard-dispatcher';
import { importImageAsLayer } from './utils/image-import';
import { i18nService, setLocale } from './i18n';
import { I18nProvider } from './i18n/I18nContext';
import { usePuppetPlayback } from './hooks/usePuppetPlayback';
import { Inochi2DController } from './animation';
import type { SupportedLocale } from '@neko/shared';
import { EngineClient } from '@neko/neko-client';

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
  const puppetLoaded = store((s) => s.puppetLoaded);

  // Sync status bar info to VSCode native status bar
  const viewport = store((s) => s.viewport);
  const canvasState = store((s) => s.canvas);
  const activeTool = store((s) => s.activeTool);
  const layerCount = store((s) => s.layers).length;
  const brushSize = store((s) => s.brushSettings).size;

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

  // Puppet animation controller (created lazily when engine port is available)
  const controllerRef = useRef<Inochi2DController | null>(null);
  const { onPlay, onStop, onSeek } = usePuppetPlayback(controllerRef.current);

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

        case 'enginePort': {
          const engine = new EngineClient(msg.port);
          controllerRef.current = new Inochi2DController(engine);
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

  return (
    <I18nProvider service={i18nService}>
      <div className="flex flex-col h-screen w-screen overflow-hidden">
        <div className="flex flex-1 overflow-hidden">
          <Toolbar />
          <div className="sketch-canvas-container">
            <SketchCanvas />
          </div>
          <div className="flex flex-col w-60 border-l border-[var(--sketch-border)] overflow-y-auto">
            <BrushPanel />
            <ColorPanel />
            <PalettePanel />
            <LayerPanel />
            <FilterPanel />
            <FrameControls />
            <SpriteSheetPlayer />
            <ParticlePanel />
            <ScenePanel />
            <AtmospherePanel />
            {puppetLoaded && (
              <>
                <PuppetNodeTree />
                <ParameterPanel controller={controllerRef.current} />
                <AnimationPanel onPlay={onPlay} onStop={onStop} onSeek={onSeek} />
              </>
            )}
          </div>
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
