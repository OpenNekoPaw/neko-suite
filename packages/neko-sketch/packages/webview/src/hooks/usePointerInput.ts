/**
 * usePointerInput - captures pointer events with pressure/tilt
 * for drawing on the sketch canvas.
 */
import { useRef, useCallback, useEffect } from 'react';
import type { StrokePoint } from '../types';

export interface PointerInputCallbacks {
  onStrokeStart: (point: StrokePoint) => void;
  onStrokeMove: (point: StrokePoint) => void;
  onStrokeEnd: (point: StrokePoint) => void;
}

function toStrokePoint(e: PointerEvent, canvas: HTMLCanvasElement): StrokePoint {
  const rect = canvas.getBoundingClientRect();
  return {
    x: e.clientX - rect.left,
    y: e.clientY - rect.top,
    pressure: e.pressure,
    tiltX: e.tiltX,
    tiltY: e.tiltY,
    timestamp: e.timeStamp,
  };
}

export function usePointerInput(
  canvasRef: React.RefObject<HTMLCanvasElement | null>,
  callbacks: PointerInputCallbacks,
  enabled: boolean = true,
) {
  const drawingRef = useRef(false);
  const cbRef = useRef(callbacks);
  cbRef.current = callbacks;

  const onPointerDown = useCallback(
    (e: PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas || !enabled) return;
      canvas.setPointerCapture(e.pointerId);
      drawingRef.current = true;
      cbRef.current.onStrokeStart(toStrokePoint(e, canvas));
    },
    [canvasRef, enabled],
  );

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas || !drawingRef.current) return;
      cbRef.current.onStrokeMove(toStrokePoint(e, canvas));
    },
    [canvasRef],
  );

  const onPointerUp = useCallback(
    (e: PointerEvent) => {
      const canvas = canvasRef.current;
      if (!canvas || !drawingRef.current) return;
      drawingRef.current = false;
      canvas.releasePointerCapture(e.pointerId);
      cbRef.current.onStrokeEnd(toStrokePoint(e, canvas));
    },
    [canvasRef],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
    };
  }, [canvasRef, onPointerDown, onPointerMove, onPointerUp]);
}
