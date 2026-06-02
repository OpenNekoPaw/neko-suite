import React, { useCallback, useEffect, useRef } from 'react';
import { getKeyboardBoundaryMetadata } from '@neko/ui/keyboard';
import { useModelStore } from '../stores/modelStore';

export interface ViewportOrbitControlsProps {
  viewportId?: string;
  onClickSelect?: (normalizedX: number, normalizedY: number) => void;
  onCameraChange?: (options?: { readonly immediate?: boolean }) => void;
  onInteractionActivity?: (options?: { readonly immediate?: boolean }) => void;
  onCameraMutated?: () => void;
}

const ORBIT_SENSITIVITY = 0.005;
const PAN_SENSITIVITY = 0.01;
const ZOOM_SENSITIVITY = 0.002;
const SEND_INTERVAL_MS = 33;
const CLICK_THRESHOLD_PX = 4;
const KEYBOARD_PAN_STEP = 0.08;
const KEYBOARD_ZOOM_STEP = 0.12;
const MIN_KEYBOARD_PAN_STEP = 0.002;
const MIN_KEYBOARD_ZOOM_STEP = 0.005;

type DragMode = 'select' | 'orbit' | 'pan' | 'zoom';

export function ViewportOrbitControls({
  onClickSelect,
  onCameraChange,
  onInteractionActivity,
  onCameraMutated,
}: ViewportOrbitControlsProps): React.JSX.Element {
  const lastSendRef = useRef(0);
  const pendingSendRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return () => {
      if (pendingSendRef.current !== null) {
        clearTimeout(pendingSendRef.current);
        pendingSendRef.current = null;
      }
    };
  }, []);

  const sendCamera = useCallback(
    (immediate = false) => {
      onCameraChange?.({ immediate });
    },
    [onCameraChange],
  );

  const throttledSendCamera = useCallback(() => {
    const now = Date.now();
    if (now - lastSendRef.current >= SEND_INTERVAL_MS) {
      lastSendRef.current = now;
      sendCamera();
    } else if (pendingSendRef.current === null) {
      pendingSendRef.current = setTimeout(
        () => {
          pendingSendRef.current = null;
          lastSendRef.current = Date.now();
          sendCamera();
        },
        SEND_INTERVAL_MS - (now - lastSendRef.current),
      );
    }
  }, [sendCamera]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const mode = resolveDragMode(e.button, e.altKey, e.shiftKey, e.ctrlKey || e.metaKey);
      if (!mode) return;

      onInteractionActivity?.({ immediate: true });
      rootRef.current?.focus();
      e.currentTarget.setPointerCapture(e.pointerId);
      e.preventDefault();

      const startX = e.clientX;
      const startY = e.clientY;
      let lastX = startX;
      let lastY = startY;
      let dragged = false;

      const onMove = (moveEvent: PointerEvent) => {
        const totalDx = moveEvent.clientX - startX;
        const totalDy = moveEvent.clientY - startY;
        if (!dragged && Math.abs(totalDx) + Math.abs(totalDy) > CLICK_THRESHOLD_PX) {
          dragged = true;
        }

        if (!dragged) return;

        const dx = moveEvent.clientX - lastX;
        const dy = moveEvent.clientY - lastY;
        lastX = moveEvent.clientX;
        lastY = moveEvent.clientY;
        onInteractionActivity?.();

        if (mode === 'pan') {
          panByPixels(dx, dy);
        } else if (mode === 'zoom') {
          zoomByPixels(dy);
        } else if (mode === 'orbit' || mode === 'select') {
          useModelStore.getState().orbitCamera(-dx * ORBIT_SENSITIVITY, dy * ORBIT_SENSITIVITY);
        } else {
          return;
        }
        onCameraMutated?.();
        throttledSendCamera();
      };

      const onUp = (upEvent: PointerEvent) => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);

        if (dragged) {
          onInteractionActivity?.();
          sendCamera(true);
        } else if (mode === 'select' && onClickSelect) {
          const rect = rootRef.current?.getBoundingClientRect();
          if (rect) {
            const nx = (upEvent.clientX - rect.left) / Math.max(1, rect.width);
            const ny = (upEvent.clientY - rect.top) / Math.max(1, rect.height);
            onClickSelect(Math.max(0, Math.min(1, nx)), Math.max(0, Math.min(1, ny)));
          }
        }
      };

      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
    },
    [throttledSendCamera, sendCamera, onClickSelect, onInteractionActivity, onCameraMutated],
  );

  useEffect(() => {
    const element = rootRef.current;
    if (!element) return;

    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      zoomByPixels(event.deltaY);
      onInteractionActivity?.({ immediate: true });
      onCameraMutated?.();
      throttledSendCamera();
    };

    element.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      element.removeEventListener('wheel', handleWheel);
    };
  }, [throttledSendCamera, onInteractionActivity, onCameraMutated]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const store = useModelStore.getState();
      const panStep = Math.max(MIN_KEYBOARD_PAN_STEP, store.cameraRadius * KEYBOARD_PAN_STEP);
      const zoomStep = Math.max(MIN_KEYBOARD_ZOOM_STEP, store.cameraRadius * KEYBOARD_ZOOM_STEP);
      let handled = true;

      switch (e.key) {
        case 'ArrowLeft':
          store.panCamera(-panStep, 0);
          break;
        case 'ArrowRight':
          store.panCamera(panStep, 0);
          break;
        case 'ArrowUp':
          store.panCamera(0, panStep);
          break;
        case 'ArrowDown':
          store.panCamera(0, -panStep);
          break;
        case '+':
        case '=':
          store.zoomCamera(-zoomStep);
          break;
        case '-':
        case '_':
          store.zoomCamera(zoomStep);
          break;
        default:
          handled = false;
          break;
      }

      if (!handled) return;
      onInteractionActivity?.({ immediate: true });
      onCameraMutated?.();
      e.preventDefault();
      throttledSendCamera();
    },
    [throttledSendCamera, onInteractionActivity, onCameraMutated],
  );

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  return (
    <div
      ref={rootRef}
      className="absolute inset-0"
      style={{ touchAction: 'none', cursor: 'default' }}
      tabIndex={0}
      {...getKeyboardBoundaryMetadata({
        scope: 'viewport',
        ownerId: 'model-viewport-controls',
        ownedKeys: ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Minus', 'Equal'],
      })}
      onPointerDown={handlePointerDown}
      onKeyDown={handleKeyDown}
      onContextMenu={handleContextMenu}
    />
  );
}

function resolveDragMode(
  button: number,
  altKey: boolean,
  shiftKey: boolean,
  ctrlKey: boolean,
): DragMode | null {
  if (altKey && button === 0) return 'orbit';
  if (altKey && button === 1) return 'pan';
  if (altKey && button === 2) return 'zoom';
  if (button === 0) return 'select';
  if (button === 2) return 'pan';
  if (button !== 1) return null;
  if (shiftKey) return 'pan';
  if (ctrlKey) return 'zoom';
  return 'orbit';
}

function panByPixels(dx: number, dy: number): void {
  const store = useModelStore.getState();
  const scale = PAN_SENSITIVITY * store.cameraRadius * 0.1;
  store.panCamera(dx * scale, dy * scale);
}

function zoomByPixels(deltaY: number): void {
  const store = useModelStore.getState();
  const direction = Math.sign(deltaY);
  const scaledDelta = deltaY * ZOOM_SENSITIVITY * store.cameraRadius;
  const minDelta = direction * MIN_KEYBOARD_ZOOM_STEP;
  store.zoomCamera(
    Math.abs(scaledDelta) >= MIN_KEYBOARD_ZOOM_STEP || direction === 0 ? scaledDelta : minDelta,
  );
}
