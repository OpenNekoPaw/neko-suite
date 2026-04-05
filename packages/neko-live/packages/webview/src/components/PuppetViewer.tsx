import { useRef, useEffect, useCallback } from 'react';
import { useLiveStore } from '../stores/liveStore';
import { t } from '../i18n';

/**
 * 2D puppet renderer using Canvas 2D.
 * Renders deformed meshes from PuppetDelta data received via postMessage.
 */
export function PuppetViewer() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isAvatarLoaded = useLiveStore((s) => s.isAvatarLoaded);

  // Resize canvas to fill container
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

  // Render loop: draw puppet meshes from store
  const renderFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const delta = useLiveStore.getState().currentPuppetDelta;
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    if (!delta || delta.deformed_meshes.length === 0) {
      // Draw placeholder
      ctx.fillStyle = 'var(--vscode-descriptionForeground, #888)';
      ctx.font = `${14 * dpr}px system-ui`;
      ctx.textAlign = 'center';
      ctx.fillText(isAvatarLoaded ? t('puppet.waiting') : t('puppet.noModel'), w / 2, h / 2);
      return;
    }

    // Sort by z_order
    const meshes = [...delta.deformed_meshes].sort((a, b) => a.z_order - b.z_order);

    // Calculate bounds for auto-fit
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const mesh of meshes) {
      for (const [vx, vy] of mesh.vertices) {
        if (vx < minX) minX = vx;
        if (vy < minY) minY = vy;
        if (vx > maxX) maxX = vx;
        if (vy > maxY) maxY = vy;
      }
    }

    const meshW = maxX - minX || 1;
    const meshH = maxY - minY || 1;
    const scale = Math.min((w * 0.9) / meshW, (h * 0.9) / meshH);
    const offsetX = (w - meshW * scale) / 2 - minX * scale;
    const offsetY = (h - meshH * scale) / 2 - minY * scale;

    ctx.save();
    ctx.globalAlpha = 1;

    for (const mesh of meshes) {
      if (mesh.vertices.length < 3) continue;

      ctx.globalAlpha = mesh.opacity;
      ctx.beginPath();

      const firstVert = mesh.vertices[0]!;
      ctx.moveTo(firstVert[0] * scale + offsetX, firstVert[1] * scale + offsetY);

      for (let i = 1; i < mesh.vertices.length; i++) {
        const v = mesh.vertices[i]!;
        ctx.lineTo(v[0] * scale + offsetX, v[1] * scale + offsetY);
      }

      ctx.closePath();
      ctx.fillStyle = `hsl(${(mesh.z_order * 37) % 360}, 60%, 70%)`;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 0.5;
      ctx.stroke();
    }

    ctx.restore();
  }, [isAvatarLoaded]);

  // Animation loop
  useEffect(() => {
    let rafId: number;
    const loop = () => {
      renderFrame();
      rafId = requestAnimationFrame(loop);
    };
    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [renderFrame]);

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
