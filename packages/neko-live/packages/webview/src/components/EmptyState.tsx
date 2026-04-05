import { useRef, useEffect } from 'react';
import { useLiveStore } from '../stores/liveStore';
import { t } from '../i18n';

/**
 * Empty state shown when no avatar is loaded.
 * Displays:
 * - Guidance text for getting started
 * - Live tracking data visualization (blend shape bars + head dot)
 *   so users can verify VMC connection before loading a model
 */
export function EmptyState() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Resize canvas
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Render tracking preview
  useEffect(() => {
    let rafId: number;

    const render = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const data = useLiveStore.getState().currentTrackingData;
      const tracking = useLiveStore.getState().isTracking;

      // Draw guidance text
      ctx.textAlign = 'center';

      if (!tracking && !data) {
        // No tracking, no data — show full guide
        drawGuide(ctx, w, h, dpr);
      } else if (data) {
        // Tracking active with data — show live visualization
        drawTrackingPreview(ctx, w, h, dpr, data.blendShapes, data.headRotation);
      } else {
        // Tracking started but no data yet
        ctx.fillStyle = 'var(--vscode-descriptionForeground, #888)';
        ctx.font = `${13 * dpr}px system-ui`;
        ctx.fillText(t('empty.waitingData'), w / 2, h / 2);
      }

      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(rafId);
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        background: 'var(--vscode-editor-background, #1e1e1e)',
      }}
    >
      <canvas ref={canvasRef} style={{ display: 'block' }} />
    </div>
  );
}

/** Draw startup guidance */
function drawGuide(ctx: CanvasRenderingContext2D, w: number, h: number, dpr: number) {
  const cx = w / 2;
  const cy = h / 2;
  const lineH = 22 * dpr;

  // Icon: broadcast symbol
  ctx.fillStyle = 'var(--vscode-descriptionForeground, #666)';
  ctx.font = `${32 * dpr}px system-ui`;
  ctx.fillText('📡', cx, cy - lineH * 2);

  // Title
  ctx.fillStyle = 'var(--vscode-foreground, #ccc)';
  ctx.font = `bold ${14 * dpr}px system-ui`;
  ctx.fillText(t('empty.title'), cx, cy - lineH * 0.3);

  // Steps
  ctx.fillStyle = 'var(--vscode-descriptionForeground, #888)';
  ctx.font = `${11 * dpr}px system-ui`;
  const steps = [t('empty.step1'), t('empty.step2'), t('empty.step3')];
  steps.forEach((step, i) => {
    ctx.fillText(step, cx, cy + lineH * (i + 0.8));
  });
}

/** Draw live tracking data visualization */
function drawTrackingPreview(
  ctx: CanvasRenderingContext2D,
  w: number,
  _h: number,
  dpr: number,
  blendShapes: Record<string, number>,
  headRotation?: readonly [number, number, number, number],
) {
  const barW = 80 * dpr;
  const barH = 8 * dpr;
  const gap = 14 * dpr;
  const startX = 16 * dpr;
  let y = 20 * dpr;

  // Title
  ctx.fillStyle = 'var(--vscode-foreground, #ccc)';
  ctx.font = `bold ${11 * dpr}px system-ui`;
  ctx.textAlign = 'left';
  ctx.fillText(t('empty.trackingPreview'), startX, y);
  y += gap * 1.5;

  // Key blend shapes to show
  const keys = [
    'eyeBlinkLeft',
    'eyeBlinkRight',
    'jawOpen',
    'mouthSmileLeft',
    'mouthSmileRight',
    'browDownLeft',
    'browInnerUp',
  ];

  const labelW = 70 * dpr;

  for (const key of keys) {
    const val = blendShapes[key] ?? 0;

    // Label
    ctx.fillStyle = 'var(--vscode-descriptionForeground, #888)';
    ctx.font = `${9 * dpr}px system-ui`;
    ctx.textAlign = 'right';
    const shortLabel = key
      .replace('eye', 'E.')
      .replace('mouth', 'M.')
      .replace('brow', 'B.')
      .replace('Left', 'L')
      .replace('Right', 'R');
    ctx.fillText(shortLabel, startX + labelW, y + barH * 0.8);

    // Bar background
    ctx.fillStyle = 'rgba(128,128,128,0.2)';
    ctx.fillRect(startX + labelW + 6 * dpr, y, barW, barH);

    // Bar fill
    const hue = val > 0.7 ? 0 : val > 0.3 ? 45 : 120;
    ctx.fillStyle = `hsla(${hue}, 70%, 55%, 0.8)`;
    ctx.fillRect(startX + labelW + 6 * dpr, y, barW * val, barH);

    y += gap;
  }

  // Head rotation indicator (circle with directional dot)
  if (headRotation) {
    const [qx, qy, , qw] = headRotation;
    const yaw = Math.atan2(2 * (qw * qy), 1 - 2 * (qy * qy)) * (180 / Math.PI);
    const pitch = Math.asin(Math.max(-1, Math.min(1, 2 * (qw * qx)))) * (180 / Math.PI);

    const circleR = 30 * dpr;
    const cx = w - circleR - 20 * dpr;
    const cy = 60 * dpr;

    // Circle outline
    ctx.strokeStyle = 'rgba(128,128,128,0.3)';
    ctx.lineWidth = 1.5 * dpr;
    ctx.beginPath();
    ctx.arc(cx, cy, circleR, 0, Math.PI * 2);
    ctx.stroke();

    // Crosshair
    ctx.strokeStyle = 'rgba(128,128,128,0.15)';
    ctx.beginPath();
    ctx.moveTo(cx - circleR, cy);
    ctx.lineTo(cx + circleR, cy);
    ctx.moveTo(cx, cy - circleR);
    ctx.lineTo(cx, cy + circleR);
    ctx.stroke();

    // Head direction dot
    const dotX = cx + (yaw / 30) * circleR;
    const dotY = cy + (pitch / 30) * circleR;
    ctx.fillStyle = '#4ade80';
    ctx.beginPath();
    ctx.arc(dotX, dotY, 4 * dpr, 0, Math.PI * 2);
    ctx.fill();

    // Label
    ctx.fillStyle = 'var(--vscode-descriptionForeground, #888)';
    ctx.font = `${9 * dpr}px system-ui`;
    ctx.textAlign = 'center';
    ctx.fillText(t('empty.headRotation'), cx, cy + circleR + 14 * dpr);
  }
}
