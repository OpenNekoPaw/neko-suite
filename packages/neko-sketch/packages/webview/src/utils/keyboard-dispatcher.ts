/**
 * Keyboard action dispatcher
 *
 * Maps keyboard action strings from the extension host
 * to Zustand store operations.
 */
import type { SketchStore } from '../stores/sketch-store';

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
      store.undo();
      break;

    case 'redo':
      store.redo();
      break;

    case 'selectAll':
      store.selectAll();
      break;

    case 'deleteSelected':
      deleteSelectedRegion(store);
      break;

    case 'escape':
      // Clear selection, cancel current operation
      store.clearSelection();
      store.setActiveTool('brush');
      break;

    case 'selectBrush':
      store.setActiveTool('brush');
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

    case 'import':
      vscode.postMessage({ type: 'file:import' });
      break;

    case 'export':
      exportCanvas(store, vscode);
      break;
  }
}

/**
 * Clear pixels in the selected region on the active layer.
 * Writes transparent pixels to the WebGL texture via the canvas 2D fallback.
 */
function deleteSelectedRegion(store: SketchStore): void {
  const { selection, activeLayerId, layers } = store;
  if (!selection || !activeLayerId) return;

  const layer = layers.find((l) => l.id === activeLayerId);
  if (!layer || layer.locked || !layer.texture) return;

  // Get the WebGL canvas to access the GL context
  const canvas = document.getElementById('sketch-canvas') as HTMLCanvasElement | null;
  if (!canvas) return;

  const gl = canvas.getContext('webgl2');
  if (!gl) return;

  // Build a transparent pixel buffer for the full layer, zeroing selected pixels
  const { width, height, data } = selection;

  // Create a temporary FBO to read/write the layer texture
  const fbo = gl.createFramebuffer();
  if (!fbo) return;

  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, layer.texture, 0);

  // Read existing pixels
  const existing = new Uint8Array(width * height * 4);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, existing);

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
  gl.bindTexture(gl.TEXTURE_2D, layer.texture);
  gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, existing);
  gl.bindTexture(gl.TEXTURE_2D, null);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.deleteFramebuffer(fbo);

  store.markDirty();
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
