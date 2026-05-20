import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import type {
  PanoramaCoverageAngle,
  PanoramaViewMode,
  PanoramaViewState,
  PreviewDimensions,
  PreviewManifest,
  PreviewProjectionType,
  PreviewVariant,
} from '@neko/shared';
import {
  DEFAULT_PANORAMA_COVERAGE_ANGLE,
  DEFAULT_PANORAMA_VIEW_STATE,
  allowedPanoramaViewModesForProjection,
  defaultPanoramaViewModeForProjection,
  normalizeCoverageAngle,
  normalizePanoramaViewModeForProjection,
} from '@neko/shared';
import { ViewStateController } from './viewStateController';
import { WebglPanoramaRenderer, type WebglPanoramaMode } from './webglPanoramaRenderer';
import { postMessage } from '../shared/useVscodeMessage';
import { useExtensionMessage } from '../shared/useVscodeMessage';

interface PanoramicViewerProps {
  manifest: PreviewManifest;
  engineBaseUrl: string | null;
}

const DEFAULT_CYLINDRICAL_VERTICAL_COVERAGE_DEG = 60;
const MIN_CYLINDRICAL_HORIZONTAL_COVERAGE_DEG = 90;
const MAX_CYLINDRICAL_HORIZONTAL_COVERAGE_DEG = 270;

export function PanoramicViewer({ manifest, engineBaseUrl }: PanoramicViewerProps): JSX.Element {
  const initialProjectionType = initialProjectionTypeForManifest(manifest);
  const initialCoverageAngle = coverageAngleForViewerProjection(manifest, initialProjectionType);
  const initialViewState = initialViewStateForProjection(initialProjectionType, manifest);
  const controllerRef = useRef<ViewStateController | null>(null);
  let controller = controllerRef.current;
  if (!controller) {
    controller = new ViewStateController(initialViewState, initialCoverageAngle);
    controllerRef.current = controller;
  }

  const [viewState, setViewState] = useState(controller.state);
  const [projectionType, setProjectionType] =
    useState<PreviewProjectionType>(initialProjectionType);
  const [dragging, setDragging] = useState(false);
  const [webglAvailable, setWebglAvailable] = useState(false);
  const [variantNotice, setVariantNotice] = useState<string | null>(null);
  const [variantError, setVariantError] = useState<string | null>(null);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<WebglPanoramaRenderer | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const sourceUrl = resolveSourceUrl(manifest, engineBaseUrl);
  const coverageAngle = coverageAngleForViewerProjection(manifest, projectionType);
  const modeTabs = viewerModesForProjection(projectionType);

  useExtensionMessage((message) => {
    if (message.type === 'panorama:variantReady') {
      const variant = message.payload.variant;
      setVariantNotice(variantReadyMessage(variant));
      setVariantError(null);
    }
    if (message.type === 'panorama:error') {
      setVariantError(message.payload.message);
      setVariantNotice(null);
    }
  });

  useEffect(() => {
    const nextProjectionType = initialProjectionTypeForManifest(manifest);
    const nextCoverageAngle = coverageAngleForViewerProjection(manifest, nextProjectionType);
    setProjectionType(nextProjectionType);
    controller.setCoverage(nextCoverageAngle);
    setViewState(controller.reset(initialViewStateForProjection(nextProjectionType, manifest)));
  }, [controller, manifest]);

  useEffect(() => {
    setViewState(controller.setCoverage(coverageAngle));
  }, [controller, coverageAngle.horizontalDeg, coverageAngle.verticalDeg]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !sourceUrl) return;
    const renderer = new WebglPanoramaRenderer(canvas);
    if (!renderer.initialize()) {
      setWebglAvailable(false);
      return;
    }

    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      imageRef.current = image;
      renderer.setImage(image);
      const nextViewState = syncViewportAspect(controller, canvas);
      setViewState(nextViewState);
      renderer.render(nextViewState, webglModeForViewState(nextViewState), coverageAngle);
      setWebglAvailable(true);
    };
    image.onerror = () => {
      setWebglAvailable(false);
    };
    image.src = sourceUrl;
    rendererRef.current = renderer;
    return () => {
      renderer.dispose();
      rendererRef.current = null;
      imageRef.current = null;
    };
  }, [controller, sourceUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const viewport = canvas?.parentElement;
    if (!canvas || !viewport) return;

    const updateAspect = () => {
      setViewState(syncViewportAspect(controller, canvas));
    };
    updateAspect();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', updateAspect);
      return () => window.removeEventListener('resize', updateAspect);
    }

    const observer = new ResizeObserver(updateAspect);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [controller, sourceUrl]);

  useEffect(() => {
    if (viewState.mode === 'flat') return;
    rendererRef.current?.render(viewState, webglModeForViewState(viewState), coverageAngle);
  }, [coverageAngle.horizontalDeg, coverageAngle.verticalDeg, viewState]);

  if (manifest.status === 'unsupported' || manifest.error) {
    return (
      <main className="panorama-shell">
        <section className="panorama-error">
          <h1>{manifest.sourceName}</h1>
          <p>{manifest.error?.message ?? 'This panoramic source is not supported yet.'}</p>
        </section>
      </main>
    );
  }

  return (
    <main className="panorama-shell">
      <section className="panorama-stage">
        <div
          className={`panorama-viewport mode-${viewState.mode} ${dragging ? 'is-dragging' : ''}`}
          onPointerDown={(event) => {
            pointerRef.current = { x: event.clientX, y: event.clientY };
            setDragging(true);
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const previous = pointerRef.current;
            if (!previous) return;
            setViewState(
              controller.applyDrag(event.clientX - previous.x, event.clientY - previous.y),
            );
            pointerRef.current = { x: event.clientX, y: event.clientY };
          }}
          onPointerUp={(event) => {
            pointerRef.current = null;
            setDragging(false);
            event.currentTarget.releasePointerCapture(event.pointerId);
          }}
          onPointerCancel={() => {
            pointerRef.current = null;
            setDragging(false);
          }}
          onWheel={(event) => {
            event.preventDefault();
            setViewState(controller.applyWheel(event.deltaY));
          }}
          onKeyDown={(event) => {
            const next = applyKeyboardView(event, controller);
            if (!next) return;
            event.preventDefault();
            setViewState(next);
          }}
          role="application"
          tabIndex={0}
          aria-label={manifest.sourceName}
        >
          <canvas
            ref={canvasRef}
            className={
              webglAvailable && viewState.mode !== 'flat'
                ? 'panorama-canvas'
                : 'panorama-canvas is-hidden'
            }
          />
          {sourceUrl && (!webglAvailable || viewState.mode === 'flat') ? (
            <img
              src={sourceUrl}
              alt={manifest.sourceName}
              draggable={false}
              style={imageStyle(viewState)}
            />
          ) : (
            <div className="panorama-empty">Preview source unavailable</div>
          )}
          {!webglAvailable && sourceUrl ? (
            <div className="fallback-badge">Flat fallback</div>
          ) : null}
        </div>
      </section>

      <aside className="panorama-inspector">
        <div>
          <h1>{manifest.sourceName}</h1>
          <p>
            {projectionType} ·{' '}
            {projectionType === manifest.projection.type
              ? manifest.projection.confidence
              : 'unsaved'}
          </p>
        </div>
        <div className="mode-tabs">
          {modeTabs.map((mode) => (
            <button
              key={mode}
              type="button"
              className={viewState.mode === mode ? 'is-active' : ''}
              onClick={() => {
                const nextProjectionType = projectionTypeForViewMode(mode, projectionType);
                const nextCoverageAngle = coverageAngleForViewerProjection(
                  manifest,
                  nextProjectionType,
                );
                setProjectionType(nextProjectionType);
                controller.setCoverage(nextCoverageAngle);
                setViewState(
                  controller.setMode(
                    normalizePanoramaViewModeForProjection(nextProjectionType, mode),
                  ),
                );
              }}
            >
              {modeLabel(mode)}
            </button>
          ))}
        </div>
        <dl className="metadata-grid">
          <div>
            <dt>Dimensions</dt>
            <dd>{formatDimensions(manifest.media.dimensions)}</dd>
          </div>
          <div>
            <dt>Dynamic Range</dt>
            <dd>{formatDynamicRange(manifest)}</dd>
          </div>
          <div>
            <dt>Size</dt>
            <dd>{formatBytes(manifest.media.fileSizeBytes)}</dd>
          </div>
          {!isDefaultCoverageAngle(coverageAngle) ? (
            <div>
              <dt>Coverage</dt>
              <dd>{formatCoverageAngle(coverageAngle)}</dd>
            </div>
          ) : null}
          <div>
            <dt>View</dt>
            <dd>
              {viewState.yawDeg.toFixed(0)} / {viewState.pitchDeg.toFixed(0)} /{' '}
              {viewState.fovDeg.toFixed(0)}
            </dd>
          </div>
        </dl>
        {variantNotice ? <div className="variant-status">{variantNotice}</div> : null}
        {variantError ? <div className="variant-status is-error">{variantError}</div> : null}
        <label className="control-row">
          <span>Exposure</span>
          <input
            type="range"
            min="-4"
            max="4"
            step="0.1"
            value={viewState.exposure}
            onChange={(event) =>
              setViewState(controller.setExposure(Number(event.currentTarget.value)))
            }
          />
        </label>
        {manifest.projection.requiresConfirmation ? (
          <div className="confirmation-box">
            <span>Heuristic panorama</span>
            <button
              type="button"
              onClick={() =>
                postMessage({
                  type: 'panorama:updateAsset',
                  assetId: manifest.assetId,
                  projectionType,
                  coverageAngle,
                })
              }
            >
              Confirm
            </button>
          </div>
        ) : null}
        <button
          type="button"
          className="reset-button"
          onClick={() => {
            const nextProjectionType = initialProjectionTypeForManifest(manifest);
            const nextCoverageAngle = coverageAngleForViewerProjection(
              manifest,
              nextProjectionType,
            );
            setProjectionType(nextProjectionType);
            controller.setCoverage(nextCoverageAngle);
            setViewState(
              controller.reset(initialViewStateForProjection(nextProjectionType, manifest)),
            );
          }}
        >
          Reset View
        </button>
        <div className="semantic-actions">
          <button
            type="button"
            onClick={() =>
              postMessage({
                type: 'panorama:updateAsset',
                assetId: manifest.assetId,
                projectionType,
                coverageAngle,
                defaultViewState: normalizeViewStateForProjection(projectionType, viewState),
              })
            }
          >
            Save Default
          </button>
          <button
            type="button"
            onClick={() =>
              postMessage({
                type: 'panorama:requestVariant',
                assetId: manifest.assetId,
                request: {
                  role: 'fov-crop',
                  viewState: normalizeViewStateForProjection(projectionType, viewState),
                  projectionType,
                  coverageAngle,
                  width: 512,
                  height: 512,
                  format: 'jpeg',
                },
              })
            }
          >
            FOV Crop
          </button>
          <button
            type="button"
            onClick={() =>
              postMessage({
                type: 'panorama:requestVariant',
                assetId: manifest.assetId,
                request: {
                  role: 'screenshot',
                  viewState: normalizeViewStateForProjection(projectionType, viewState),
                  projectionType,
                  coverageAngle,
                  width: 1920,
                  height: 1080,
                  format: 'jpeg',
                },
              })
            }
          >
            Export
          </button>
          <button
            type="button"
            onClick={() =>
              postMessage({
                type: 'panorama:sendToModel',
                assetId: manifest.assetId,
                viewState,
              })
            }
          >
            Send to Model
          </button>
        </div>
      </aside>
    </main>
  );
}

export function viewerModesForProjection(
  projectionType: PreviewProjectionType,
): readonly PanoramaViewMode[] {
  const allowedModes = allowedPanoramaViewModesForProjection(projectionType);
  if (projectionType === 'cylindrical') {
    return allowedModes;
  }
  return allowedModes.includes('cylindrical') ? allowedModes : [...allowedModes, 'cylindrical'];
}

export function projectionTypeForViewMode(
  mode: PanoramaViewMode,
  fallbackProjectionType: PreviewProjectionType,
): PreviewProjectionType {
  switch (mode) {
    case 'cylindrical':
      return 'cylindrical';
    case 'sphere':
    case 'little-planet':
      return 'equirectangular';
    case 'flat':
      return fallbackProjectionType;
  }
}

export function coverageAngleForViewerProjection(
  manifest: PreviewManifest,
  projectionType: PreviewProjectionType,
): PanoramaCoverageAngle {
  const manifestCoverage = normalizeCoverageAngle(manifest.projection.coverageAngle);
  if (projectionType !== 'cylindrical' || !isDefaultCoverageAngle(manifestCoverage)) {
    return manifestCoverage;
  }
  return estimateCylindricalCoverage(manifest.media.dimensions);
}

function resolveSourceUrl(manifest: PreviewManifest, engineBaseUrl: string | null): string | null {
  const url =
    manifest.sourceUrl ??
    manifest.variants.find((variant) => variant.role === 'proxy' && variant.url)?.url ??
    manifest.variants.find((variant) => variant.role === 'source' && variant.url)?.url ??
    manifest.variants.find((variant) => variant.url)?.url;
  if (!url) return null;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (!engineBaseUrl) return url;
  return `${engineBaseUrl}${url.startsWith('/') ? '' : '/'}${url}`;
}

function imageStyle(viewState: PanoramaViewState): CSSProperties {
  if (viewState.mode === 'flat') {
    return {
      transform: `translate(${viewState.yawDeg * 0.2}px, ${viewState.pitchDeg * 0.2}px) scale(${90 / viewState.fovDeg})`,
      filter: `brightness(${Math.pow(2, viewState.exposure * 0.12)})`,
    };
  }
  if (viewState.mode === 'little-planet') {
    return {
      transform: `rotate(${viewState.yawDeg}deg) scale(${110 / viewState.fovDeg})`,
      borderRadius: '50%',
      aspectRatio: '1 / 1',
      objectFit: 'cover',
      filter: `brightness(${Math.pow(2, viewState.exposure * 0.12)})`,
    };
  }
  if (viewState.mode === 'cylindrical') {
    return {
      transform: `translateX(${viewState.yawDeg * 0.25}px) translateY(${viewState.pitchDeg * 0.25}px) scale(${100 / viewState.fovDeg})`,
      filter: `brightness(${Math.pow(2, viewState.exposure * 0.12)})`,
    };
  }
  return {
    transform: `translateX(${viewState.yawDeg * 0.35}px) translateY(${viewState.pitchDeg * 0.35}px) scale(${100 / viewState.fovDeg})`,
    borderRadius: '50%',
    filter: `brightness(${Math.pow(2, viewState.exposure * 0.12)})`,
  };
}

function modeLabel(mode: PanoramaViewMode): string {
  switch (mode) {
    case 'sphere':
      return 'Sphere';
    case 'flat':
      return 'Flat';
    case 'little-planet':
      return 'Planet';
    case 'cylindrical':
      return 'Cylinder';
  }
}

function formatDimensions(dimensions: PreviewManifest['media']['dimensions']): string {
  if (!dimensions) return 'Unknown';
  return `${dimensions.width} x ${dimensions.height}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDynamicRange(manifest: PreviewManifest): string {
  const proxy = manifest.variants.find((variant) => variant.role === 'proxy' && variant.url);
  if (manifest.media.dynamicRange === 'hdr' && proxy) {
    return `HDR -> ${proxy.mimeType ?? 'proxy'}`;
  }
  return manifest.media.dynamicRange.toUpperCase();
}

function variantReadyMessage(variant: PreviewVariant): string {
  const dimensions = variant.dimensions
    ? `${variant.dimensions.width} x ${variant.dimensions.height}`
    : 'ready';
  return `${variant.role} ${dimensions}`;
}

function initialProjectionTypeForManifest(manifest: PreviewManifest): PreviewProjectionType {
  return manifest.projection.type;
}

function initialViewStateForProjection(
  projectionType: PreviewProjectionType,
  manifest: PreviewManifest,
): PanoramaViewState {
  const mode = normalizePanoramaViewModeForProjection(
    projectionType,
    manifest.defaultViewState?.mode ?? defaultPanoramaViewModeForProjection(projectionType),
  );
  return {
    ...DEFAULT_PANORAMA_VIEW_STATE,
    ...manifest.defaultViewState,
    mode,
  };
}

function normalizeViewStateForProjection(
  projectionType: PreviewProjectionType,
  viewState: PanoramaViewState,
): PanoramaViewState {
  return {
    ...viewState,
    mode: normalizePanoramaViewModeForProjection(projectionType, viewState.mode),
  };
}

function webglModeForViewState(viewState: PanoramaViewState): WebglPanoramaMode {
  switch (viewState.mode) {
    case 'little-planet':
      return 'little-planet';
    case 'cylindrical':
      return 'cylindrical';
    case 'sphere':
    case 'flat':
      return 'sphere';
  }
}

function syncViewportAspect(
  controller: ViewStateController,
  canvas: HTMLCanvasElement,
): PanoramaViewState {
  const rect = canvas.getBoundingClientRect();
  return controller.setViewportAspect(
    rect.width > 0 && rect.height > 0 ? rect.width / rect.height : 1,
  );
}

function estimateCylindricalCoverage(dimensions?: PreviewDimensions): PanoramaCoverageAngle {
  if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) {
    return DEFAULT_PANORAMA_COVERAGE_ANGLE;
  }
  const aspect = dimensions.width / dimensions.height;
  const horizontalDeg = clamp(
    aspect * DEFAULT_CYLINDRICAL_VERTICAL_COVERAGE_DEG,
    MIN_CYLINDRICAL_HORIZONTAL_COVERAGE_DEG,
    MAX_CYLINDRICAL_HORIZONTAL_COVERAGE_DEG,
  );
  return normalizeCoverageAngle({
    horizontalDeg,
    verticalDeg: horizontalDeg / aspect,
  });
}

function isDefaultCoverageAngle(coverageAngle: PanoramaCoverageAngle): boolean {
  return (
    coverageAngle.horizontalDeg === DEFAULT_PANORAMA_COVERAGE_ANGLE.horizontalDeg &&
    coverageAngle.verticalDeg === DEFAULT_PANORAMA_COVERAGE_ANGLE.verticalDeg
  );
}

function formatCoverageAngle(coverageAngle: PanoramaCoverageAngle): string {
  return `${coverageAngle.horizontalDeg.toFixed(0)} deg x ${coverageAngle.verticalDeg.toFixed(0)} deg`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function applyKeyboardView(
  event: KeyboardEvent,
  controller: ViewStateController,
): PanoramaViewState | null {
  switch (event.key) {
    case 'ArrowLeft':
      return controller.applyDrag(18, 0);
    case 'ArrowRight':
      return controller.applyDrag(-18, 0);
    case 'ArrowUp':
      return controller.applyDrag(0, 18);
    case 'ArrowDown':
      return controller.applyDrag(0, -18);
    case '+':
    case '=':
      return controller.applyWheel(-120);
    case '-':
    case '_':
      return controller.applyWheel(120);
    case '0':
    case 'Home':
      return controller.reset();
    default:
      return null;
  }
}
