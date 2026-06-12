/**
 * Keyboard action dispatcher
 *
 * Maps keyboard action strings from the extension host
 * to Zustand store operations.
 */
import type { SketchStore } from '../stores/sketch-store';
import type { HistoryStateSnapshot, LayerData } from '../types';
import { deleteVectorSelection } from '../tools/vector-editing';
import { extractRegionSnapshot, findChangedPixelBounds } from './region-snapshot';

interface VsCodeApi {
  postMessage(message: unknown): void;
}

/**
 * Dispatch a keyboard action forwarded from the extension host.
 * Actions come from registered VSCode commands (see commands/index.ts).
 */
export function dispatchKeyboardAction(
  action: string,
  store: SketchStore,
  vscode: VsCodeApi,
): void {
  // Layer selection from outline tree view
  if (action.startsWith('selectLayer:')) {
    const layerId = action.slice('selectLayer:'.length);
    store.setActiveLayer(layerId);
    return;
  }

  switch (action) {
    case 'undo':
      notifyHistoryReplay(store.undo(), 'undo', vscode);
      break;

    case 'redo':
      notifyHistoryReplay(store.redo(), 'redo', vscode);
      break;

    case 'selectAll':
      store.selectAll();
      break;

    case 'deleteSelected':
      if (deleteSelectedVectorGeometry(store)) {
        notifyVectorEdit(vscode, 'Delete vector selection');
        break;
      }
      if (deleteSelectedRegion(store)) {
        notifyPixelEdit(vscode, 'Delete selection');
      }
      break;

    case 'escape':
      // Clear selection, cancel current operation
      store.clearSelection();
      store.setActiveTool('brush');
      break;

    case 'selectBrush':
      store.setActiveTool('brush');
      break;

    case 'selectEraser':
      store.setActiveTool('eraser');
      break;

    case 'selectMove':
      store.setActiveTool('move');
      break;

    case 'selectShape':
      store.setActiveTool('shape');
      break;

    case 'selectZoom':
      store.setActiveTool('zoom');
      break;

    case 'selectFill':
      store.setActiveTool('fill');
      break;

    case 'selectSelect':
      store.setActiveTool('select-rect');
      break;

    case 'selectTransform':
      store.setActiveTool('transform');
      break;

    case 'pickColor':
      store.setActiveTool('eyedropper');
      break;

    case 'adjustSize':
      // Cycle brush size: small → medium → large
      cycleBrushSize(store);
      break;

    case 'resetZoom':
      store.resetViewport();
      break;

    case 'rotateViewLeft':
      store.rotateViewportBy(-Math.PI / 12);
      break;

    case 'rotateViewRight':
      store.rotateViewportBy(Math.PI / 12);
      break;

    case 'resetRotation':
      store.resetViewportRotation();
      break;

    case 'import':
      vscode.postMessage({ type: 'file:import' });
      break;

    case 'export':
      exportCanvas(store, vscode);
      break;

    case 'exportSpriteSheet':
      exportSpriteSheet(store, vscode);
      break;

    case 'exportScene':
      exportScene(store, vscode);
      break;

    case 'importAsset':
      vscode.postMessage({ type: 'file:import' });
      break;
  }
}

function deleteSelectedVectorGeometry(store: SketchStore): boolean {
  if (store.activeTool !== 'vector' || !store.activeLayerId) {
    return false;
  }

  const layer = findLayerById(store.layers, store.activeLayerId);
  if (!layer || layer.type !== 'vector' || layer.locked || !layer.vectorData) {
    return false;
  }

  const result = deleteVectorSelection(layer.vectorData);
  if (!result.deleted) {
    return false;
  }

  const before = captureLayerStateSnapshot(store.layers, store.activeLayerId);
  const nextLayers = updateLayerById(store.layers, layer.id, (item) => ({
    ...item,
    vectorData: result.layerData,
  }));
  const after = captureLayerStateSnapshot(nextLayers, store.activeLayerId);
  store.setLayers(nextLayers);
  store.pushHistory({
    type: 'clear',
    label: 'Delete vector selection',
    snapshot: null,
    stateSnapshot: { before, after },
  });
  store.markDirty();
  return true;
}

function captureLayerStateSnapshot(
  layers: readonly LayerData[],
  activeLayerId: string | null,
): HistoryStateSnapshot {
  return {
    layers: layers.map(cloneLayerForHistory),
    activeLayerId,
  };
}

function cloneLayerForHistory(layer: LayerData): LayerData {
  return {
    ...layer,
    children: layer.children.map(cloneLayerForHistory),
  };
}

function findLayerById(layers: readonly LayerData[], layerId: string): LayerData | null {
  for (const layer of layers) {
    if (layer.id === layerId) {
      return layer;
    }
    const child = findLayerById(layer.children, layerId);
    if (child) {
      return child;
    }
  }
  return null;
}

function updateLayerById(
  layers: readonly LayerData[],
  layerId: string,
  update: (layer: LayerData) => LayerData,
): LayerData[] {
  return layers.map((layer) => {
    if (layer.id === layerId) {
      return update(layer);
    }
    return { ...layer, children: updateLayerById(layer.children, layerId, update) };
  });
}

function notifyHistoryReplay(
  entry: ReturnType<SketchStore['undo']>,
  direction: 'undo' | 'redo',
  vscode: VsCodeApi,
): void {
  if (!entry || (!entry.stateSnapshot && !entry.snapshot)) {
    return;
  }
  vscode.postMessage({
    type: 'operationApplied',
    operation: {
      type: `sketch.history.${direction}`,
      meta: {
        id: `sketch-history-${direction}-${Date.now()}`,
        timestamp: Date.now(),
        source: 'user',
        description: `${direction}: ${entry.label}`,
      },
      payload: { historyEntryId: entry.id, actionType: entry.type },
    },
  });
}

/**
 * Clear pixels in the selected region on the active layer.
 * Writes transparent pixels to the WebGL texture via the canvas 2D fallback.
 */
function deleteSelectedRegion(store: SketchStore): boolean {
  const { selection, activeLayerId, layers } = store;
  if (!selection || !activeLayerId) return false;

  const layer = layers.find((l) => l.id === activeLayerId);
  if (!layer || layer.locked || !layer.texture) return false;

  // Get the WebGL canvas to access the GL context
  const canvas = document.getElementById('sketch-canvas') as HTMLCanvasElement | null;
  if (!canvas) return false;

  const gl = canvas.getContext('webgl2');
  if (!gl) return false;

  // Build a transparent pixel buffer for the full layer, zeroing selected pixels
  const { width, height, data } = selection;

  // Create a temporary FBO to read/write the layer texture
  const fbo = gl.createFramebuffer();
  if (!fbo) return false;

  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, layer.texture, 0);

  // Read existing pixels
  const existing = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, existing);
  const beforePixels = new Uint8Array(existing);

  // Zero out selected pixels
  for (let i = 0; i < data.length; i++) {
    if (data[i]! > 0) {
      const offset = i * 4;
      existing[offset] = 0;
      existing[offset + 1] = 0;
      existing[offset + 2] = 0;
      existing[offset + 3] = 0;
    }
  }

  // Write back
  const changedBounds = findChangedPixelBounds(beforePixels, existing, width, height);
  if (!changedBounds) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(fbo);
    return false;
  }

  const before = extractRegionSnapshot(activeLayerId, beforePixels, width, height, changedBounds);
  const after = extractRegionSnapshot(activeLayerId, existing, width, height, changedBounds);
  if (before && after) {
    store.pushHistory({
      type: 'clear',
      label: 'Delete selection',
      snapshot: { before, after },
    });
  }

  gl.bindTexture(gl.TEXTURE_2D, layer.texture);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, existing);
  gl.bindTexture(gl.TEXTURE_2D, null);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.deleteFramebuffer(fbo);

  store.setLayers(updateLayerById(store.layers, activeLayerId, (item) => ({ ...item })));
  store.markDirty();
  return true;
}

function notifyPixelEdit(vscode: VsCodeApi, description: string): void {
  vscode.postMessage({
    type: 'operationApplied',
    operation: {
      type: 'sketch.pixel.edit',
      meta: {
        id: `sketch-pixel-${Date.now()}`,
        timestamp: Date.now(),
        source: 'user',
        description,
      },
      payload: {},
    },
  });
}

function notifyVectorEdit(vscode: VsCodeApi, description: string): void {
  vscode.postMessage({
    type: 'operationApplied',
    operation: {
      type: 'sketch.vector.edit',
      meta: {
        id: `sketch-vector-${Date.now()}`,
        timestamp: Date.now(),
        source: 'user',
        description,
      },
      payload: {},
    },
  });
}

function cycleBrushSize(store: SketchStore): void {
  const current = store.brushSettings.size;
  if (current < 10) {
    store.setBrushSize(20);
  } else if (current < 30) {
    store.setBrushSize(50);
  } else {
    store.setBrushSize(5);
  }
}

function exportSpriteSheet(store: SketchStore, vscode: VsCodeApi): void {
  const { frameLayers, selectedFrameLayerId, canvas } = store;
  const layer = frameLayers.find((l) => l.id === selectedFrameLayerId);
  if (!layer || layer.frames.length === 0) return;

  // Dynamically import to avoid circular dependency
  void (async () => {
    const { exportSpriteSheet: doExport } = await import('./spritesheet-export');
    const { blobToBase64 } = await import('./asset-export');
    try {
      const result = await doExport(layer.frames, {
        frameWidth: canvas.width,
        frameHeight: canvas.height,
      });
      const dataUrl = await blobToBase64(result.image);
      const base64 = dataUrl.split(',')[1] ?? '';
      vscode.postMessage({
        type: 'file:export',
        data: {
          format: 'spritesheet',
          data: base64,
          metadata: result.meta,
          name: `${layer.name}_spritesheet`,
        },
      });
    } catch {
      // Export failed silently
    }
  })();
}

function exportScene(store: SketchStore, vscode: VsCodeApi): void {
  const { scenes, activeSceneId } = store;
  const scene = scenes.find((s) => s.id === activeSceneId);
  if (!scene) return;

  const json = JSON.stringify(scene, null, 2);
  vscode.postMessage({
    type: 'file:export',
    data: {
      format: 'json',
      data: btoa(json),
      name: `${scene.name}_scene`,
      metadata: { type: 'scene' },
    },
  });
}

function exportCanvas(store: SketchStore, vscode: VsCodeApi): void {
  // Read canvas pixels via offscreen canvas for PNG export
  const canvas = document.getElementById('sketch-canvas') as HTMLCanvasElement | null;
  if (!canvas) return;

  try {
    const dataUrl = canvas.toDataURL('image/png');
    const base64 = dataUrl.split(',')[1] ?? '';
    vscode.postMessage({
      type: 'file:export',
      data: { format: 'png', data: base64 },
    });
  } catch {
    // WebGL canvas may need preserveDrawingBuffer
    void store; // suppress unused
  }
}
