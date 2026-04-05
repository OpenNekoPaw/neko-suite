/**
 * Model Editor Toolbar — left-side vertical tool selector.
 *
 * Uses shared VerticalToolbar + ToolbarButton from @neko/shared/components.
 * Data-driven: each tool is defined as a descriptor, rendered via map.
 */
import {
  VerticalToolbar,
  ToolbarButton,
  ToolbarSeparator,
  ToolbarSpacer,
} from '@neko/shared/components';
import { useModelStore } from '../stores/modelStore';
import { postMessage } from '@neko/shared/vscode';

type ToolItem =
  | {
      key: string;
      icon: React.ReactNode;
      title: string;
      stateKey: string;
      toggle: string;
      needsVRM?: boolean;
    }
  | { key: string; icon: React.ReactNode; title: string; action: () => void }
  | 'separator'
  | 'spacer';

const TOOLS: ToolItem[] = [
  {
    key: 'face',
    icon: <FaceIcon />,
    title: '面部编辑器',
    stateKey: 'isFaceEditorOpen',
    toggle: 'toggleFaceEditor',
  },
  {
    key: 'latency',
    icon: <LatencyIcon />,
    title: '延迟测试',
    stateKey: 'isLatencyTesterOpen',
    toggle: 'toggleLatencyTester',
  },
  {
    key: 'vrm',
    icon: <VrmIcon />,
    title: 'VRM 表情',
    stateKey: 'isExpressionPresetOpen',
    toggle: 'toggleExpressionPreset',
    needsVRM: true,
  },
  'separator',
  {
    key: 'bone',
    icon: <BoneIcon />,
    title: '骨骼表情',
    stateKey: 'isBoneExpressionOpen',
    toggle: 'toggleBoneExpression',
  },
  {
    key: 'shape',
    icon: <ShapeIcon />,
    title: '几何体',
    stateKey: 'isShapeCreatorOpen',
    toggle: 'toggleShapeCreator',
  },
  {
    key: 'text',
    icon: <TextIcon />,
    title: '3D 文字',
    stateKey: 'isTextEditorOpen',
    toggle: 'toggleTextEditor',
  },
  {
    key: 'csg',
    icon: <CsgIcon />,
    title: 'CSG',
    stateKey: 'isCsgPanelOpen',
    toggle: 'toggleCsgPanel',
  },
  {
    key: 'keyframe',
    icon: <KeyframeIcon />,
    title: 'Keyframes',
    stateKey: 'isKeyframeEditorOpen',
    toggle: 'toggleKeyframeEditor',
  },
  'spacer',
  'separator',
  {
    key: 'export',
    icon: <ExportIcon />,
    title: '导出 GLB',
    action: () => postMessage({ type: 'exportGlb' }),
  },
  {
    key: 'save',
    icon: <SaveIcon />,
    title: '保存项目',
    action: () => {
      const editorState = useModelStore.getState().getEditorState();
      postMessage({ type: 'saveProject', editorState });
    },
  },
];

export function Toolbar() {
  const store = useModelStore();
  let sepIdx = 0;
  let spacerIdx = 0;

  return (
    <VerticalToolbar>
      {TOOLS.map((item) => {
        if (item === 'separator') return <ToolbarSeparator key={`sep-${sepIdx++}`} />;
        if (item === 'spacer') return <ToolbarSpacer key={`spc-${spacerIdx++}`} />;

        if ('action' in item) {
          return (
            <ToolbarButton
              key={item.key}
              icon={item.icon}
              title={item.title}
              onClick={item.action}
            />
          );
        }

        const isActive = (store as unknown as Record<string, unknown>)[item.stateKey] as boolean;
        const toggleFn = (store as unknown as Record<string, unknown>)[item.toggle] as () => void;
        const disabled = item.needsVRM === true && !store.isVRMLoaded;

        return (
          <ToolbarButton
            key={item.key}
            icon={item.icon}
            title={item.title}
            active={isActive}
            disabled={disabled}
            onClick={toggleFn}
          />
        );
      })}
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

function LatencyIcon() {
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
      <path d="M8 4v4l3 2" />
    </svg>
  );
}

function VrmIcon() {
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
      <path d="M8 2a4 4 0 0 1 4 4v1a4 4 0 0 1-8 0V6a4 4 0 0 1 4-4z" />
      <path d="M4 9c-1 1-1 3 0 4h8c1-1 1-3 0-4" />
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
