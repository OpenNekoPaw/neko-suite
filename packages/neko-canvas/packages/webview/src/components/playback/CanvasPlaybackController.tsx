import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PauseIcon, PlayIcon, SkipBackIcon, SkipForwardIcon } from '@neko/ui/icons';
import {
  createCanvasPlaybackPlan,
  resolveEffectiveCanvasPlaybackRoutes,
  type CanvasPlaybackPlan,
  type CanvasPlaybackTransition,
} from '@neko/shared';
import { t } from '../../i18n';
import { useCanvasStore } from '../../stores/canvasStore';

const TIMER_INTERVAL_MS = 1200;

export interface CanvasPlaybackViewState {
  readonly currentUnitId?: string;
  readonly currentIndex: number;
  readonly canStepPrevious: boolean;
  readonly canStepNext: boolean;
  readonly canPlay: boolean;
  readonly branchChoices: readonly CanvasPlaybackTransition[];
}

export interface CanvasPlaybackControllerProps {
  readonly plan?: CanvasPlaybackPlan | null;
}

export function CanvasPlaybackController({
  plan: providedPlan,
}: CanvasPlaybackControllerProps = {}) {
  const canvasData = useCanvasStore((state) => state.canvasData);
  const selectedNodeId = useCanvasStore((state) => state.selection.nodeIds[0]);
  const setActivePlayingNode = useCanvasStore((state) => state.setActivePlayingNode);
  const [activeUnitId, setActiveUnitId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const timerRef = useRef<number | null>(null);

  const plan = useMemo(
    () =>
      providedPlan ??
      (canvasData
        ? createCanvasPlaybackPlan({ canvas: canvasData, selectedNodeId, adapterId: 'auto' })
        : null),
    [canvasData, providedPlan, selectedNodeId],
  );
  const initialRoute = useMemo(() => (plan ? buildInitialPlaybackRoute(plan) : []), [plan]);
  const [routeUnitIds, setRouteUnitIds] = useState<readonly string[]>([]);
  const route = routeUnitIds.length > 0 ? routeUnitIds : initialRoute;
  const state = resolveCanvasPlaybackViewState({ plan, route, activeUnitId, selectedNodeId });

  useEffect(() => () => clearTimer(), []);
  useEffect(() => {
    setActiveUnitId(null);
    setRouteUnitIds([]);
    setIsPlaying(false);
    clearTimer();
  }, [plan?.adapterId, plan?.entryUnitIds.join('|'), selectedNodeId]);

  if (!plan || plan.units.length === 0 || state.canPlay === false) {
    return null;
  }

  function moveToUnit(unitId: string | undefined) {
    if (!unitId || !plan) return;
    const unit = plan.units.find((candidate) => candidate.id === unitId);
    if (!unit) return;
    setActiveUnitId(unit.id);
    setActivePlayingNode(unit.sourceNodeId);
  }

  function handlePrevious() {
    clearTimer();
    setIsPlaying(false);
    if (!state.canStepPrevious) return;
    moveToUnit(route[state.currentIndex - 1]);
  }

  function handlePlayPause() {
    if (!plan) return;
    if (isPlaying) {
      clearTimer();
      setIsPlaying(false);
      return;
    }
    if (!state.canPlay) return;
    const activePlan = plan;
    const startUnitId = state.currentUnitId ?? route[0];
    if (!startUnitId) return;
    const committedRoute = route.length > 0 ? route : [startUnitId];
    setRouteUnitIds(committedRoute);
    moveToUnit(startUnitId);

    if (activePlan.advancePolicy !== 'timer') {
      setIsPlaying(false);
      return;
    }

    setIsPlaying(true);
    scheduleNextStep(activePlan, startUnitId, committedRoute);
  }

  function handleNext() {
    clearTimer();
    setIsPlaying(false);
    if (!state.canStepNext) return;
    const nextStep = resolveNextRouteStep(plan, route, state.currentIndex, state.currentUnitId);
    if (!nextStep) return;
    setRouteUnitIds(nextStep.route);
    moveToUnit(nextStep.unitId);
  }

  function handleChoice(transition: CanvasPlaybackTransition) {
    clearTimer();
    setIsPlaying(false);
    setRouteUnitIds(
      appendTargetToRoute(route, state.currentIndex, state.currentUnitId, transition.targetUnitId),
    );
    moveToUnit(transition.targetUnitId);
  }

  function scheduleNextStep(
    activePlan: CanvasPlaybackPlan,
    currentUnitId: string,
    currentRoute: readonly string[],
  ) {
    clearTimer();
    timerRef.current = window.setTimeout(
      () => {
        timerRef.current = null;
        const nextStep = resolveNextRouteStep(
          activePlan,
          currentRoute,
          currentRoute.indexOf(currentUnitId),
          currentUnitId,
        );
        if (!nextStep) {
          setIsPlaying(false);
          return;
        }
        const unit = activePlan.units.find((candidate) => candidate.id === nextStep.unitId);
        if (!unit) {
          setIsPlaying(false);
          return;
        }
        setRouteUnitIds(nextStep.route);
        setActiveUnitId(unit.id);
        setActivePlayingNode(unit.sourceNodeId);
        scheduleNextStep(activePlan, unit.id, nextStep.route);
      },
      resolveUnitDurationMs(activePlan, currentUnitId),
    );
  }

  function clearTimer() {
    if (timerRef.current === null) return;
    window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }

  return (
    <div
      className="flex max-w-[360px] flex-col gap-1"
      data-testid="canvas-playback-controller"
      data-playback-adapter={plan.adapterId}
      data-playback-mode={plan.behaviorMode}
    >
      <div className="flex items-center gap-1">
        <span
          className="max-w-[130px] truncate px-2 text-[11px]"
          title={`${plan.adapterId} · ${plan.behaviorMode}`}
          style={{ color: 'var(--node-fg-secondary)' }}
        >
          {formatPlaybackLabel(plan)}
        </span>
        <ToolbarIconButton
          title={t('toolbar.playbackPrevious')}
          disabled={!state.canStepPrevious}
          onClick={handlePrevious}
        >
          <SkipBackIcon size={14} />
        </ToolbarIconButton>
        <ToolbarIconButton
          title={isPlaying ? t('toolbar.playbackPause') : t('toolbar.playbackPlay')}
          disabled={!state.canPlay}
          onClick={handlePlayPause}
        >
          {isPlaying ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
        </ToolbarIconButton>
        <ToolbarIconButton
          title={t('toolbar.playbackNext')}
          disabled={!state.canStepNext}
          onClick={handleNext}
        >
          <SkipForwardIcon size={14} />
        </ToolbarIconButton>
        <span className="px-1 text-[11px]" style={{ color: 'var(--node-fg-secondary)' }}>
          {state.currentIndex + 1}/{route.length}
        </span>
      </div>
      {state.branchChoices.length > 1 ? (
        <div className="flex flex-wrap gap-1" data-testid="canvas-playback-branches">
          {state.branchChoices.map((choice) => (
            <button
              key={choice.id}
              type="button"
              className="max-w-[150px] truncate rounded px-2 py-1 text-[11px]"
              style={{
                border: '1px solid var(--control-border)',
                backgroundColor: 'var(--control-bg)',
                color: 'var(--control-fg)',
              }}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={() => handleChoice(choice)}
              title={choice.label ?? t('toolbar.playbackContinue')}
            >
              {choice.label ?? t('toolbar.playbackContinue')}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function resolveCanvasPlaybackViewState({
  plan,
  route,
  activeUnitId,
  selectedNodeId,
}: {
  readonly plan: CanvasPlaybackPlan | null;
  readonly route: readonly string[];
  readonly activeUnitId?: string | null;
  readonly selectedNodeId?: string | null;
}): CanvasPlaybackViewState {
  const selectedUnit = selectedNodeId
    ? plan?.units.find((unit) => unit.sourceNodeId === selectedNodeId)
    : undefined;
  const currentUnitId =
    activeUnitId && route.includes(activeUnitId)
      ? activeUnitId
      : selectedUnit && route.includes(selectedUnit.id)
        ? selectedUnit.id
        : route[0];
  const currentIndex = currentUnitId ? route.indexOf(currentUnitId) : -1;
  const branchChoices = currentUnitId
    ? (plan?.transitions.filter(
        (transition) => transition.sourceUnitId === currentUnitId && transition.enabled !== false,
      ) ?? [])
    : [];
  const nextStep = resolveNextRouteStep(plan, route, currentIndex, currentUnitId);

  return {
    currentUnitId,
    currentIndex,
    canStepPrevious: currentIndex > 0,
    canStepNext: Boolean(nextStep),
    canPlay: route.length > 0,
    branchChoices,
  };
}

export function buildInitialPlaybackRoute(plan: CanvasPlaybackPlan): readonly string[] {
  const route = buildDefaultPlaybackPath(plan);
  if (plan.behaviorMode === 'interactive') {
    return route[0] ? [route[0]] : [];
  }
  return route;
}

export function buildDefaultPlaybackPath(plan: CanvasPlaybackPlan): readonly string[] {
  return resolveEffectiveCanvasPlaybackRoutes(plan).routes[0]?.unitIds ?? [];
}

function resolveNextRouteStep(
  plan: CanvasPlaybackPlan | null,
  route: readonly string[],
  currentIndex: number,
  currentUnitId: string | undefined,
): { readonly unitId: string; readonly route: readonly string[] } | undefined {
  if (!plan || !currentUnitId || currentIndex < 0) return undefined;
  const existingNextUnitId = route[currentIndex + 1];
  if (existingNextUnitId) return { unitId: existingNextUnitId, route };
  const transition = resolveNextTransition(plan, currentUnitId, route);
  if (!transition) return undefined;
  return {
    unitId: transition.targetUnitId,
    route: appendTargetToRoute(route, currentIndex, currentUnitId, transition.targetUnitId),
  };
}

function resolveNextTransition(
  plan: CanvasPlaybackPlan,
  currentUnitId: string,
  route: readonly string[],
): CanvasPlaybackTransition | undefined {
  const transitions = plan.transitions
    .filter(
      (transition) => transition.sourceUnitId === currentUnitId && transition.enabled !== false,
    )
    .filter((transition) => !route.includes(transition.targetUnitId))
    .slice()
    .sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id));
  if (plan.behaviorMode === 'interactive' && transitions.length > 1) {
    return undefined;
  }
  return transitions[0];
}

function appendTargetToRoute(
  route: readonly string[],
  currentIndex: number,
  currentUnitId: string | undefined,
  targetUnitId: string,
): readonly string[] {
  const prefix =
    currentIndex >= 0 ? route.slice(0, currentIndex + 1) : currentUnitId ? [currentUnitId] : [];
  const existingIndex = prefix.indexOf(targetUnitId);
  return existingIndex >= 0 ? prefix.slice(0, existingIndex + 1) : [...prefix, targetUnitId];
}

function resolveUnitDurationMs(plan: CanvasPlaybackPlan, unitId: string): number {
  const durationMs = plan.units.find((unit) => unit.id === unitId)?.durationMs;
  return typeof durationMs === 'number' && Number.isFinite(durationMs) && durationMs >= 0
    ? durationMs
    : TIMER_INTERVAL_MS;
}

function formatPlaybackLabel(plan: CanvasPlaybackPlan): string {
  switch (plan.adapterId) {
    case 'storyboard':
      return t('toolbar.playbackStoryboard');
    case 'narrative':
      return t('toolbar.playbackNarrative');
    case 'media-sequence':
      return t('toolbar.playbackMedia');
    case 'generic':
    default:
      return t('toolbar.playbackGeneric');
  }
}

function ToolbarIconButton({
  title,
  disabled,
  onClick,
  children,
}: {
  readonly title: string;
  readonly disabled?: boolean;
  readonly onClick?: () => void;
  readonly children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      className="flex h-7 w-7 items-center justify-center rounded disabled:opacity-45"
      style={{
        border: '1px solid var(--control-border)',
        backgroundColor: 'var(--control-bg)',
        color: 'var(--control-fg)',
      }}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
