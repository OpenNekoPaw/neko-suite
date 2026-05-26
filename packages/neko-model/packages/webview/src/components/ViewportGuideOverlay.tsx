import React, { useEffect, useMemo, useRef } from 'react';
import { useModelStore } from '../stores/modelStore';

type Vec3 = readonly [number, number, number];
type Vec2 = readonly [number, number];

interface CameraFrame {
  readonly position: Vec3;
  readonly forward: Vec3;
  readonly right: Vec3;
  readonly up: Vec3;
  readonly aspect: number;
  readonly fovRad: number;
  readonly width: number;
  readonly height: number;
}

interface GuideTheme {
  readonly widgetBackground: string;
  readonly widgetBorder: string;
  readonly ruler: string;
  readonly rulerText: string;
  readonly tick: string;
  readonly axisX: string;
  readonly axisY: string;
  readonly axisZ: string;
}

const WORLD_UP: Vec3 = [0, 1, 0];
const EDITOR_CAMERA_FOV_DEG = 45;
const HUD_LEFT = 18;
const HUD_BOTTOM = 22;
const HUD_GIZMO_RADIUS = 38;
const HUD_GIZMO_GAP = 20;
const HUD_RULER_HEIGHT = 28;
const DEFAULT_GUIDE_THEME: GuideTheme = {
  widgetBackground: 'rgba(24, 27, 31, 0.42)',
  widgetBorder: 'rgba(255, 255, 255, 0.08)',
  ruler: 'rgba(226, 232, 240, 0.72)',
  rulerText: 'rgba(226, 232, 240, 0.82)',
  tick: 'rgba(255, 255, 255, 0.12)',
  axisX: 'rgba(238, 93, 80, 0.82)',
  axisY: 'rgba(110, 220, 121, 0.9)',
  axisZ: 'rgba(91, 176, 255, 0.86)',
};

export interface ViewportGuideOverlayProps {
  visible?: boolean;
}

export function ViewportGuideOverlay({
  visible = true,
}: ViewportGuideOverlayProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraTheta = useModelStore((state) => state.cameraTheta);
  const cameraPhi = useModelStore((state) => state.cameraPhi);
  const cameraTarget = useModelStore((state) => state.cameraTarget);
  const cameraRadius = useModelStore((state) => state.cameraRadius);
  const cameraPosition = useMemo(
    () => cameraPositionFromOrbit(cameraTheta, cameraPhi, cameraRadius, cameraTarget),
    [cameraPhi, cameraRadius, cameraTarget, cameraTheta],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const draw = () => {
      if (visible) {
        drawGuides(canvas, cameraPosition, cameraTarget, cameraRadius, readGuideTheme(canvas));
        return;
      }
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };
    draw();

    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    const themeObserver = new MutationObserver(draw);
    themeObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ['class', 'data-vscode-theme-kind'],
    });
    return () => {
      observer.disconnect();
      themeObserver.disconnect();
    };
  }, [cameraPosition, cameraRadius, cameraTarget, visible]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 h-full w-full"
      data-route-a-guide-overlay="screen-hud"
      aria-hidden="true"
    />
  );
}

function cameraPositionFromOrbit(theta: number, phi: number, radius: number, target: Vec3): Vec3 {
  return [
    target[0] + radius * Math.sin(phi) * Math.sin(theta),
    target[1] + radius * Math.cos(phi),
    target[2] + radius * Math.sin(phi) * Math.cos(theta),
  ];
}

function drawGuides(
  canvas: HTMLCanvasElement,
  cameraPosition: Vec3,
  cameraTarget: Vec3,
  cameraRadius: number,
  theme: GuideTheme,
): void {
  const rect = canvas.getBoundingClientRect();
  const scale = window.devicePixelRatio || 1;
  const width = Math.max(1, Math.floor(rect.width * scale));
  const height = Math.max(1, Math.floor(rect.height * scale));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, width, height);
  ctx.save();
  ctx.scale(scale, scale);

  const frame = createCameraFrame(cameraPosition, cameraTarget, rect.width, rect.height);
  const minorStep = niceStep(cameraRadius / 8);
  drawNavigationGizmo(ctx, frame, rect.height, theme);
  drawScaleRuler(ctx, rect.width, rect.height, minorStep, theme);

  ctx.restore();
}

function drawNavigationGizmo(
  ctx: CanvasRenderingContext2D,
  frame: CameraFrame,
  height: number,
  theme: GuideTheme,
): void {
  const origin: Vec2 = [
    HUD_LEFT + HUD_GIZMO_RADIUS,
    Math.max(HUD_GIZMO_RADIUS + HUD_RULER_HEIGHT + HUD_BOTTOM, height - 78),
  ];
  const axisLength = 24;
  const axes = (
    [
      { axis: [0, 0, 1], color: theme.axisZ, label: 'Z' },
      { axis: [1, 0, 0], color: theme.axisX, label: 'X' },
      { axis: [0, 1, 0], color: theme.axisY, label: 'Y' },
    ] satisfies Array<{ axis: Vec3; color: string; label: string }>
  ).sort((a, b) => dot(a.axis, frame.forward) - dot(b.axis, frame.forward));

  ctx.save();
  ctx.fillStyle = theme.widgetBackground;
  ctx.strokeStyle = theme.widgetBorder;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(origin[0], origin[1], HUD_GIZMO_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.lineWidth = 2;
  ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (const axis of axes) {
    const projected = projectDirection(axis.axis, frame, axisLength);
    const end: Vec2 = [origin[0] + projected[0], origin[1] + projected[1]];
    ctx.strokeStyle = axis.color;
    ctx.fillStyle = axis.color;
    ctx.beginPath();
    ctx.moveTo(origin[0], origin[1]);
    ctx.lineTo(end[0], end[1]);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(end[0], end[1], 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillText(axis.label, end[0] + Math.sign(projected[0] || 1) * 11, end[1]);
  }

  ctx.restore();
}

function drawScaleRuler(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  minorStep: number,
  theme: GuideTheme,
): void {
  const rulerWidth = Math.min(180, Math.max(96, width * 0.16));
  const left = HUD_LEFT + HUD_GIZMO_RADIUS * 2 + HUD_GIZMO_GAP;
  const top = Math.max(18, height - HUD_BOTTOM);
  const majorStep = minorStep * 5;
  const label = formatGridStep(majorStep);

  ctx.save();
  ctx.font = '11px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.lineCap = 'butt';

  ctx.fillStyle = theme.widgetBackground;
  ctx.strokeStyle = theme.widgetBorder;
  ctx.lineWidth = 1;
  roundRect(ctx, left - 8, top - 14, rulerWidth + 74, 28, 6);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = theme.ruler;
  ctx.fillStyle = theme.rulerText;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(left, top);
  ctx.lineTo(left + rulerWidth, top);
  ctx.moveTo(left, top - 6);
  ctx.lineTo(left, top + 6);
  ctx.moveTo(left + rulerWidth, top - 6);
  ctx.lineTo(left + rulerWidth, top + 6);
  ctx.stroke();

  ctx.strokeStyle = theme.tick;
  ctx.beginPath();
  for (let index = 1; index < 5; index += 1) {
    const x = left + (rulerWidth * index) / 5;
    ctx.moveTo(x, top - 3);
    ctx.lineTo(x, top + 3);
  }
  ctx.stroke();
  ctx.fillText(label, left + rulerWidth + 10, top);
  ctx.restore();
}

function readGuideTheme(element: Element): GuideTheme {
  const style = getComputedStyle(element);
  return {
    widgetBackground: readCssToken(
      style,
      '--model-guide-widget-bg',
      DEFAULT_GUIDE_THEME.widgetBackground,
    ),
    widgetBorder: readCssToken(
      style,
      '--model-guide-widget-border',
      DEFAULT_GUIDE_THEME.widgetBorder,
    ),
    ruler: readCssToken(style, '--model-guide-ruler', DEFAULT_GUIDE_THEME.ruler),
    rulerText: readCssToken(style, '--model-guide-ruler-text', DEFAULT_GUIDE_THEME.rulerText),
    tick: readCssToken(style, '--model-guide-tick', DEFAULT_GUIDE_THEME.tick),
    axisX: readCssToken(style, '--model-axis-x', DEFAULT_GUIDE_THEME.axisX),
    axisY: readCssToken(style, '--model-axis-y', DEFAULT_GUIDE_THEME.axisY),
    axisZ: readCssToken(style, '--model-axis-z', DEFAULT_GUIDE_THEME.axisZ),
  };
}

function readCssToken(style: CSSStyleDeclaration, name: string, fallback: string): string {
  const value = style.getPropertyValue(name).trim();
  return value.length > 0 ? value : fallback;
}

function createCameraFrame(
  cameraPosition: Vec3,
  cameraTarget: Vec3,
  width: number,
  height: number,
): CameraFrame {
  const forward = normalize(sub(cameraTarget, cameraPosition), [0, 0, -1]);
  const right = normalize(cross(forward, WORLD_UP), [1, 0, 0]);
  const up = normalize(cross(right, forward), WORLD_UP);
  return {
    position: cameraPosition,
    forward,
    right,
    up,
    aspect: Math.max(1, width) / Math.max(1, height),
    fovRad: (EDITOR_CAMERA_FOV_DEG * Math.PI) / 180,
    width,
    height,
  };
}

function projectDirection(axis: Vec3, frame: CameraFrame, length: number): Vec2 {
  const x = dot(axis, frame.right) * length;
  const y = -dot(axis, frame.up) * length;
  return [x, y];
}

function niceStep(value: number): number {
  const exponent = Math.floor(Math.log10(Math.max(0.001, value)));
  const base = 10 ** exponent;
  const normalized = value / base;
  if (normalized <= 1) return base;
  if (normalized <= 2) return 2 * base;
  if (normalized <= 5) return 5 * base;
  return 10 * base;
}

function formatGridStep(value: number): string {
  if (value >= 1000) return `${trimNumber(value / 1000)}k`;
  if (value >= 1) return trimNumber(value);
  if (value >= 0.01) return trimNumber(value);
  return value.toExponential(1);
}

function trimNumber(value: number): string {
  return value.toFixed(3).replace(/\.?0+$/, '');
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function normalize(value: Vec3, fallback: Vec3): Vec3 {
  const length = Math.hypot(value[0], value[1], value[2]);
  if (length < 0.000001) return fallback;
  return [value[0] / length, value[1] / length, value[2] / length];
}
