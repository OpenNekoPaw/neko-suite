import { forwardRef, useImperativeHandle, useRef } from 'react';

export interface LiveCompositorCanvasHandle {
  readonly drawFrame: (frame: VideoFrame) => void;
}

export const LiveCompositorCanvas = forwardRef<LiveCompositorCanvasHandle>(
  function LiveCompositorCanvas(_props, ref) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    useImperativeHandle(
      ref,
      () => ({
        drawFrame(frame: VideoFrame): void {
          const canvas = canvasRef.current;
          if (!canvas) return;
          const width = Math.max(1, frame.displayWidth || frame.codedWidth);
          const height = Math.max(1, frame.displayHeight || frame.codedHeight);
          if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
          }
          const context = canvas.getContext('2d');
          if (!context) return;
          context.drawImage(frame, 0, 0, width, height);
        },
      }),
      [],
    );

    return (
      <canvas
        ref={canvasRef}
        className="live-compositor-canvas"
        data-live-compositor-canvas="true"
        aria-label="Live compositor stream"
      />
    );
  },
);
