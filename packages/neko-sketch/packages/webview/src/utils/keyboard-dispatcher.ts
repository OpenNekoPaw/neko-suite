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
      // TODO(P2): select all pixels on active layer
      break;

    case 'deleteSelected':
      // TODO(P2): clear selected region on active layer
      break;

    case 'escape':
      // Clear selection, cancel current operation
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
