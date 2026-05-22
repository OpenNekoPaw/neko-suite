/**
 * PuppetCanvas — 2D Canvas renderer for puppet meshes (INP/MOC3).
 *
 * Draws deformed triangle meshes with texture mapping using Canvas 2D API.
 * Supports zoom/pan via mouse wheel and drag.
 */
import { useEffect, useRef, useCallback, useMemo } from 'react';
import { usePuppetStore } from '../stores/puppet-store';
import type { DeformedMesh, MeshSnapshot, PuppetNodeSnapshot } from '../animation/types';

export interface PuppetCanvasProps {
  readonly overlayLayer?: React.ReactNode;
  readonly toolbarLayer?: React.ReactNode;
  readonly contextMenuLayer?: React.ReactNode;
  readonly fallbackLabel?: React.ReactNode;
}

// ── Blend mode mapping ──────────────────────────────────────────────────────

const BLEND_MODE_MAP: Record<string, GlobalCompositeOperation> = {
  Normal: 'source-over',
  Multiply: 'multiply',
  Screen: 'screen',
  Overlay: 'overlay',
  Add: 'lighter',
};

// ── Textured triangle drawing ───────────────────────────────────────────────

/**
 * Draw a textured triangle using affine transform + clip.
 *
 * Maps UV coordinates to canvas coordinates via a 2D affine matrix,
 * clips to the triangle shape, then draws the texture image.
 */
function drawTexturedTriangle(
  ctx: CanvasRenderingContext2D,
  tex: ImageBitmap,
  // Canvas-space triangle vertices
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  // UV coordinates (0-1 range)
  u0: number,
  v0: number,
  u1: number,
  v1: number,
  u2: number,
  v2: number,
): void {
  // Scale UVs to texture pixel coordinates
  const tw = tex.width;
  const th = tex.height;
  const su0 = u0 * tw,
    sv0 = v0 * th;
  const su1 = u1 * tw,
    sv1 = v1 * th;
  const su2 = u2 * tw,
    sv2 = v2 * th;

  // Solve affine transform: texture space → canvas space
  // [x] = [a c e] [u]
  // [y]   [b d f] [v]
  // [1]   [0 0 1] [1]
  const det = (su1 - su0) * (sv2 - sv0) - (su2 - su0) * (sv1 - sv0);
  if (Math.abs(det) < 1e-10) return; // Degenerate triangle

  const idet = 1 / det;
  const a = ((x1 - x0) * (sv2 - sv0) - (x2 - x0) * (sv1 - sv0)) * idet;
  const b = ((y1 - y0) * (sv2 - sv0) - (y2 - y0) * (sv1 - sv0)) * idet;
  const c = ((x2 - x0) * (su1 - su0) - (x1 - x0) * (su2 - su0)) * idet;
  const d = ((y2 - y0) * (su1 - su0) - (y1 - y0) * (su2 - su0)) * idet;
  const e = x0 - a * su0 - c * sv0;
  const f = y0 - b * su0 - d * sv0;

  ctx.save();
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.closePath();
  ctx.clip();
  ctx.setTransform(a, b, c, d, e, f);
  ctx.drawImage(tex, 0, 0);
  ctx.restore();
}

/** Draw a solid-colored triangle (fallback when no texture). */
function drawSolidTriangle(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
): void {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function buildSolidColorCache(textures: ImageBitmap[]): ReadonlyMap<number, string> {
  const colors = new Map<number, string>();
  const sampleCanvas = document.createElement('canvas');
  const sampleCtx = sampleCanvas.getContext('2d');
  if (!sampleCtx) return colors;

  textures.forEach((texture, index) => {
    if (texture.width > 16 || texture.height > 16) return;

    sampleCanvas.width = texture.width;
    sampleCanvas.height = texture.height;
    sampleCtx.clearRect(0, 0, texture.width, texture.height);
    sampleCtx.drawImage(texture, 0, 0);

    const pixel = sampleCtx.getImageData(texture.width >> 1, texture.height >> 1, 1, 1).data;
    colors.set(index, `rgba(${pixel[0]},${pixel[1]},${pixel[2]},${(pixel[3] ?? 255) / 255})`);
  });

  return colors;
}

// ── Main render function ────────────────────────────────────────────────────

function renderPuppet(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  meshSnapshots: MeshSnapshot[],
  deformedMeshes: DeformedMesh[],
  textures: ImageBitmap[],
  solidColors: ReadonlyMap<number, string>,
  viewport: { zoom: number; panX: number; panY: number },
): void {
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.width / dpr;
  const cssH = canvas.height / dpr;

  // Reset transform to identity then apply DPR
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  // Build lookup: node_id → mesh snapshot (for indices + uvs + texture_index)
  const snapshotMap = new Map<string, MeshSnapshot>();
  for (const ms of meshSnapshots) {
    snapshotMap.set(ms.node_id, ms);
  }

  ctx.save();

  // Apply viewport transform: center of CSS canvas + zoom + pan
  const cx = cssW / 2;
  const cy = cssH / 2;
  ctx.translate(cx + viewport.panX, cy + viewport.panY);
  ctx.scale(viewport.zoom, viewport.zoom);

  // Draw each mesh (already sorted by z_order from engine)
  for (const dm of deformedMeshes) {
    const snapshot = snapshotMap.get(dm.node_id);
    if (!snapshot) {
      continue;
    }

    const { indices, uvs, texture_index } = snapshot;
    const verts = dm.vertices;
    const tex = texture_index != null ? textures[texture_index] : undefined;
    const solidColor = texture_index != null ? solidColors.get(texture_index) : undefined;

    ctx.globalAlpha = dm.opacity;
    ctx.globalCompositeOperation = BLEND_MODE_MAP[dm.blend_mode] ?? 'source-over';

    // Draw each triangle
    for (let i = 0; i < indices.length; i += 3) {
      const i0 = indices[i]!;
      const i1 = indices[i + 1]!;
      const i2 = indices[i + 2]!;

      const v0 = verts[i0];
      const v1 = verts[i1];
      const v2 = verts[i2];
      if (!v0 || !v1 || !v2) continue;

      if (solidColor) {
        // Small texture → use sampled solid color
        drawSolidTriangle(ctx, v0[0], v0[1], v1[0], v1[1], v2[0], v2[1], solidColor);
      } else if (tex) {
        const uv0 = uvs[i0];
        const uv1 = uvs[i1];
        const uv2 = uvs[i2];
        if (!uv0 || !uv1 || !uv2) continue;

        drawTexturedTriangle(
          ctx,
          tex,
          v0[0],
          v0[1],
          v1[0],
          v1[1],
          v2[0],
          v2[1],
          uv0[0],
          uv0[1],
          uv1[0],
          uv1[1],
          uv2[0],
          uv2[1],
        );
      } else {
        // No texture — draw solid with skin-tone fallback
        drawSolidTriangle(ctx, v0[0], v0[1], v1[0], v1[1], v2[0], v2[1], 'rgba(217, 190, 163, 1)');
      }
    }
  }

  ctx.restore();
}

function renderPreviewFrame(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  frame: VideoFrame,
): void {
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.width / dpr;
  const cssH = canvas.height / dpr;
  const frameW = frame.displayWidth || frame.codedWidth;
  const frameH = frame.displayHeight || frame.codedHeight;
  if (frameW <= 0 || frameH <= 0) return;

  const scale = Math.min(cssW / frameW, cssH / frameH);
  const width = frameW * scale;
  const height = frameH * scale;
  const x = (cssW - width) / 2;
  const y = (cssH - height) / 2;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);
  ctx.drawImage(frame, x, y, width, height);
}

function renderNativeBoneOverlay(
  ctx: CanvasRenderingContext2D,
  nodes: readonly PuppetNodeSnapshot[],
  selectedBoneId: string | null,
): void {
  const bones = nodes.filter((node) => node.node_type === 'group');
  if (bones.length === 0) return;

  ctx.save();
  ctx.lineWidth = 1 / Math.max(ctx.getTransform().a, 1);
  ctx.strokeStyle = 'rgba(75, 190, 255, 0.85)';
  ctx.fillStyle = 'rgba(75, 190, 255, 0.95)';

  for (const bone of bones) {
    if (bone.parent_id) {
      const parent = nodes.find((node) => node.id === bone.parent_id);
      if (parent) {
        ctx.beginPath();
        ctx.moveTo(parent.position[0], parent.position[1]);
        ctx.lineTo(bone.position[0], bone.position[1]);
        ctx.stroke();
      }
    }

    ctx.beginPath();
    ctx.arc(
      bone.position[0],
      bone.position[1],
      bone.id === selectedBoneId ? 3.5 : 2.5,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }

  ctx.restore();
}

// ── React Component ─────────────────────────────────────────────────────────

export function PuppetCanvas({
  overlayLayer = null,
  toolbarLayer = null,
  contextMenuLayer = null,
  fallbackLabel = null,
}: PuppetCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);
  const needsRenderRef = useRef(true);

  const meshSnapshots = usePuppetStore((s) => s.puppetSnapshot?.meshes ?? []);
  const nodes = usePuppetStore((s) => s.puppetSnapshot?.nodes ?? []);
  const deformedMeshes = usePuppetStore((s) => s.deformedMeshes);
  const textures = usePuppetStore((s) => s.textures);
  const viewport = usePuppetStore((s) => s.viewport);
  const previewFrame = usePuppetStore((s) => s.previewFrame);
  const selectedBoneId = usePuppetStore((s) => s.selectedNativeBoneId);
  const setViewport = usePuppetStore((s) => s.setViewport);
  const solidColors = useMemo(() => buildSolidColorCache(textures), [textures]);

  // Mark dirty when mesh data changes
  useEffect(() => {
    needsRenderRef.current = true;
  }, [deformedMeshes, textures, viewport, previewFrame]);

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let running = true;
    const loop = () => {
      if (!running) return;
      if (needsRenderRef.current) {
        needsRenderRef.current = false;
        if (previewFrame) {
          renderPreviewFrame(ctx, canvas, previewFrame);
        } else {
          renderPuppet(ctx, canvas, meshSnapshots, deformedMeshes, textures, solidColors, viewport);
          const dpr = window.devicePixelRatio || 1;
          const cssW = canvas.width / dpr;
          const cssH = canvas.height / dpr;
          ctx.save();
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.translate(cssW / 2 + viewport.panX, cssH / 2 + viewport.panY);
          ctx.scale(viewport.zoom, viewport.zoom);
          renderNativeBoneOverlay(ctx, nodes, selectedBoneId);
          ctx.restore();
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      running = false;
      cancelAnimationFrame(rafRef.current);
    };
  }, [
    meshSnapshots,
    nodes,
    deformedMeshes,
    textures,
    solidColors,
    viewport,
    previewFrame,
    selectedBoneId,
  ]);

  // Resize observer — keep canvas size in sync with container
  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        needsRenderRef.current = true;
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Mouse wheel zoom
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.max(0.1, Math.min(10, viewport.zoom * delta));
      setViewport({ ...viewport, zoom: newZoom });
    },
    [viewport, setViewport],
  );

  // Mouse drag pan
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 1 && !(e.button === 0 && e.altKey)) return; // middle-click or alt+left-click
      e.preventDefault();
      const startX = e.clientX;
      const startY = e.clientY;
      const startPan = { ...viewport };

      const onMove = (ev: MouseEvent) => {
        setViewport({
          zoom: startPan.zoom,
          panX: startPan.panX + (ev.clientX - startX),
          panY: startPan.panY + (ev.clientY - startY),
        });
      };
      const onUp = () => {
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [viewport, setViewport],
  );

  return (
    <div
      ref={containerRef}
      className="flex-1 relative overflow-hidden bg-[var(--vscode-editor-background)]"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
    >
      <canvas ref={canvasRef} className="absolute inset-0" />
      {overlayLayer}
      {toolbarLayer}
      {contextMenuLayer}
      {fallbackLabel}
    </div>
  );
}
