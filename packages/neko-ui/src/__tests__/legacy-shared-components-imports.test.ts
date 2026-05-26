import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  findSharedComponentsImportViolations,
  type SharedComponentsImportAllowance,
} from '../test-utils/source-guards';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '../../../..');
const packagesRoot = join(repoRoot, 'packages');
const sourceExtensions = new Set(['.ts', '.tsx']);
const skippedDirectories = new Set(['.turbo', 'build', 'dist', 'node_modules']);
const sharedComponentsSpecifier = '@neko/shared/components';

const legacySharedComponentsAllowlist: readonly SharedComponentsImportAllowance[] = [
  {
    filePath: 'packages/neko-agent/packages/webview/src/components/ChatView/DropZone.tsx',
    importNames: ['FileDropResult', 'useFileDrop'],
  },
  {
    filePath: 'packages/neko-audio/packages/webview/src/components/EditableWaveform.tsx',
    importNames: ['ContextMenu', 'MenuItem'],
  },
  {
    filePath: 'packages/neko-audio/packages/webview/src/components/Timeline/AudioClip.tsx',
    importNames: ['ContextMenu', 'MenuItem'],
  },
  {
    filePath: 'packages/neko-audio/packages/webview/src/components/Timeline/TimelineRuler.tsx',
    importNames: ['TimelineRuler'],
  },
  {
    filePath: 'packages/neko-audio/packages/webview/src/components/Timeline/TrackLane.tsx',
    importNames: ['ContextMenu', 'MenuItem'],
  },
  {
    filePath: 'packages/neko-audio/packages/webview/src/components/Toolbar.tsx',
    importNames: ['ToolbarButton', 'ToolbarSeparator', 'VerticalToolbar'],
  },
  {
    filePath: 'packages/neko-canvas/packages/webview/src/components/common/ContextMenu.tsx',
    importNames: [
      'ContextMenu',
      'ContextMenuProps',
      'MenuAction',
      'MenuItem',
      'MenuSeparator',
      'buildAIMenuSection',
    ],
  },
  {
    filePath: 'packages/neko-canvas/packages/webview/src/components/media/InlineAudioPlayer.tsx',
    importNames: ['ProgressBar'],
  },
  {
    filePath: 'packages/neko-canvas/packages/webview/src/components/media/InlineVideoPlayer.tsx',
    importNames: ['ProgressBar'],
  },
  {
    filePath: 'packages/neko-canvas/packages/webview/src/components/toolbar/CanvasToolbar.tsx',
    importNames: ['ToolbarButton', 'ToolbarSeparator'],
  },
  {
    filePath: 'packages/neko-cut/packages/webview/src/components/ContextMenu.tsx',
    importNames: ['ContextMenu', 'MenuItem'],
  },
  {
    filePath: 'packages/neko-cut/packages/webview/src/components/PropertyPanel/PropertyPanel.tsx',
    importNames: ['CollapsibleSection'],
  },
  {
    filePath: 'packages/neko-cut/packages/webview/src/components/Timeline/TimelineRuler.tsx',
    importNames: ['TimelineRuler'],
  },
  {
    filePath: 'packages/neko-cut/packages/webview/src/hooks/useTimelineContextMenu.ts',
    importNames: ['MenuItem', 'buildAIMenuSection'],
  },
  {
    filePath: 'packages/neko-model/packages/webview/src/components/ModelKeyframeTimeline.tsx',
    importNames: ['KeyframeTimeline'],
  },
  {
    filePath: 'packages/neko-model/packages/webview/src/components/Toolbar.tsx',
    importNames: ['ToolbarButton', 'ToolbarSeparator', 'ToolbarSpacer', 'VerticalToolbar'],
  },
  {
    filePath: 'packages/neko-puppet/packages/webview/src/components/PuppetKeyframeTimeline.tsx',
    importNames: ['KeyframeTimeline'],
  },
  {
    filePath: 'packages/neko-sketch/packages/webview/src/components/CollapsiblePanel.tsx',
    importNames: ['CollapsibleSection'],
  },
  {
    filePath: 'packages/neko-sketch/packages/webview/src/components/SketchCanvas.tsx',
    importNames: ['ContextMenu', 'MenuItem'],
  },
  {
    filePath: 'packages/neko-sketch/packages/webview/src/components/Toolbar.tsx',
    importNames: ['ToolbarButton', 'ToolbarSeparator', 'ToolbarSpacer', 'VerticalToolbar'],
  },
  {
    filePath: 'packages/neko-ui/src/hooks/hooks-compat.test.ts',
    importNames: ['*'],
  },
  {
    filePath: 'packages/neko-ui/src/hooks/index.ts',
    importNames: [
      'DragBindings',
      'DragCallbacks',
      'DragOptions',
      'FileDropBindings',
      'FileDropOptions',
      'FileDropResult',
      'FileDropResultType',
      'PersistedResizeOptions',
      'PersistedResizeReturn',
      'ResizeBounds',
      'ResizeEdge',
      'ResizeHandleBindings',
      'ResizeMode',
      'ResizeOrientation',
      'ResizePointerPosition',
      'ResizeRect',
      'ResizeState',
      'UseResizableControlledOptions',
      'UseResizableOptions',
      'UseResizableReturn',
      'UseResizableUncontrolledOptions',
      'normalizeResizeState',
      'readPersistedResizeState',
      'useDrag',
      'useFileDrop',
      'usePersistedResize',
      'useResizable',
      'writePersistedResizeState',
    ],
  },
  {
    filePath: 'packages/neko-ui/src/primitives/resize-handle.ts',
    importNames: ['ResizeHandle', 'ResizeHandleProps'],
  },
];

describe('legacy @neko/shared/components import cutoff', () => {
  it('keeps remaining legacy imports explicitly exempted after Phase 3.3', () => {
    const sources = new Map(
      collectScanRoots().flatMap((root) =>
        collectSourceFiles(root).flatMap((filePath) => {
          const source = readFileSync(filePath, 'utf-8');

          if (!source.includes(sharedComponentsSpecifier)) {
            return [];
          }

          return [
            [relative(repoRoot, filePath).replace(/\\/g, '/'), source] satisfies readonly [
              string,
              string,
            ],
          ];
        }),
      ),
    );

    expect(findSharedComponentsImportViolations(sources, legacySharedComponentsAllowlist)).toEqual(
      [],
    );
  });
});

function collectScanRoots(): string[] {
  const webviewSourceRoots = readdirSync(packagesRoot).flatMap((entry) => {
    const webviewSrc = join(packagesRoot, entry, 'packages', 'webview', 'src');

    if (!existsSync(webviewSrc)) {
      return [];
    }

    return [webviewSrc];
  });

  return [...webviewSourceRoots, join(packagesRoot, 'neko-ui', 'src')];
}

function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    const stat = statSync(path);

    if (stat.isDirectory()) {
      if (skippedDirectories.has(entry)) {
        return [];
      }

      return collectSourceFiles(path);
    }

    if (!Array.from(sourceExtensions).some((extension) => path.endsWith(extension))) {
      return [];
    }

    return [path];
  });
}
