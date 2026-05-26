import { Suspense, useMemo, useState, type ReactNode } from 'react';
import type { CanvasAutoArrangeStrategyId, CanvasSubsystemId } from '@neko/shared';
import {
  ChevronDownIcon,
  LayersIcon,
  RedoIcon,
  SettingsIcon,
  UndoIcon,
  UploadIcon,
} from '@neko/ui/icons';
import { useHistoryStore } from '../../stores/historyStore';
import { t } from '../../i18n';
import type { PlaybackControllerDefinition } from '../../subsystems';

export type CanvasInteractionTool = 'select' | 'pan';

export interface AutoArrangeChoice {
  id: CanvasAutoArrangeStrategyId;
  label: string;
  subsystemId?: CanvasSubsystemId;
}

export interface CanvasTopToolbarProps {
  interactionTool: CanvasInteractionTool;
  onInteractionToolChange: (tool: CanvasInteractionTool) => void;
  onUndo: () => void;
  onRedo: () => void;
  isNodeLibraryVisible?: boolean;
  onToggleNodeLibrary?: () => void;
  onImportFile?: () => void;
  autoArrangeChoices: readonly AutoArrangeChoice[];
  onAutoArrange?: (strategyId: CanvasAutoArrangeStrategyId) => void;
  playbackControllers?: readonly PlaybackControllerDefinition[];
  activeSubsystemIds?: readonly CanvasSubsystemId[];
  onOpenCanvasSettings?: () => void;
}

export function CanvasTopToolbar({
  interactionTool,
  onInteractionToolChange,
  onUndo,
  onRedo,
  isNodeLibraryVisible = true,
  onToggleNodeLibrary,
  onImportFile,
  autoArrangeChoices,
  onAutoArrange,
  playbackControllers = [],
  activeSubsystemIds = [],
  onOpenCanvasSettings,
}: CanvasTopToolbarProps) {
  const canUndo = useHistoryStore((state) => state.canUndo());
  const canRedo = useHistoryStore((state) => state.canRedo());
  const [selectedPlaybackId, setSelectedPlaybackId] = useState<string | null>(null);

  const activePlayback = useMemo(
    () =>
      playbackControllers.find((controller) => controller.id === selectedPlaybackId) ??
      playbackControllers[0],
    [playbackControllers, selectedPlaybackId],
  );

  const PlaybackComponent = activePlayback?.component;
  const shouldRenderRightControls = Boolean(PlaybackComponent || onOpenCanvasSettings);

  return (
    <div
      className="flex h-11 flex-shrink-0 items-center gap-2 px-3"
      style={{
        backgroundColor: 'var(--toolbar-bg)',
        borderBottom: '1px solid var(--toolbar-border)',
        color: 'var(--toolbar-fg)',
      }}
    >
      <div className="flex items-center gap-1">
        <ToolButton
          label={t('toolbar.selectTool')}
          active={interactionTool === 'select'}
          pressed={interactionTool === 'select'}
          onClick={() => onInteractionToolChange('select')}
        >
          <CursorIcon />
        </ToolButton>
        <ToolButton
          label={t('toolbar.handTool')}
          active={interactionTool === 'pan'}
          pressed={interactionTool === 'pan'}
          onClick={() => onInteractionToolChange('pan')}
        >
          <HandIcon />
        </ToolButton>
      </div>

      <ToolbarDivider />

      {onToggleNodeLibrary && (
        <>
          <ToolButton
            label={t('toolbar.toggleNodeLibrary')}
            active={isNodeLibraryVisible}
            pressed={isNodeLibraryVisible}
            onClick={onToggleNodeLibrary}
          >
            <LayersIcon size={16} />
          </ToolButton>

          <ToolbarDivider />
        </>
      )}

      <ToolButton label={t('toolbar.undo')} disabled={!canUndo} onClick={onUndo}>
        <UndoIcon size={16} />
      </ToolButton>
      <ToolButton label={t('toolbar.redo')} disabled={!canRedo} onClick={onRedo}>
        <RedoIcon size={16} />
      </ToolButton>

      <ToolbarDivider />

      <label className="relative flex items-center">
        <select
          className="h-8 min-w-[150px] appearance-none rounded px-2 pr-7 text-xs"
          style={{
            backgroundColor: 'var(--control-bg)',
            borderColor: 'var(--control-border)',
            color: 'var(--control-fg)',
          }}
          defaultValue=""
          title={t('toolbar.autoArrange')}
          onChange={(event) => {
            const value = event.target.value as CanvasAutoArrangeStrategyId | '';
            if (value) {
              onAutoArrange?.(value);
              event.currentTarget.value = '';
            }
          }}
        >
          <option value="">{t('toolbar.autoArrange')}</option>
          {autoArrangeChoices.map((choice) => (
            <option key={`${choice.subsystemId ?? 'core'}:${choice.id}`} value={choice.id}>
              {choice.label}
            </option>
          ))}
        </select>
        <ChevronDownIcon
          size={14}
          className="pointer-events-none absolute right-2"
          strokeWidth={2}
        />
      </label>

      {onImportFile && (
        <ToolButton label={t('toolbar.importFile')} onClick={onImportFile}>
          <UploadIcon size={16} />
        </ToolButton>
      )}

      <div className="min-w-0 flex-1" />

      {shouldRenderRightControls && (
        <div
          className="flex min-w-[180px] items-center justify-end gap-2"
          data-canvas-toolbar-section="playback-settings"
        >
          {playbackControllers.length > 1 && (
            <label className="relative flex items-center">
              <select
                className="h-8 min-w-[130px] appearance-none rounded px-2 pr-7 text-xs"
                style={{
                  backgroundColor: 'var(--control-bg)',
                  borderColor: 'var(--control-border)',
                  color: 'var(--control-fg)',
                }}
                value={activePlayback?.id ?? ''}
                title={t('toolbar.playbackMode')}
                onChange={(event) => setSelectedPlaybackId(event.target.value || null)}
              >
                {playbackControllers.map((controller) => (
                  <option key={controller.id} value={controller.id}>
                    {resolvePlaybackControllerTitle(controller)}
                  </option>
                ))}
              </select>
              <ChevronDownIcon size={14} className="pointer-events-none absolute right-2" />
            </label>
          )}

          {PlaybackComponent && (
            <Suspense fallback={<PlaybackFallback />}>
              <PlaybackComponent activeSubsystemIds={activeSubsystemIds} />
            </Suspense>
          )}

          {onOpenCanvasSettings && (
            <ToolButton label={t('toolbar.canvasSettings')} onClick={onOpenCanvasSettings}>
              <SettingsIcon size={16} />
            </ToolButton>
          )}
        </div>
      )}
    </div>
  );
}

function ToolButton({
  label,
  active = false,
  pressed,
  disabled = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  pressed?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      disabled={disabled}
      className="flex h-8 w-8 items-center justify-center rounded disabled:cursor-not-allowed disabled:opacity-45"
      style={{
        backgroundColor: active ? 'var(--control-active)' : 'var(--control-bg)',
        border: '1px solid var(--control-border)',
        color: active ? 'var(--node-selected)' : 'var(--control-fg)',
      }}
      onMouseDown={(event) => event.stopPropagation()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function ToolbarDivider() {
  return <div className="h-6 w-px" style={{ backgroundColor: 'var(--toolbar-border)' }} />;
}

function resolvePlaybackControllerTitle(controller: PlaybackControllerDefinition): string {
  return controller.titleKey ? t(controller.titleKey) : controller.title;
}

function PlaybackFallback() {
  return <div className="h-8 w-24 rounded" style={{ backgroundColor: 'var(--control-bg)' }} />;
}

function CursorIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M5 3l14 9-7 1.25L16 21l-3 1-4-7-4 5V3z" />
    </svg>
  );
}

function HandIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M10 15V6a1.5 1.5 0 0 1 3 0v5a1.5 1.5 0 0 1 3 0v1a1.5 1.5 0 0 1 3 0v5a6 6 0 0 1-6 6h-1a6 6 0 0 1-4.243-1.757l-3.5-3.5a1.5 1.5 0 0 1 2.121-2.121L8 17V6a1.5 1.5 0 0 1 2 0v9z" />
    </svg>
  );
}
