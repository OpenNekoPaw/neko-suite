/**
 * Model Editor left rail.
 *
 * The rail owns global actions, viewport commands, and visibility toggles.
 */
import { memo } from 'react';
import type React from 'react';
import {
  DownloadIcon,
  LayersIcon,
  PackageIcon,
  RightPanelIcon,
  RightPanelOffIcon,
  SettingsIcon,
} from '@neko/ui/icons';
import { getKeyboardBoundaryMetadata } from '@neko/ui/keyboard';
import type { NkmSceneProfile } from '@neko/shared';
import { ToolbarButton, ToolbarSeparator, ToolbarSpacer } from '@neko/ui/primitives';
import { CreativeLeftRail } from '@neko/ui/workbench';
import { useTranslation } from '../i18n/I18nContext';
import { postMessage } from '@neko/shared/vscode';
import { useModelStore, type ModelState } from '../stores/modelStore';
import {
  nextViewportStreamQualityPreset,
  type ViewportStreamQualityPreset,
} from '../viewport/viewportStreamQuality';

interface ModelSideToolbarProps {
  readonly className?: string;
  readonly width?: number;
  readonly sceneProfile?: NkmSceneProfile;
  readonly isViewportHudVisible?: boolean;
  readonly onToggleViewportHud?: () => void;
  readonly isBottomPanelVisible?: boolean;
  readonly onToggleBottomPanel?: () => void;
  readonly isRightDockVisible?: boolean;
  readonly onToggleRightDock?: () => void;
  readonly onCameraChange?: () => void;
  readonly onCameraMutated?: () => void;
}

type ToggleToolKey = 'face' | 'bone' | 'shape' | 'text' | 'csg' | 'sculpt' | 'keyframe';

interface ViewportToolbarStoreState {
  readonly showViewportGrid: boolean;
  readonly isPerformanceMetricsVisible: boolean;
  readonly viewportStreamQuality: ViewportStreamQualityPreset;
  readonly isFaceEditorOpen: boolean;
  readonly isBoneExpressionOpen: boolean;
  readonly isShapeCreatorOpen: boolean;
  readonly isTextEditorOpen: boolean;
  readonly isCsgPanelOpen: boolean;
  readonly isSculptBrushOpen: boolean;
  readonly isKeyframeEditorOpen: boolean;
  readonly toggleViewportGrid: () => void;
  readonly togglePerformanceMetrics: () => void;
  readonly cycleViewportStreamQuality: () => void;
  readonly resetCamera: () => void;
  readonly toggleFaceEditor: () => void;
  readonly toggleBoneExpression: () => void;
  readonly toggleShapeCreator: () => void;
  readonly toggleTextEditor: () => void;
  readonly toggleCsgPanel: () => void;
  readonly toggleSculptBrush: () => void;
  readonly toggleKeyframeEditor: () => void;
}

type ViewportCommandItem =
  | {
      kind: 'toggle';
      key: ToggleToolKey;
      icon: React.ReactNode;
      titleKey: string;
    }
  | 'separator';

const VIEWPORT_COMMANDS: readonly ViewportCommandItem[] = [
  {
    kind: 'toggle',
    key: 'face',
    icon: <FaceIcon />,
    titleKey: 'toolbar.faceEditor',
  },
  'separator',
  {
    kind: 'toggle',
    key: 'bone',
    icon: <BoneIcon />,
    titleKey: 'toolbar.boneExpression',
  },
  {
    kind: 'toggle',
    key: 'shape',
    icon: <ShapeIcon />,
    titleKey: 'toolbar.geometry',
  },
  {
    kind: 'toggle',
    key: 'text',
    icon: <TextIcon />,
    titleKey: 'toolbar.text3d',
  },
  {
    kind: 'toggle',
    key: 'csg',
    icon: <CsgIcon />,
    titleKey: 'toolbar.csg',
  },
  {
    kind: 'toggle',
    key: 'sculpt',
    icon: <SculptIcon />,
    titleKey: 'toolbar.sculpt',
  },
  {
    kind: 'toggle',
    key: 'keyframe',
    icon: <KeyframeIcon />,
    titleKey: 'toolbar.keyframes',
  },
];

export const ModelSideToolbar = memo(function ModelSideToolbar({
  className,
  width,
  sceneProfile = '3d',
  isViewportHudVisible = true,
  onToggleViewportHud,
  isBottomPanelVisible = true,
  onToggleBottomPanel,
  isRightDockVisible = true,
  onToggleRightDock,
  onCameraChange,
  onCameraMutated,
}: ModelSideToolbarProps = {}): React.ReactElement {
  const { t } = useTranslation();
  const toolbarState = useModelStore(selectViewportToolbarStoreState, areToolbarStatesEqual);
  const hasVisibilityToggles =
    onToggleViewportHud !== undefined ||
    onToggleBottomPanel !== undefined ||
    onToggleRightDock !== undefined;
  let sepIdx = 0;

  const runCameraAction = (action: () => void) => {
    action();
    onCameraMutated?.();
    onCameraChange?.();
  };

  return (
    <div
      {...getKeyboardBoundaryMetadata({
        scope: 'popover',
        ownerId: 'model-left-toolbar',
        ownedKeys: ['Enter', 'Escape', 'Space', 'Tab', 'ArrowUp', 'ArrowDown'],
      })}
    >
      <CreativeLeftRail className={className} width={width} label={t('toolbar.modelLeftRail')}>
        <ToolbarButton
          data-creative-left-rail-action="open-export"
          data-creative-left-rail-kind="common-action"
          icon={<DownloadIcon size={16} />}
          title={t('toolbar.export')}
          onClick={() => postMessage({ type: 'model:export' })}
        />
        <ToolbarButton
          data-creative-left-rail-action="open-package"
          data-creative-left-rail-kind="common-action"
          icon={<PackageIcon size={16} />}
          title={t('toolbar.package')}
          onClick={() => postMessage({ type: 'project:package' })}
        />
        <ToolbarButton
          data-creative-left-rail-action="save"
          data-creative-left-rail-kind="common-action"
          icon={<SaveIcon />}
          title={t('toolbar.saveProject')}
          onClick={() => {
            const editorState = useModelStore.getState().getEditorState();
            postMessage({ type: 'saveProject', editorState });
          }}
        />

        <ToolbarSeparator />

        {VIEWPORT_COMMANDS.filter((item) => shouldShowViewportCommand(item, sceneProfile)).map(
          (item) => {
            if (item === 'separator') return <ToolbarSeparator key={`sep-${sepIdx++}`} />;

            const tool = viewportToggleTool(item.key, toolbarState);
            return (
              <ToolbarButton
                key={item.key}
                data-creative-left-rail-action={`toggle-${item.key}`}
                data-creative-left-rail-kind="common-action"
                data-model-toolbar-action={`toggle-${item.key}`}
                icon={item.icon}
                title={t(item.titleKey)}
                active={tool.active}
                onClick={tool.toggle}
              />
            );
          },
        )}

        <ToolbarSeparator />

        <ToolbarButton
          data-creative-left-rail-action="cycle-viewport-quality"
          data-creative-left-rail-kind="common-action"
          data-model-toolbar-action="cycle-viewport-quality"
          icon={<SettingsIcon size={16} />}
          title={t('toolbar.viewportQuality', {
            current: t(viewportQualityLabelKey(toolbarState.viewportStreamQuality)),
            next: t(
              viewportQualityLabelKey(
                nextViewportStreamQualityPreset(toolbarState.viewportStreamQuality),
              ),
            ),
          })}
          onClick={toolbarState.cycleViewportStreamQuality}
        />
        <ToolbarButton
          data-creative-left-rail-action="toggle-viewport-grid"
          data-creative-left-rail-kind="common-action"
          data-model-toolbar-action="toggle-viewport-grid"
          icon={<GridIcon />}
          title={t('viewport.grid')}
          active={toolbarState.showViewportGrid}
          onClick={toolbarState.toggleViewportGrid}
        />
        <ToolbarButton
          aria-controls="model-performance-metrics"
          aria-expanded={toolbarState.isPerformanceMetricsVisible}
          data-creative-left-rail-action="toggle-performance-metrics"
          data-creative-left-rail-kind="common-action"
          data-model-toolbar-action="toggle-performance-metrics"
          icon={<PerformanceIcon />}
          title={
            toolbarState.isPerformanceMetricsVisible
              ? t('toolbar.hidePerformanceMetrics')
              : t('toolbar.showPerformanceMetrics')
          }
          active={toolbarState.isPerformanceMetricsVisible}
          onClick={toolbarState.togglePerformanceMetrics}
        />
        <ToolbarButton
          data-creative-left-rail-action="reset-camera"
          data-creative-left-rail-kind="common-action"
          data-model-toolbar-action="reset-camera"
          icon={<ResetCameraIcon />}
          title={t('viewport.resetCamera')}
          onClick={() => runCameraAction(toolbarState.resetCamera)}
        />

        {hasVisibilityToggles ? (
          <>
            <ToolbarSpacer />
            <ToolbarSeparator />
          </>
        ) : null}

        {onToggleViewportHud ? (
          <ToolbarButton
            aria-controls="model-viewport-hud"
            aria-expanded={isViewportHudVisible}
            data-creative-left-rail-action="toggle-viewport-hud"
            data-creative-left-rail-kind="visibility-toggle"
            data-creative-left-rail-target="hud"
            data-model-toolbar-action="toggle-viewport-hud"
            icon={<LayersIcon size={16} />}
            title={
              isViewportHudVisible ? t('toolbar.hideViewportHud') : t('toolbar.showViewportHud')
            }
            active={isViewportHudVisible}
            onClick={onToggleViewportHud}
          />
        ) : null}

        {onToggleBottomPanel ? (
          <ToolbarButton
            aria-controls="model-timeline-dock"
            aria-expanded={isBottomPanelVisible}
            data-creative-left-rail-action="toggle-bottom-panel"
            data-creative-left-rail-kind="visibility-toggle"
            data-creative-left-rail-target="main-panel"
            data-model-toolbar-action="toggle-bottom-panel"
            icon={<BottomPanelIcon />}
            title={
              isBottomPanelVisible ? t('toolbar.hideBottomPanel') : t('toolbar.showBottomPanel')
            }
            active={isBottomPanelVisible}
            onClick={onToggleBottomPanel}
          />
        ) : null}

        {onToggleRightDock ? (
          <ToolbarButton
            aria-controls="model-right-dock"
            aria-expanded={isRightDockVisible}
            data-creative-left-rail-action="toggle-right-dock"
            data-creative-left-rail-kind="visibility-toggle"
            data-creative-left-rail-target="right-panel"
            data-model-toolbar-action="toggle-right-dock"
            icon={
              isRightDockVisible ? <RightPanelIcon size={16} /> : <RightPanelOffIcon size={16} />
            }
            title={isRightDockVisible ? t('toolbar.hideRightDock') : t('toolbar.showRightDock')}
            active={isRightDockVisible}
            onClick={onToggleRightDock}
          />
        ) : null}
      </CreativeLeftRail>
    </div>
  );
});

function shouldShowViewportCommand(
  item: ViewportCommandItem,
  sceneProfile: NkmSceneProfile,
): boolean {
  if (item === 'separator') return sceneProfile !== '2d';
  if (sceneProfile !== '2d') return true;
  return item.key === 'keyframe';
}

function selectViewportToolbarStoreState(state: ModelState): ViewportToolbarStoreState {
  return {
    showViewportGrid: state.showViewportGrid,
    isPerformanceMetricsVisible: state.isPerformanceMetricsVisible,
    viewportStreamQuality: state.viewportStreamQuality,
    isFaceEditorOpen: state.isFaceEditorOpen,
    isBoneExpressionOpen: state.isBoneExpressionOpen,
    isShapeCreatorOpen: state.isShapeCreatorOpen,
    isTextEditorOpen: state.isTextEditorOpen,
    isCsgPanelOpen: state.isCsgPanelOpen,
    isSculptBrushOpen: state.isSculptBrushOpen,
    isKeyframeEditorOpen: state.isKeyframeEditorOpen,
    toggleViewportGrid: state.toggleViewportGrid,
    togglePerformanceMetrics: state.togglePerformanceMetrics,
    cycleViewportStreamQuality: state.cycleViewportStreamQuality,
    resetCamera: state.resetCamera,
    toggleFaceEditor: state.toggleFaceEditor,
    toggleBoneExpression: state.toggleBoneExpression,
    toggleShapeCreator: state.toggleShapeCreator,
    toggleTextEditor: state.toggleTextEditor,
    toggleCsgPanel: state.toggleCsgPanel,
    toggleSculptBrush: state.toggleSculptBrush,
    toggleKeyframeEditor: state.toggleKeyframeEditor,
  };
}

function areToolbarStatesEqual(
  left: ViewportToolbarStoreState,
  right: ViewportToolbarStoreState,
): boolean {
  return (
    left.showViewportGrid === right.showViewportGrid &&
    left.isPerformanceMetricsVisible === right.isPerformanceMetricsVisible &&
    left.viewportStreamQuality === right.viewportStreamQuality &&
    left.isFaceEditorOpen === right.isFaceEditorOpen &&
    left.isBoneExpressionOpen === right.isBoneExpressionOpen &&
    left.isShapeCreatorOpen === right.isShapeCreatorOpen &&
    left.isTextEditorOpen === right.isTextEditorOpen &&
    left.isCsgPanelOpen === right.isCsgPanelOpen &&
    left.isSculptBrushOpen === right.isSculptBrushOpen &&
    left.isKeyframeEditorOpen === right.isKeyframeEditorOpen &&
    left.toggleViewportGrid === right.toggleViewportGrid &&
    left.togglePerformanceMetrics === right.togglePerformanceMetrics &&
    left.cycleViewportStreamQuality === right.cycleViewportStreamQuality &&
    left.resetCamera === right.resetCamera &&
    left.toggleFaceEditor === right.toggleFaceEditor &&
    left.toggleBoneExpression === right.toggleBoneExpression &&
    left.toggleShapeCreator === right.toggleShapeCreator &&
    left.toggleTextEditor === right.toggleTextEditor &&
    left.toggleCsgPanel === right.toggleCsgPanel &&
    left.toggleSculptBrush === right.toggleSculptBrush &&
    left.toggleKeyframeEditor === right.toggleKeyframeEditor
  );
}

function viewportQualityLabelKey(quality: ViewportStreamQualityPreset): string {
  switch (quality) {
    case 'quarter':
      return 'viewport.quality.quarter';
    case 'half':
      return 'viewport.quality.half';
    case 'native':
      return 'viewport.quality.native';
  }
}

function viewportToggleTool(
  key: ToggleToolKey,
  state: ViewportToolbarStoreState,
): {
  readonly active: boolean;
  readonly toggle: () => void;
} {
  switch (key) {
    case 'face':
      return { active: state.isFaceEditorOpen, toggle: state.toggleFaceEditor };
    case 'bone':
      return { active: state.isBoneExpressionOpen, toggle: state.toggleBoneExpression };
    case 'shape':
      return { active: state.isShapeCreatorOpen, toggle: state.toggleShapeCreator };
    case 'text':
      return { active: state.isTextEditorOpen, toggle: state.toggleTextEditor };
    case 'csg':
      return { active: state.isCsgPanelOpen, toggle: state.toggleCsgPanel };
    case 'sculpt':
      return { active: state.isSculptBrushOpen, toggle: state.toggleSculptBrush };
    case 'keyframe':
      return { active: state.isKeyframeEditorOpen, toggle: state.toggleKeyframeEditor };
  }
}

function SaveIcon(): React.ReactElement {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 2.5h8l2 2v9H3z" />
      <path d="M5 2.5v4h6v-4" />
      <path d="M5 13.5v-4h6v4" />
    </svg>
  );
}

function BottomPanelIcon(): React.ReactElement {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="2.5" y="4" width="11" height="8" rx="1.5" />
      <path d="M2.5 8h11" />
      <path d="M5 10h2M9 10h2" />
    </svg>
  );
}

function FaceIcon(): React.ReactElement {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
    >
      <circle cx="8" cy="8" r="5" />
      <path d="M5.5 7h.01M10.5 7h.01M6 10c1.2 1 2.8 1 4 0" strokeLinecap="round" />
    </svg>
  );
}

function BoneIcon(): React.ReactElement {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
    >
      <circle cx="4" cy="4" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <path d="M5.2 5.2l5.6 5.6" />
    </svg>
  );
}

function ShapeIcon(): React.ReactElement {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
    >
      <path d="M3 11l5-8 5 8z" />
      <path d="M4 12h8" />
    </svg>
  );
}

function TextIcon(): React.ReactElement {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
    >
      <path d="M3 4h10M8 4v9M5.5 13h5" />
    </svg>
  );
}

function CsgIcon(): React.ReactElement {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
    >
      <circle cx="6" cy="8" r="4" />
      <rect x="7" y="5" width="6" height="6" rx="1" />
    </svg>
  );
}

function SculptIcon(): React.ReactElement {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
    >
      <path d="M4 12c1.5-1 2.5-2 2.5-4.5S8.5 3 11 3c1.5 0 2.5.8 2.5 2" />
      <path d="M3 13c2.5.8 5 .8 8 0" />
    </svg>
  );
}

function KeyframeIcon(): React.ReactElement {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
    >
      <path d="M8 2l5 6-5 6-5-6z" />
      <path d="M8 5l2.5 3L8 11 5.5 8z" />
    </svg>
  );
}

function GridIcon(): React.ReactElement {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
    >
      <path d="M3 3h10v10H3zM3 6h10M3 10h10M6 3v10M10 3v10" />
    </svg>
  );
}

function PerformanceIcon(): React.ReactElement {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 12V7" />
      <path d="M6.3 12V4" />
      <path d="M9.7 12V8" />
      <path d="M13 12V5.5" />
      <path d="M2.5 13.5h11" />
    </svg>
  );
}

function ResetCameraIcon(): React.ReactElement {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
    >
      <path d="M3 5a5 5 0 1 1 1 6" />
      <path d="M3 3v4h4" />
      <path d="M6 8h4l1.5 2.5h-7z" />
    </svg>
  );
}
