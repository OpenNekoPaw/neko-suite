import { CanvasHostAdapterSurface } from '@neko-canvas/webview/host-adapter';
import { AudioHostAdapterSurface } from '@neko-audio/webview/host-adapter';
import { ModelHostAdapterSurface } from '@neko-model/webview/host-adapter';
import { SketchHostAdapterSurface } from '@neko-sketch/webview/host-adapter';
import { PreviewHostAdapterSurface } from '@neko/preview-webview/host-adapter';
import { CutWebviewRoot } from '@neko/webview/root';
import type { ISceneController } from '@neko/shared';
import type { ProjectData } from '@neko/shared';
import { useTranslation } from '@neko/shared/i18n/react';
import { WorkbenchWebviewRuntimeFrame } from '@neko/ui/workbench';
import type {
  CreativeHostAdapterSurfaceProps,
  CreativeHostDocumentProjection,
  CreativeHostRuntimeProjection,
} from '@neko/ui/workbench';
import { ViewportShell } from '@neko/ui/viewport';
import { useMemo, type ReactElement } from 'react';
import type {
  DesktopCreativePanelKind,
  DesktopSnapshot,
  ReadWorkspaceFileResult,
  ViewportIntent,
  WorkspaceFileNode,
} from '../shared/contracts';
import { CodeEditor } from './CodeEditor';

export interface CreativeEditorAdapterHostProps {
  readonly snapshot: DesktopSnapshot;
  readonly selectedFile: WorkspaceFileNode | undefined;
  readonly selectedFileContent: ReadWorkspaceFileResult | undefined;
  readonly onIntent: (
    action: ViewportIntent['action'],
    payload?: Readonly<Record<string, unknown>>,
  ) => void;
}

interface DesktopAdapterRegistration {
  readonly panelKind: DesktopCreativePanelKind;
  readonly packageName: string;
  readonly render: (props: CreativeHostAdapterSurfaceProps) => ReactElement;
}

const desktopViewportController: ISceneController = {
  sceneId: 'desktop-editor-preview',
  sceneType: '3d',
  onPointerDown: () => undefined,
  onPointerMove: () => undefined,
  onPointerUp: () => undefined,
  onWheel: () => undefined,
  onKeyDown: () => undefined,
  getOverlays: () => [],
  getToolbarExtensions: () => [],
  getContextMenu: () => [],
  handleViewportEvent: () => undefined,
};

const DESKTOP_ADAPTER_REGISTRY: Readonly<Record<DesktopCreativePanelKind, DesktopAdapterRegistration>> = {
  'canvas-workbench': {
    panelKind: 'canvas-workbench',
    packageName: '@neko-canvas/webview',
    render: (props) => <CanvasHostAdapterSurface {...props} />,
  },
  'cut-timeline': {
    panelKind: 'cut-timeline',
    packageName: '@neko/webview',
    render: () => {
      throw new Error('Cut editor is rendered through the full @neko/webview/root runtime.');
    },
  },
  'audio-timeline': {
    panelKind: 'audio-timeline',
    packageName: '@neko-audio/webview',
    render: (props) => <AudioHostAdapterSurface {...props} />,
  },
  'sketch-editor': {
    panelKind: 'sketch-editor',
    packageName: '@neko-sketch/webview',
    render: (props) => <SketchHostAdapterSurface {...props} />,
  },
  'model-viewport': {
    panelKind: 'model-viewport',
    packageName: '@neko-model/webview',
    render: (props) => <ModelHostAdapterSurface {...props} />,
  },
  'media-preview': {
    panelKind: 'media-preview',
    packageName: '@neko/preview-webview',
    render: (props) => <PreviewHostAdapterSurface {...props} />,
  },
  'code-editor': {
    panelKind: 'code-editor',
    packageName: 'neko-desktop',
    render: () => {
      throw new Error('Code editor adapter is rendered through the desktop CodeMirror host.');
    },
  },
};

export function CreativeEditorAdapterHost({
  onIntent,
  selectedFile,
  selectedFileContent,
  snapshot,
}: CreativeEditorAdapterHostProps): ReactElement {
  const { t } = useTranslation();

  if (!selectedFile?.editor) {
    return <EmptyEditor snapshot={snapshot} />;
  }

  if (selectedFile.editor.kind === 'code') {
    return selectedFileContent ? (
      <CodeEditor
        content={selectedFileContent.content}
        relativePath={selectedFileContent.relativePath}
        truncated={selectedFileContent.truncated}
      />
    ) : (
      <div className="desktop-editor-loading">{t('editor.loading')}</div>
    );
  }

  if (selectedFile.editor.panelKind === 'cut-timeline') {
    if (selectedFile.editor.packageName !== '@neko/webview') {
      throw new Error(
        `Desktop Cut runtime package mismatch: expected @neko/webview, got ${selectedFile.editor.packageName}.`,
      );
    }
    return selectedFileContent ? (
      <CutEditorSurface
        content={selectedFileContent}
        locale={snapshot.host.locale}
        workspaceRoot={snapshot.workspace.root}
      />
    ) : (
      <div className="desktop-editor-loading">{t('editor.loading')}</div>
    );
  }

  const registration = DESKTOP_ADAPTER_REGISTRY[selectedFile.editor.panelKind];
  if (!registration) {
    throw new Error(`No desktop creative adapter registered for ${selectedFile.editor.panelKind}.`);
  }
  if (registration.packageName !== selectedFile.editor.packageName) {
    throw new Error(
      `Desktop adapter package mismatch for ${selectedFile.editor.panelKind}: expected ${selectedFile.editor.packageName}, got ${registration.packageName}.`,
    );
  }

  return registration.render({
    document: toHostDocumentProjection(selectedFile),
    locale: snapshot.host.locale,
    runtime: toHostRuntimeProjection(selectedFile),
    onIntent,
  });
}

export function listDesktopCreativeAdapterPanelKinds(): readonly DesktopCreativePanelKind[] {
  return Object.keys(DESKTOP_ADAPTER_REGISTRY) as readonly DesktopCreativePanelKind[];
}

function EmptyEditor({ snapshot }: { readonly snapshot: DesktopSnapshot }): ReactElement {
  return (
    <ViewportShell
      className="desktop-viewport-shell"
      controller={desktopViewportController}
      sceneId="desktop-empty"
      viewportId={snapshot.viewport.id}
      surface={{
        kind: 'custom',
        node: (
          <div className="desktop-adapter-empty-surface">
            <span className="desktop-adapter-empty-surface__mark">+</span>
          </div>
        ),
      }}
    />
  );
}

function toHostDocumentProjection(file: WorkspaceFileNode): CreativeHostDocumentProjection {
  return {
    id: file.id,
    name: file.name,
    relativePath: file.relativePath,
    kind: file.kind,
    ...(file.thumbnail?.url ? { resourceUrl: file.thumbnail.url } : {}),
  };
}

function toHostRuntimeProjection(file: WorkspaceFileNode): CreativeHostRuntimeProjection {
  if (!file.editor) {
    throw new Error(`Workspace file has no editor adapter: ${file.relativePath}`);
  }
  return {
    label: file.editor.label,
    packageName: file.editor.packageName,
    panelKind: file.editor.panelKind,
    runtime: file.editor.desktopRuntime,
    hostAdapterInspector: 'hidden',
  };
}

function CutEditorSurface({
  content,
  locale,
  workspaceRoot,
}: {
  readonly content: ReadWorkspaceFileResult;
  readonly locale: DesktopSnapshot['host']['locale'];
  readonly workspaceRoot: string;
}): ReactElement {
  const { t } = useTranslation();
  const project = useMemo(() => parseCutProjectData(content), [content]);
  const projectRoot = useMemo(
    () => resolveWorkspaceDirectory(workspaceRoot, content.relativePath),
    [content.relativePath, workspaceRoot],
  );
  if (!project.ok) {
    return (
      <div className="desktop-editor-diagnostic" role="alert">
        <strong>{t('adapter.cutProjectInvalid')}</strong>
        <p>{project.message}</p>
      </div>
    );
  }

  return (
    <WorkbenchWebviewRuntimeFrame runtimeId="cut">
      <CutWebviewRoot
        initialProject={project.value}
        locale={locale}
        projectRoot={projectRoot}
      />
    </WorkbenchWebviewRuntimeFrame>
  );
}

type CutProjectParseResult =
  | { readonly ok: true; readonly value: ProjectData }
  | { readonly ok: false; readonly message: string };

function parseCutProjectData(content: ReadWorkspaceFileResult): CutProjectParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content.content);
  } catch (error: unknown) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  if (!isCutProjectData(parsed)) {
    return {
      ok: false,
      message: `${content.relativePath} is not a valid Neko Cut project document.`,
    };
  }

  return { ok: true, value: parsed };
}

function isCutProjectData(value: unknown): value is ProjectData {
  if (!isRecord(value)) {
    return false;
  }
  const resolution = value['resolution'];
  return (
    typeof value['name'] === 'string' &&
    typeof value['fps'] === 'number' &&
    Array.isArray(value['tracks']) &&
    isRecord(resolution) &&
    typeof resolution['width'] === 'number' &&
    typeof resolution['height'] === 'number'
  );
}

function resolveWorkspaceDirectory(workspaceRoot: string, relativePath: string): string {
  const normalizedRoot = workspaceRoot.replace(/\\/gu, '/').replace(/\/$/u, '');
  const directory = relativePath.split('/').slice(0, -1).join('/');
  return directory.length > 0 ? `${normalizedRoot}/${directory}` : normalizedRoot;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
