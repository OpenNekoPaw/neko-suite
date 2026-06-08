import type React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PauseIcon, PlayIcon, SkipBackIcon, SkipForwardIcon } from '@neko/ui/icons';
import {
  createCanvasPlaybackPlan,
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
  const path = useMemo(() => (plan ? buildDefaultPlaybackPath(plan) : []), [plan]);
  const state = resolveCanvasPlaybackViewState({ plan, path, activeUnitId, selectedNodeId });

  useEffect(() => () => clearTimer(), []);
  useEffect(() => {
    setActiveUnitId(null);
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
    moveToUnit(path[state.currentIndex - 1]);
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
    const startIndex = state.currentIndex >= 0 ? state.currentIndex : 0;
    moveToUnit(path[startIndex]);
    setIsPlaying(true);
    timerRef.current = window.setInterval(() => {
      setActiveUnitId((current) => {
        const currentIndex = current ? path.indexOf(current) : startIndex;
        const nextUnitId = path[currentIndex + 1];
        if (!nextUnitId) {
          clearTimer();
          setIsPlaying(false);
          return current;
        }
        const unit = activePlan.units.find((candidate) => candidate.id === nextUnitId);
        if (unit) {
          setActivePlayingNode(unit.sourceNodeId);
        }
        return nextUnitId;
      });
    }, TIMER_INTERVAL_MS);
  }

  function handleNext() {
    clearTimer();
    setIsPlaying(false);
    if (!state.canStepNext) return;
    moveToUnit(path[state.currentIndex + 1]);
  }

  function handleChoice(transition: CanvasPlaybackTransition) {
    clearTimer();
    setIsPlaying(false);
    moveToUnit(transition.targetUnitId);
  }

  function clearTimer() {
    if (timerRef.current === null) return;
    window.clearInterval(timerRef.current);
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
          {state.currentIndex + 1}/{path.length}
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

export function resolveCanvasPlaybackViewState({
  plan,
  path,
  activeUnitId,
  selectedNodeId,
}: {
  readonly plan: CanvasPlaybackPlan | null;
  readonly path: readonly string[];
  readonly activeUnitId?: string | null;
  readonly selectedNodeId?: string | null;
}): CanvasPlaybackViewState {
  const selectedUnit = selectedNodeId
    ? plan?.units.find((unit) => unit.sourceNodeId === selectedNodeId)
    : undefined;
  const currentUnitId =
    activeUnitId && path.includes(activeUnitId)
      ? activeUnitId
      : selectedUnit && path.includes(selectedUnit.id)
        ? selectedUnit.id
        : path[0];
  const currentIndex = currentUnitId ? path.indexOf(currentUnitId) : -1;
  const branchChoices = currentUnitId
    ? (plan?.transitions.filter((transition) => transition.sourceUnitId === currentUnitId) ?? [])
    : [];

  return {
    currentUnitId,
    currentIndex,
    canStepPrevious: currentIndex > 0,
    canStepNext: currentIndex >= 0 && currentIndex < path.length - 1,
    canPlay: path.length > 0,
    branchChoices,
  };
}

export function buildDefaultPlaybackPath(plan: CanvasPlaybackPlan): readonly string[] {
  const path: string[] = [];
  const visited = new Set<string>();
  let current = plan.entryUnitIds[0];

  while (current && !visited.has(current) && path.length <= plan.units.length) {
    path.push(current);
    visited.add(current);
    const next = plan.transitions
      .filter((transition) => transition.sourceUnitId === current && transition.enabled !== false)
      .slice()
      .sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id))[0];
    current = next?.targetUnitId;
  }

  return path;
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
