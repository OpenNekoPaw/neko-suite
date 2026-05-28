import type React from 'react';
import { ToolbarButton, ToolbarSeparator, ToolbarSpacer, VerticalToolbar } from '../primitives';
import { cn } from '../utils';

export type CreativeWorkbenchMainKind =
  | 'preview-timeline'
  | 'viewport-timeline'
  | 'waveform-timeline'
  | 'canvas'
  | 'drawing-canvas';

export type CreativeLeftRailActionKind = 'common-action' | 'visibility-toggle';

export type CreativeLeftRailVisibilityTarget = 'right-panel' | 'main-panel' | 'hud';

export type MainPanelControlPlacement =
  | 'overlay-top-left'
  | 'overlay-top-right'
  | 'overlay-bottom-left'
  | 'timeline-header'
  | 'transport'
  | 'contextual';

export interface CreativeWorkbenchShellProps {
  readonly leftRail: React.ReactNode;
  readonly main: React.ReactNode;
  readonly mainKind: CreativeWorkbenchMainKind;
  readonly rightPanel?: React.ReactNode;
  readonly bottomPanel?: React.ReactNode;
  readonly className?: string;
  readonly bodyClassName?: string;
  readonly leftRailClassName?: string;
  readonly mainClassName?: string;
  readonly rightPanelClassName?: string;
  readonly bottomPanelClassName?: string;
}

interface CreativeLeftRailBaseAction {
  readonly id: string;
  readonly label: string;
  readonly icon: React.ReactNode;
  readonly active?: boolean;
  readonly expanded?: boolean;
  readonly disabled?: boolean;
  readonly className?: string;
  readonly onClick: () => void;
}

export interface CreativeLeftRailCommonAction extends CreativeLeftRailBaseAction {
  readonly kind: 'common-action';
  readonly controls?: string;
  readonly visibilityTarget?: never;
}

export interface CreativeLeftRailVisibilityAction extends CreativeLeftRailBaseAction {
  readonly kind: 'visibility-toggle';
  readonly controls: string;
  readonly visibilityTarget: CreativeLeftRailVisibilityTarget;
}

export type CreativeLeftRailAction =
  | CreativeLeftRailCommonAction
  | CreativeLeftRailVisibilityAction;

export interface CreativeLeftRailProps {
  readonly actions?: readonly CreativeLeftRailAction[];
  readonly bottomActions?: readonly CreativeLeftRailAction[];
  readonly children?: React.ReactNode;
  readonly className?: string;
  readonly width?: number;
  readonly label?: string;
}

export interface MainPanelControlLayerProps {
  readonly id: string;
  readonly visible: boolean;
  readonly placement: MainPanelControlPlacement;
  readonly children: React.ReactNode;
  readonly className?: string;
  readonly label?: string;
  readonly role?: React.AriaRole;
}

export function CreativeWorkbenchShell({
  bodyClassName,
  bottomPanel,
  bottomPanelClassName,
  className,
  leftRail,
  leftRailClassName,
  main,
  mainClassName,
  mainKind,
  rightPanel,
  rightPanelClassName,
}: CreativeWorkbenchShellProps): React.ReactElement {
  return (
    <div className={cn('neko-creative-workbench-shell', className)}>
      <div className={cn('neko-creative-workbench-body', bodyClassName)}>
        <aside className={cn('neko-creative-workbench-left-rail', leftRailClassName)}>
          {leftRail}
        </aside>
        <main
          className={cn('neko-creative-workbench-main', mainClassName)}
          data-main-kind={mainKind}
        >
          {main}
          {bottomPanel ? (
            <div className={cn('neko-creative-workbench-bottom-panel', bottomPanelClassName)}>
              {bottomPanel}
            </div>
          ) : null}
        </main>
        {rightPanel ? (
          <aside className={cn('neko-creative-workbench-right-panel', rightPanelClassName)}>
            {rightPanel}
          </aside>
        ) : null}
      </div>
    </div>
  );
}

export function CreativeLeftRail({
  actions = [],
  bottomActions = [],
  children,
  className,
  label,
  width = 48,
}: CreativeLeftRailProps): React.ReactElement {
  return (
    <VerticalToolbar
      className={cn('neko-creative-left-rail', className)}
      width={width}
      aria-label={label}
    >
      {actions.map((action) => (
        <CreativeLeftRailButton key={action.id} action={action} />
      ))}
      {children}
      {bottomActions.length > 0 ? (
        <>
          <ToolbarSpacer />
          <ToolbarSeparator />
          {bottomActions.map((action) => (
            <CreativeLeftRailButton key={action.id} action={action} />
          ))}
        </>
      ) : null}
    </VerticalToolbar>
  );
}

export function MainPanelControlLayer({
  children,
  className,
  id,
  label,
  placement,
  role,
  visible,
}: MainPanelControlLayerProps): React.ReactElement | null {
  if (!visible) {
    return null;
  }

  return (
    <div
      id={id}
      aria-label={label}
      className={cn('neko-main-panel-control-layer', className)}
      data-placement={placement}
      role={role}
    >
      {children}
    </div>
  );
}

function CreativeLeftRailButton({
  action,
}: {
  readonly action: CreativeLeftRailAction;
}): React.ReactElement {
  const expanded = action.expanded ?? action.active ?? false;
  const visibilityProps =
    action.kind === 'visibility-toggle'
      ? {
          'aria-controls': action.controls,
          'aria-expanded': expanded,
        }
      : {};
  const visibilityTarget =
    action.kind === 'visibility-toggle' ? action.visibilityTarget : undefined;

  return (
    <ToolbarButton
      {...visibilityProps}
      active={action.active}
      className={action.className}
      data-creative-left-rail-action={action.id}
      data-creative-left-rail-kind={action.kind}
      data-creative-left-rail-target={visibilityTarget}
      disabled={action.disabled}
      icon={action.icon}
      title={action.label}
      onClick={action.onClick}
    />
  );
}
