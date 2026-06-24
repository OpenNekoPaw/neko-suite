import { useEffect, useMemo, useState } from 'react';
import {
  createCanvasPlaybackPlan,
  resolveEffectiveCanvasPlaybackRoutes,
  type CanvasPlaybackDiagnostic,
  type CanvasPlaybackPlan,
  type CanvasPlaybackRouteCandidate,
  type CanvasPlaybackUnit,
  type CanvasPreviewRole,
  type ResourceRef,
} from '@neko/shared';
import { isResourceRef } from '@neko/shared';
import { useResizable } from '@neko/ui/hooks';
import { CloseIcon, LayersIcon, PlayIcon, RightPanelIcon } from '@neko/ui/icons';
import { getKeyboardBoundaryMetadata } from '@neko/ui/keyboard';
import { ResizeHandle } from '@neko/ui/primitives';
import { t } from '../../i18n';
import { useCanvasStore } from '../../stores/canvasStore';
import { usePlaybackStore, type PlaybackWorkspacePane } from '../../stores/playbackStore';
import { PreviewSurface } from '../../preview/PreviewRendererRegistry';
import type { PreviewSourceDescriptor } from '../../preview/types';
import { CanvasPlaybackController } from './CanvasPlaybackController';
import { getGlobalVSCodeApi } from '../../utils/vscode';

const PLAYBACK_STAGE_WIDTH_BOUNDS = { min: 280, max: 760 } as const;
const PLAYBACK_ROUTE_HEIGHT_BOUNDS = { min: 112, max: 320 } as const;
const HOST_PLAYBACK_PLAN_TIMEOUT_MS = 5_000;
const DEFAULT_ROUTE_UNIT_DURATION_MS = 1200;
const MAX_VISIBLE_ROUTE_TABS = 6;

export interface PlaybackWorkspaceProps {
  readonly canvasPane: React.ReactNode;
  readonly className?: string;
}

export function PlaybackWorkspace({ canvasPane, className }: PlaybackWorkspaceProps) {
  const canvasData = useCanvasStore((state) => state.canvasData);
  const selectedNodeId = useCanvasStore((state) => state.selection.nodeIds[0]);
  const selectNode = useCanvasStore((state) => state.selectNode);
  const setActivePlayingNode = useCanvasStore((state) => state.setActivePlayingNode);
  const session = usePlaybackStore((state) => state.playbackSession);
  const setPaneVisible = usePlaybackStore((state) => state.setPlaybackPaneVisible);
  const hideWorkspace = usePlaybackStore((state) => state.hidePlaybackWorkspace);
  const setRoute = usePlaybackStore((state) => state.setPlaybackSessionRoute);
  const setCurrentUnit = usePlaybackStore((state) => state.setPlaybackSessionCurrentUnit);
  const setFocusOwner = usePlaybackStore((state) => state.setPlaybackWorkspaceFocusOwner);
  const setPlaybackState = usePlaybackStore((state) => state.setPlaybackWorkspacePlaybackState);
  const setLayout = usePlaybackStore((state) => state.setPlaybackWorkspaceLayout);
  const markStale = usePlaybackStore((state) => state.markPlaybackWorkspaceStale);
  const savePlayback = usePlaybackStore((state) => state.savePlayback);

  const localPlan = useMemo(
    () =>
      canvasData
        ? createCanvasPlaybackPlan({ canvas: canvasData, selectedNodeId, adapterId: 'auto' })
        : null,
    [canvasData, selectedNodeId],
  );
  const [hostPlanState, setHostPlanState] = useState<{
    readonly plan: CanvasPlaybackPlan | null;
    readonly stale: boolean;
    readonly error?: string;
  }>({ plan: null, stale: false });
  const plan = hostPlanState.plan ?? localPlan;
  const routeResolution = useMemo(
    () => (plan ? resolveEffectiveCanvasPlaybackRoutes(plan) : null),
    [plan],
  );
  const unitById = useMemo(
    () => new Map((plan?.units ?? []).map((unit) => [unit.id, unit])),
    [plan],
  );
  const selectedRoute =
    routeResolution?.routes.find((route) => route.id === session.routeId) ??
    routeResolution?.routes.find((route) =>
      session.currentUnitId ? route.unitIds.includes(session.currentUnitId) : false,
    ) ??
    routeResolution?.routes[0];
  const currentUnit =
    (session.currentUnitId ? unitById.get(session.currentUnitId) : undefined) ??
    (selectedRoute?.unitIds[0] ? unitById.get(selectedRoute.unitIds[0]) : undefined);
  const routeUnitIds = selectedRoute?.unitIds ?? [];
  const stageResize = useResizable<HTMLDivElement>({
    edge: 'right',
    mode: 'pixel',
    size: session.layout.stageWidthPx,
    minSize: PLAYBACK_STAGE_WIDTH_BOUNDS.min,
    maxSize: PLAYBACK_STAGE_WIDTH_BOUNDS.max,
    disabled: !session.visible || !session.panes.canvas || !session.panes.stage,
    onSizeChange: (stageWidthPx) => setLayout({ stageWidthPx }),
  });
  const routeResize = useResizable<HTMLDivElement>({
    edge: 'bottom',
    mode: 'pixel',
    size: session.layout.routeHeightPx,
    minSize: PLAYBACK_ROUTE_HEIGHT_BOUNDS.min,
    maxSize: PLAYBACK_ROUTE_HEIGHT_BOUNDS.max,
    disabled: !session.visible || !session.panes.route,
    onSizeChange: (routeHeightPx) => setLayout({ routeHeightPx }),
  });

  useEffect(() => {
    if (!session.visible || !canvasData) {
      return;
    }
    const vscode = getGlobalVSCodeApi();
    if (!vscode) {
      setHostPlanState({ plan: null, stale: false });
      return;
    }

    let cancelled = false;
    const requestId = `playback-plan-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const settleHostPlan = (nextState: {
      readonly plan: CanvasPlaybackPlan | null;
      readonly stale: boolean;
      readonly error?: string;
    }) => {
      window.removeEventListener('message', handleMessage);
      window.clearTimeout(timeoutId);
      if (cancelled) return;
      setHostPlanState(nextState);
      markStale(nextState.stale);
    };
    const handleMessage = (event: MessageEvent) => {
      const message = event.data as {
        type?: string;
        requestId?: string;
        plan?: CanvasPlaybackPlan;
        stale?: boolean;
        error?: string;
      };
      if (message.type !== 'playback:previewPlanResult' || message.requestId !== requestId) {
        return;
      }
      settleHostPlan({
        plan: message.plan ?? null,
        stale: message.stale === true,
        ...(typeof message.error === 'string' ? { error: message.error } : {}),
      });
    };
    const timeoutId = window.setTimeout(() => {
      settleHostPlan({
        plan: null,
        stale: true,
        error: t('playback.stage.hostPlanTimeout'),
      });
    }, HOST_PLAYBACK_PLAN_TIMEOUT_MS);

    window.addEventListener('message', handleMessage);
    vscode.postMessage({
      type: 'playback:getPreviewPlan',
      requestId,
    });

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      window.removeEventListener('message', handleMessage);
    };
  }, [canvasData, markStale, session.visible]);

  useEffect(() => {
    if (usePlaybackStore.getState().playbackSession.stale) {
      markStale(false);
    }
    setHostPlanState({ plan: null, stale: false });
  }, [canvasData, markStale]);

  useEffect(() => {
    if (!selectedRoute) return;
    if (session.routeId !== selectedRoute.id) {
      const currentUnitInRoute =
        session.currentUnitId !== undefined &&
        selectedRoute.unitIds.includes(session.currentUnitId);
      setRoute(
        selectedRoute.id,
        currentUnitInRoute ? session.currentUnitId : selectedRoute.unitIds[0],
        currentUnitInRoute ? session.playheadMs : 0,
      );
      return;
    }
    if (!session.currentUnitId && selectedRoute.unitIds[0]) {
      setCurrentUnit(selectedRoute.unitIds[0], 0);
    }
  }, [selectedRoute, session.currentUnitId, session.routeId, setCurrentUnit, setRoute]);

  useEffect(() => {
    if (!session.visible && session.playbackState === 'playing') {
      setPlaybackState('paused');
    }
  }, [session.playbackState, session.visible, setPlaybackState]);

  useEffect(() => {
    if (!session.visible) return;
    const handleWindowBlur = () => {
      if (usePlaybackStore.getState().playbackSession.playbackState === 'playing') {
        usePlaybackStore.getState().setPlaybackWorkspacePlaybackState('paused');
      }
    };
    window.addEventListener('blur', handleWindowBlur);
    return () => window.removeEventListener('blur', handleWindowBlur);
  }, [session.visible]);

  const workspaceClasses = ['canvas-playback-workspace', className].filter(Boolean).join(' ');
  const canvasVisible = !session.visible || session.panes.canvas;
  const stageVisible = session.visible && session.panes.stage;
  const routeVisible = session.visible && session.panes.route;
  const stageResizeLabel = t('playback.workspace.resizeStage');
  const routeResizeLabel = t('playback.workspace.resizeRoute');
  const stageResizeHandleProps = {
    ...stageResize.handleProps,
    'aria-label': stageResizeLabel,
    title: stageResizeLabel,
  };
  const routeResizeHandleProps = {
    ...routeResize.handleProps,
    'aria-label': routeResizeLabel,
    title: routeResizeLabel,
  };

  const selectPlaybackUnit = (unitId: string | undefined, playheadMs = 0) => {
    if (!unitId) return;
    const unit = unitById.get(unitId);
    if (
      selectedRoute &&
      selectedRoute.unitIds.includes(unitId) &&
      session.routeId !== selectedRoute.id
    ) {
      setRoute(selectedRoute.id, unitId, playheadMs);
    } else {
      setCurrentUnit(unitId, playheadMs);
    }
    if (!unit) return;
    setActivePlayingNode(unit.sourceNodeId);
    selectNode(unit.sourceNodeId);
    if (unit.assetPath) {
      savePlayback(unit.assetPath, {
        currentTime: playheadMs / 1000,
        duration: resolveRouteUnitDurationMs(unit) / 1000,
        wasPlaying: false,
      });
    }
  };

  return (
    <section
      className={workspaceClasses}
      data-testid="canvas-playback-workspace"
      data-playback-visible={session.visible ? 'true' : 'false'}
      data-playback-focus-owner={session.focusOwner}
    >
      {session.visible ? (
        <PlaybackWorkspaceHeader
          canvasVisible={canvasVisible}
          routeVisible={routeVisible}
          stageVisible={stageVisible}
          onTogglePane={(pane) => setPaneVisible(pane, !session.panes[pane])}
          onHideWorkspace={hideWorkspace}
        />
      ) : null}
      <div
        className="canvas-playback-workspace-main"
        data-stage-visible={stageVisible ? 'true' : 'false'}
        data-canvas-visible={canvasVisible ? 'true' : 'false'}
      >
        {canvasVisible ? (
          <div
            className="canvas-playback-canvas-pane"
            data-testid="canvas-playback-canvas-pane"
            {...getKeyboardBoundaryMetadata({
              scope: 'editor',
              ownerId: 'canvas-editor-pane',
              priority: 0,
            })}
            onFocus={() => setFocusOwner('canvas')}
          >
            {canvasPane}
          </div>
        ) : null}

        {stageVisible ? (
          <div
            ref={stageResize.containerRef}
            className="canvas-playback-stage-pane"
            data-testid="canvas-playback-stage-pane"
            data-resizing={stageResize.isResizing ? 'true' : 'false'}
            style={
              canvasVisible
                ? {
                    flexBasis: stageResize.size,
                    width: stageResize.size,
                  }
                : undefined
            }
            {...getKeyboardBoundaryMetadata({
              scope: 'media-preview',
              ownerId: 'canvas-playback-stage',
              priority: 30,
              ownedKeys: ['Enter', 'Escape', 'Space', 'ArrowLeft', 'ArrowRight', 'Tab'],
            })}
            onFocus={() => setFocusOwner('stage')}
          >
            {canvasVisible ? (
              <ResizeHandle
                handleProps={stageResizeHandleProps}
                className="canvas-playback-stage-resize-handle"
              />
            ) : null}
            <PlaybackStage
              plan={plan}
              unit={currentUnit}
              playheadMs={session.playheadMs}
              diagnostics={routeResolution?.diagnostics ?? []}
              previewError={hostPlanState.error}
            />
            <CanvasPlaybackController
              plan={plan}
              routeUnitIds={routeUnitIds}
              activeUnitId={currentUnit?.id ?? session.currentUnitId ?? null}
              isPlaying={session.playbackState === 'playing'}
              onActiveUnitChange={(unitId) => {
                selectPlaybackUnit(unitId, 0);
              }}
              onPlayingChange={(playing) => setPlaybackState(playing ? 'playing' : 'paused')}
            />
          </div>
        ) : null}
      </div>

      {routeVisible ? (
        <div
          ref={routeResize.containerRef}
          className="canvas-playback-route-pane"
          data-testid="canvas-playback-route-pane"
          data-resizing={routeResize.isResizing ? 'true' : 'false'}
          style={{ flexBasis: routeResize.size, height: routeResize.size }}
        >
          <ResizeHandle
            handleProps={routeResizeHandleProps}
            className="canvas-playback-route-resize-handle"
          />
          <PlaybackRouteStrip
            routes={routeResolution?.routes ?? []}
            diagnostics={routeResolution?.diagnostics ?? []}
            unitById={unitById}
            selectedRouteId={selectedRoute?.id}
            currentUnitId={currentUnit?.id ?? session.currentUnitId}
            currentPlayheadMs={session.playheadMs}
            onSelectRoute={(route) => {
              setRoute(route.id, route.unitIds[0]);
              selectPlaybackUnit(route.unitIds[0], 0);
            }}
            onSelectUnit={selectPlaybackUnit}
            onFocus={() => setFocusOwner('route')}
          />
        </div>
      ) : null}
    </section>
  );
}

function PlaybackWorkspaceHeader({
  canvasVisible,
  routeVisible,
  stageVisible,
  onTogglePane,
  onHideWorkspace,
}: {
  readonly canvasVisible: boolean;
  readonly routeVisible: boolean;
  readonly stageVisible: boolean;
  readonly onTogglePane: (pane: PlaybackWorkspacePane) => void;
  readonly onHideWorkspace: () => void;
}) {
  return (
    <div className="canvas-playback-workspace-header">
      <div className="min-w-0">
        <div className="canvas-playback-workspace-title">{t('playback.workspace.title')}</div>
        <div className="canvas-playback-workspace-subtitle">{t('playback.workspace.subtitle')}</div>
      </div>
      <div className="canvas-playback-workspace-actions">
        <PlaybackIconButton
          title={
            canvasVisible ? t('playback.workspace.hideCanvas') : t('playback.workspace.showCanvas')
          }
          active={canvasVisible}
          onClick={() => onTogglePane('canvas')}
        >
          <RightPanelIcon size={15} />
        </PlaybackIconButton>
        <PlaybackIconButton
          title={
            stageVisible ? t('playback.workspace.hideStage') : t('playback.workspace.showStage')
          }
          active={stageVisible}
          onClick={() => onTogglePane('stage')}
        >
          <PlayIcon size={15} />
        </PlaybackIconButton>
        <PlaybackIconButton
          title={
            routeVisible ? t('playback.workspace.hideRoute') : t('playback.workspace.showRoute')
          }
          active={routeVisible}
          onClick={() => onTogglePane('route')}
        >
          <LayersIcon size={15} />
        </PlaybackIconButton>
        <PlaybackIconButton title={t('playback.workspace.close')} onClick={onHideWorkspace}>
          <CloseIcon size={15} />
        </PlaybackIconButton>
      </div>
    </div>
  );
}

function PlaybackStage({
  plan,
  unit,
  playheadMs,
  diagnostics,
  previewError,
}: {
  readonly plan: CanvasPlaybackPlan | null;
  readonly unit: CanvasPlaybackUnit | undefined;
  readonly playheadMs: number;
  readonly diagnostics: readonly CanvasPlaybackDiagnostic[];
  readonly previewError?: string;
}) {
  if (!plan || !unit) {
    return (
      <div className="canvas-playback-stage-empty" data-testid="canvas-playback-stage-empty">
        <PlayIcon size={28} />
        <span>{t('playback.stage.noUnit')}</span>
      </div>
    );
  }

  const source = createPreviewSourceForUnit(unit);
  return (
    <div
      className="canvas-playback-stage"
      data-testid="canvas-playback-stage"
      data-unit-id={unit.id}
    >
      <div className="canvas-playback-stage-preview">
        {source ? (
          <PreviewSurface source={source} surfaceKind="overlay" />
        ) : (
          <PlaybackUnitSummary unit={unit} />
        )}
      </div>
      <div className="canvas-playback-stage-details">
        <div className="canvas-playback-stage-kicker">{formatUnitKind(unit)}</div>
        <div className="canvas-playback-stage-title">{unit.label ?? unit.id}</div>
        <div className="canvas-playback-stage-meta">
          {t('playback.stage.position', {
            position: formatDurationMs(playheadMs),
            duration: formatDurationMs(resolveRouteUnitDurationMs(unit)),
          })}
        </div>
        {previewError ? (
          <div className="canvas-playback-stage-diagnostics">{previewError}</div>
        ) : diagnostics.length > 0 ? (
          <div className="canvas-playback-stage-diagnostics">
            {diagnostics
              .slice(0, 2)
              .map((diagnostic) => diagnostic.message)
              .join(' · ')}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PlaybackRouteStrip({
  routes,
  diagnostics,
  unitById,
  selectedRouteId,
  currentUnitId,
  currentPlayheadMs,
  onSelectRoute,
  onSelectUnit,
  onFocus,
}: {
  readonly routes: readonly CanvasPlaybackRouteCandidate[];
  readonly diagnostics: readonly CanvasPlaybackDiagnostic[];
  readonly unitById: ReadonlyMap<string, CanvasPlaybackUnit>;
  readonly selectedRouteId: string | undefined;
  readonly currentUnitId: string | undefined;
  readonly currentPlayheadMs: number;
  readonly onSelectRoute: (route: CanvasPlaybackRouteCandidate) => void;
  readonly onSelectUnit: (unitId: string, playheadMs?: number) => void;
  readonly onFocus: () => void;
}) {
  const selectedRoute = routes.find((route) => route.id === selectedRouteId) ?? routes[0];
  const routeUnits = (selectedRoute?.unitIds ?? [])
    .map((unitId) => unitById.get(unitId))
    .filter((unit): unit is CanvasPlaybackUnit => Boolean(unit));
  const segments = buildRouteTimeSegments(routeUnits);
  const currentSegment = segments.find((segment) => segment.unit.id === currentUnitId);
  const totalDurationMs = segments.at(-1)?.endMs ?? 0;
  const absolutePlayheadMs = currentSegment
    ? currentSegment.startMs + clampNumber(currentPlayheadMs, 0, currentSegment.durationMs)
    : 0;
  const activeProgress =
    totalDurationMs > 0 ? clampNumber((absolutePlayheadMs / totalDurationMs) * 100, 0, 100) : 0;
  const visibleRoutes = routes.slice(0, MAX_VISIBLE_ROUTE_TABS);
  const hiddenRouteCount = Math.max(0, routes.length - visibleRoutes.length);

  function seekRoute(event: React.PointerEvent<HTMLDivElement>) {
    if (segments.length === 0 || totalDurationMs <= 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = rect.width > 0 ? clampNumber((event.clientX - rect.left) / rect.width, 0, 1) : 0;
    const targetMs = ratio * totalDurationMs;
    const segment =
      segments.find((candidate) => targetMs >= candidate.startMs && targetMs < candidate.endMs) ??
      segments[segments.length - 1];
    if (!segment) return;
    onSelectUnit(segment.unit.id, clampNumber(targetMs - segment.startMs, 0, segment.durationMs));
  }

  return (
    <div
      className="canvas-playback-route-strip"
      data-testid="canvas-playback-route-strip"
      {...getKeyboardBoundaryMetadata({
        scope: 'media-preview',
        ownerId: 'canvas-playback-route-strip',
        priority: 25,
        ownedKeys: ['Enter', 'Escape', 'Space', 'ArrowLeft', 'ArrowRight', 'Tab'],
      })}
      onFocus={onFocus}
    >
      <div className="canvas-playback-route-strip-header">
        <div className="canvas-playback-route-strip-title">{t('playback.route.title')}</div>
        <div className="canvas-playback-route-tabs">
          {visibleRoutes.map((route) => (
            <button
              key={route.id}
              type="button"
              className="canvas-playback-route-tab"
              data-active={route.id === selectedRoute?.id ? 'true' : 'false'}
              title={`${route.title} · ${route.unitIds.length}`}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={() => onSelectRoute(route)}
            >
              {route.title}
            </button>
          ))}
          {hiddenRouteCount > 0 ? (
            <span
              className="canvas-playback-route-tab-overflow"
              title={t('playback.route.moreRoutes', { count: hiddenRouteCount })}
            >
              {t('playback.route.moreRoutesShort', { count: hiddenRouteCount })}
            </span>
          ) : null}
        </div>
      </div>

      <div
        className="canvas-playback-route-time-ruler"
        data-testid="canvas-playback-route-time-ruler"
        role="slider"
        aria-label={t('playback.route.seek')}
        aria-valuemin={0}
        aria-valuemax={Math.round(totalDurationMs)}
        aria-valuenow={Math.round(absolutePlayheadMs)}
        tabIndex={0}
        title={t('playback.route.seek')}
        onPointerDown={(event) => {
          capturePointerSafely(event.currentTarget, event.pointerId);
          seekRoute(event);
        }}
        onPointerMove={(event) => {
          if (event.buttons !== 1) return;
          seekRoute(event);
        }}
        onKeyDown={(event) => {
          if (segments.length === 0) return;
          const stepMs = event.shiftKey ? 1000 : 250;
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault();
            const direction = event.key === 'ArrowRight' ? 1 : -1;
            const targetMs = clampNumber(
              absolutePlayheadMs + direction * stepMs,
              0,
              totalDurationMs,
            );
            const segment =
              segments.find(
                (candidate) => targetMs >= candidate.startMs && targetMs < candidate.endMs,
              ) ?? segments[segments.length - 1];
            if (segment) {
              onSelectUnit(
                segment.unit.id,
                clampNumber(targetMs - segment.startMs, 0, segment.durationMs),
              );
            }
          }
        }}
      >
        <div className="canvas-playback-route-time-track">
          {segments.map((segment, index) => {
            const active = segment.unit.id === currentUnitId;
            return (
              <button
                key={`${segment.unit.id}:${index}:time`}
                type="button"
                className="canvas-playback-route-time-segment"
                data-active={active ? 'true' : 'false'}
                style={{
                  flexGrow: segment.durationMs,
                }}
                title={segment.unit.label ?? segment.unit.id}
                onMouseDown={(event) => event.stopPropagation()}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectUnit(segment.unit.id, 0);
                }}
              >
                <span className="canvas-playback-route-time-segment-label">
                  {segment.unit.label ?? segment.unit.id}
                </span>
                <span className="canvas-playback-route-time-segment-duration">
                  {formatDurationMs(segment.durationMs)}
                </span>
              </button>
            );
          })}
        </div>
        <div
          className="canvas-playback-route-time-playhead"
          style={{ left: `${activeProgress}%` }}
        />
      </div>

      <div className="canvas-playback-route-time-meta">
        <span>{formatDurationMs(absolutePlayheadMs)}</span>
        <span>{formatDurationMs(totalDurationMs)}</span>
      </div>

      <div className="canvas-playback-route-units" role="list">
        {segments.map((segment, index) => {
          const active = segment.unit.id === currentUnitId;
          return (
            <button
              key={`${segment.unit.id}:${index}`}
              type="button"
              className="canvas-playback-route-unit"
              data-active={active ? 'true' : 'false'}
              role="listitem"
              title={segment.unit.label ?? segment.unit.id}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={() => onSelectUnit(segment.unit.id, 0)}
            >
              <span className="canvas-playback-route-unit-index">{index + 1}</span>
              <span className="canvas-playback-route-unit-label">
                {segment.unit.label ?? segment.unit.id}
              </span>
              <span className="canvas-playback-route-unit-kind">
                {formatUnitKind(segment.unit)}
              </span>
            </button>
          );
        })}
      </div>

      {diagnostics.length > 0 ? (
        <div className="canvas-playback-route-diagnostics">
          {diagnostics
            .slice(0, 3)
            .map((diagnostic) => diagnostic.message)
            .join(' · ')}
        </div>
      ) : null}
    </div>
  );
}

interface RouteTimeSegment {
  readonly unit: CanvasPlaybackUnit;
  readonly startMs: number;
  readonly endMs: number;
  readonly durationMs: number;
}

function buildRouteTimeSegments(units: readonly CanvasPlaybackUnit[]): readonly RouteTimeSegment[] {
  let cursor = 0;
  return units.map((unit) => {
    const durationMs = resolveRouteUnitDurationMs(unit);
    const segment = {
      unit,
      startMs: cursor,
      endMs: cursor + durationMs,
      durationMs,
    };
    cursor += durationMs;
    return segment;
  });
}

function resolveRouteUnitDurationMs(unit: CanvasPlaybackUnit): number {
  return typeof unit.durationMs === 'number' &&
    Number.isFinite(unit.durationMs) &&
    unit.durationMs > 0
    ? unit.durationMs
    : DEFAULT_ROUTE_UNIT_DURATION_MS;
}

function formatDurationMs(durationMs: number): string {
  const totalSeconds = Math.max(0, Math.round(durationMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function capturePointerSafely(target: HTMLElement, pointerId: number): void {
  try {
    target.setPointerCapture(pointerId);
  } catch {
    // jsdom and interrupted Webview pointer sessions can lack capture support.
  }
}

function PlaybackUnitSummary({ unit }: { readonly unit: CanvasPlaybackUnit }) {
  const metadataEntries = Object.entries(unit.metadata ?? {}).slice(0, 4);
  return (
    <div className="canvas-playback-unit-summary">
      <PlayIcon size={28} />
      <div className="canvas-playback-unit-summary-title">{unit.label ?? unit.id}</div>
      {metadataEntries.length > 0 ? (
        <dl className="canvas-playback-unit-summary-list">
          {metadataEntries.map(([key, value]) => (
            <div key={key} className="canvas-playback-unit-summary-row">
              <dt>{key}</dt>
              <dd>{formatSummaryValue(value)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}

function PlaybackIconButton({
  title,
  active,
  onClick,
  children,
}: {
  readonly title: string;
  readonly active?: boolean;
  readonly onClick: () => void;
  readonly children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className="canvas-playback-icon-button"
      data-active={active ? 'true' : 'false'}
      title={title}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function createPreviewSourceForUnit(unit: CanvasPlaybackUnit): PreviewSourceDescriptor | undefined {
  const previewMediaType = readString(unit.metadata?.['previewMediaType']);
  const mediaType =
    previewMediaType ?? readString(unit.metadata?.['mediaType']) ?? inferMediaType(unit.assetPath);
  const role = previewRoleForUnit(unit, mediaType);
  const previewUrl = readString(unit.metadata?.['previewUrl']);
  const path =
    readString(unit.metadata?.['previewPlayableAssetPath']) ??
    readString(unit.metadata?.['previewSourceAssetPath']) ??
    unit.assetPath ??
    readGeneratedMediaPath(unit.metadata);
  const resourceRef =
    readResourceRef(unit.metadata?.['previewSourceResourceRef']) ??
    unit.resourceRef ??
    readResourceRef(unit.metadata?.['resourceRef']);
  const documentResourceRef = unit.metadata?.['previewSourceDocumentResourceRef'];
  if (!path && !resourceRef && !previewUrl) return undefined;
  return {
    id: `playback:${unit.id}`,
    role,
    title: unit.label ?? unit.id,
    ...(previewUrl
      ? {
          variants: [
            {
              id: `playback:${unit.id}:preview`,
              role,
              sourcePath: previewUrl,
              mimeType: mediaType,
            },
          ],
        }
      : {}),
    ...(path || mediaType
      ? {
          asset: {
            kind: 'asset-identity',
            ...(path ? { path } : {}),
            ...(mediaType ? { mediaType } : {}),
          },
        }
      : {}),
    metadata: {
      sourceNodeId: unit.sourceNodeId,
      ...(resourceRef ? { resourceRef } : {}),
      ...(documentResourceRef ? { documentResourceRef } : {}),
    },
  };
}

function previewRoleForUnit(
  unit: CanvasPlaybackUnit,
  mediaType: string | undefined,
): CanvasPreviewRole {
  if (mediaType === 'video') return 'video-proxy';
  if (mediaType === 'audio') return 'audio-waveform';
  if (mediaType === 'image') return 'image';
  if (unit.kind === 'media') return 'video-proxy';
  return 'image';
}

function readGeneratedMediaPath(metadata: CanvasPlaybackUnit['metadata']): string | undefined {
  const generatedVideo = metadata?.['generatedVideoAsset'];
  if (isRecord(generatedVideo)) {
    return readString(generatedVideo['path']) ?? readString(generatedVideo['url']);
  }
  const generatedImage = metadata?.['generatedAsset'];
  if (isRecord(generatedImage)) {
    return readString(generatedImage['path']) ?? readString(generatedImage['url']);
  }
  return readString(metadata?.['generatedImage']);
}

function readResourceRef(value: unknown): ResourceRef | undefined {
  return isResourceRef(value) ? value : undefined;
}

function inferMediaType(path: string | undefined): string | undefined {
  if (!path) return undefined;
  if (/\.(?:mp4|m4v|mov|webm|mkv)(?:[?#]|$)/i.test(path)) return 'video';
  if (/\.(?:mp3|m4a|wav|flac|aac|ogg|opus)(?:[?#]|$)/i.test(path)) return 'audio';
  if (/\.(?:png|jpe?g|webp|gif|avif|bmp|svg)(?:[?#]|$)/i.test(path)) return 'image';
  return undefined;
}

function formatUnitKind(unit: CanvasPlaybackUnit): string {
  switch (unit.kind) {
    case 'scene':
      return t('playback.kind.scene');
    case 'shot':
      return t('playback.kind.shot');
    case 'media':
      return t('playback.kind.media');
    case 'container':
      return t('playback.kind.container');
    case 'narrative':
      return t('playback.kind.narrative');
    case 'node':
    default:
      return t('playback.kind.node');
  }
}

function formatSummaryValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `${value.length}`;
  if (isRecord(value)) return '{...}';
  return '';
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
