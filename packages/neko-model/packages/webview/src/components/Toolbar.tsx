/**
 * Model Editor Toolbar — left-side vertical tool selector.
 *
 * Uses shared VerticalToolbar + ToolbarButton from @neko/ui/primitives.
 * Data-driven: each tool is defined as a descriptor, rendered via map.
 */
import {
  VerticalToolbar,
  ToolbarButton,
  ToolbarSeparator,
  ToolbarSpacer,
} from '@neko/ui/primitives';
import { useModelStore } from '../stores/modelStore';
import type { ModelState } from '../stores/modelStore';
import { useTranslation } from '../i18n/I18nContext';
import { postMessage } from '@neko/shared/vscode';
import { RightPanelIcon, RightPanelOffIcon } from '@neko/ui/icons';

type ToggleToolKey = 'face' | 'bone' | 'shape' | 'text' | 'csg' | 'sculpt' | 'keyframe';

type ToolItem =
  | {
      kind: 'toggle';
      key: ToggleToolKey;
      icon: React.ReactNode;
      titleKey: string;
    }
  | { kind: 'action'; key: string; icon: React.ReactNode; titleKey: string; action: () => void }
  | 'separator'
  | 'spacer';

const TOGGLE_TOOLS: Record<
  ToggleToolKey,
  {
    isActive: (state: ModelState) => boolean;
    toggle: (state: ModelState) => () => void;
  }
> = {
  face: {
    isActive: (state) => state.isFaceEditorOpen,
    toggle: (state) => state.toggleFaceEditor,
  },
  bone: {
    isActive: (state) => state.isBoneExpressionOpen,
    toggle: (state) => state.toggleBoneExpression,
  },
  shape: {
    isActive: (state) => state.isShapeCreatorOpen,
    toggle: (state) => state.toggleShapeCreator,
  },
  text: {
    isActive: (state) => state.isTextEditorOpen,
    toggle: (state) => state.toggleTextEditor,
  },
  csg: {
    isActive: (state) => state.isCsgPanelOpen,
    toggle: (state) => state.toggleCsgPanel,
  },
  sculpt: {
    isActive: (state) => state.isSculptBrushOpen,
    toggle: (state) => state.toggleSculptBrush,
  },
  keyframe: {
    isActive: (state) => state.isKeyframeEditorOpen,
    toggle: (state) => state.toggleKeyframeEditor,
  },
};

const TOOLS: ToolItem[] = [
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
  'spacer',
  'separator',
  {
    kind: 'action',
    key: 'export',
    icon: <ExportIcon />,
    titleKey: 'toolbar.exportGlb',
    action: () => postMessage({ type: 'exportGlb' }),
  },
  {
    kind: 'action',
    key: 'save',
    icon: <SaveIcon />,
    titleKey: 'toolbar.saveProject',
    action: () => {
      const editorState = useModelStore.getState().getEditorState();
      postMessage({ type: 'saveProject', editorState });
    },
  },
];

interface ToolbarProps {
  className?: string;
  width?: number;
  isRightDockVisible?: boolean;
  onToggleRightDock?: () => void;
  onCameraChange?: () => void;
  onCameraMutated?: () => void;
}

export function Toolbar({
  className,
  width,
  isRightDockVisible = true,
  onToggleRightDock,
  onCameraChange,
  onCameraMutated,
}: ToolbarProps = {}) {
  const store = useModelStore();
  const { t } = useTranslation();
  let sepIdx = 0;
  let spacerIdx = 0;
  const showViewportGrid = store.showViewportGrid;

  const runCameraAction = (action: () => void) => {
    action();
    onCameraMutated?.();
    onCameraChange?.();
  };

  return (
    <VerticalToolbar className={className} width={width}>
      {TOOLS.map((item) => {
        if (item === 'separator') return <ToolbarSeparator key={`sep-${sepIdx++}`} />;
        if (item === 'spacer') {
          return <ToolbarSpacer key={`spc-${spacerIdx++}`} />;
        }

        if (item.kind === 'action') {
          return (
            <ToolbarButton
              key={item.key}
              icon={item.icon}
              title={t(item.titleKey)}
              onClick={item.action}
            />
          );
        }

        const tool = TOGGLE_TOOLS[item.key];
        const isActive = tool.isActive(store);
        const toggleFn = tool.toggle(store);
        return (
          <ToolbarButton
            key={item.key}
            icon={item.icon}
            title={t(item.titleKey)}
            active={isActive}
            onClick={toggleFn}
          />
        );
      })}
      <ToolbarButton
        icon={<GridIcon />}
        title={t('viewport.grid')}
        active={showViewportGrid}
        onClick={() => useModelStore.getState().toggleViewportGrid()}
      />
      <ToolbarButton
        icon={<ResetCameraIcon />}
        title={t('viewport.resetCamera')}
        onClick={() => runCameraAction(() => useModelStore.getState().resetCamera())}
      />
      {onToggleRightDock ? (
        <>
          <ToolbarSpacer />
          <ToolbarSeparator />
          <ToolbarButton
            aria-controls="model-right-dock"
            aria-expanded={isRightDockVisible}
            data-model-toolbar-action="toggle-right-dock"
            icon={
              isRightDockVisible ? <RightPanelIcon size={16} /> : <RightPanelOffIcon size={16} />
            }
            title={isRightDockVisible ? t('toolbar.hideRightDock') : t('toolbar.showRightDock')}
            active={isRightDockVisible}
            onClick={onToggleRightDock}
          />
        </>
      ) : null}
    </VerticalToolbar>
  );
}

/* ── Inline SVG icons (16x16, currentColor) ────────────────────────────── */

function FaceIcon() {
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
      <circle cx="8" cy="8" r="6" />
      <circle cx="6" cy="7" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="10" cy="7" r="0.8" fill="currentColor" stroke="none" />
      <path d="M5.5 10.5c1 1 4 1 5 0" />
    </svg>
  );
}

function BoneIcon() {
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
      <circle cx="4" cy="4" r="2" />
      <circle cx="12" cy="12" r="2" />
      <path d="M5.5 5.5l5 5" />
    </svg>
  );
}

function ShapeIcon() {
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
      <rect x="3" y="3" width="10" height="10" rx="2" />
    </svg>
  );
}

function SculptIcon() {
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
      <path d="M4 12c2.5-4 5.5-4 8-8" />
      <path d="M3 13c2 0 3-.6 4-1.8" />
      <circle cx="12" cy="4" r="1.5" />
    </svg>
  );
}

function TextIcon() {
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
      <path d="M4 4h8M8 4v8M6 12h4" />
    </svg>
  );
}

function CsgIcon() {
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
      <circle cx="6" cy="8" r="4" />
      <circle cx="10" cy="8" r="4" />
    </svg>
  );
}

function KeyframeIcon() {
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
      <path d="M8 2l3 6-3 6-3-6z" />
    </svg>
  );
}

function ExportIcon() {
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
      <path d="M3 14h10M8 2v9M5 8l3 3 3-3" />
    </svg>
  );
}

function SaveIcon() {
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
      <path d="M3 3h8l2 2v8H3z" />
      <path d="M5 3v3h4V3M5 10h6" />
    </svg>
  );
}

function GridIcon() {
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
      <rect x="3" y="3" width="10" height="10" rx="1.5" />
      <path d="M6.3 3v10M9.7 3v10M3 6.3h10M3 9.7h10" />
    </svg>
  );
}

function ResetCameraIcon() {
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
      <path d="M12.5 6.5A4.6 4.6 0 1 0 13 9" />
      <path d="M12.5 3.5v3h-3" />
    </svg>
  );
}
