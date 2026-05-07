import React, { useCallback, useEffect, useRef } from 'react';
import { EngineClient } from '@neko/neko-client';
import { useModelStore } from '../stores/modelStore';

export interface ViewportOrbitControlsProps {
  enginePort: number;
  onClickSelect?: (normalizedX: number, normalizedY: number) => void;
}

const ORBIT_SENSITIVITY = 0.005;
const PAN_SENSITIVITY = 0.01;
const ZOOM_SENSITIVITY = 0.002;
const SEND_INTERVAL_MS = 33;
const CLICK_THRESHOLD_PX = 4;

export function ViewportOrbitControls({
  enginePort,
  onClickSelect,
}: ViewportOrbitControlsProps): React.JSX.Element {
  const engineClientRef = useRef<EngineClient | null>(null);
  const lastSendRef = useRef(0);
  const pendingSendRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    engineClientRef.current = new EngineClient(enginePort);
    return () => {
      engineClientRef.current = null;
      if (pendingSendRef.current !== null) {
        clearTimeout(pendingSendRef.current);
        pendingSendRef.current = null;
      }
    };
  }, [enginePort]);

  const sendCamera = useCallback(() => {
    const client = engineClientRef.current;
    if (!client) return;

    const store = useModelStore.getState();
    const position = store.getCameraPosition();
    const target = store.cameraTarget;

    void client.updateEditorCamera(position, target).catch(() => {});
  }, []);

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
      if (e.button !== 0 && e.button !== 2) return;

      const isRightButton = e.button === 2;
      const isPan = isRightButton || e.altKey;
      const isLeftClick = e.button === 0 && !e.altKey;

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

        if (isPan) {
          const radius = useModelStore.getState().cameraRadius;
          useModelStore
            .getState()
            .panCamera(dx * PAN_SENSITIVITY * radius * 0.1, dy * PAN_SENSITIVITY * radius * 0.1);
        } else {
          useModelStore.getState().orbitCamera(-dx * ORBIT_SENSITIVITY, dy * ORBIT_SENSITIVITY);
        }
        throttledSendCamera();
      };

      const onUp = (upEvent: PointerEvent) => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);

        if (dragged) {
          sendCamera();
        } else if (isLeftClick && onClickSelect) {
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
    [throttledSendCamera, sendCamera, onClickSelect],
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      e.preventDefault();
      const radius = useModelStore.getState().cameraRadius;
      useModelStore.getState().zoomCamera(e.deltaY * ZOOM_SENSITIVITY * radius);
      throttledSendCamera();
    },
    [throttledSendCamera],
  );

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  return (
    <div
      ref={rootRef}
      className="absolute inset-0"
      style={{ touchAction: 'none', cursor: 'grab' }}
      onPointerDown={handlePointerDown}
      onWheel={handleWheel}
      onContextMenu={handleContextMenu}
    />
  );
}
