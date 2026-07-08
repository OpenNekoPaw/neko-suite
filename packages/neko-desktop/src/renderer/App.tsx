import clsx from 'clsx';
import { AgentWebviewRoot } from '@neko-agent/webview/root';
import { useI18n, useTranslation } from '@neko/shared/i18n/react';
import { TreeView, type TreeViewItem } from '@neko/ui/creative';
import {
  CameraIcon,
  ChevronUpIcon,
  CodeIcon,
  FileIcon,
  FolderIcon,
  LayersIcon,
  MoreHorizontalIcon,
  PackageIcon,
  PlayIcon,
  PlusIcon,
  RefreshIcon,
  ScissorsIcon,
  VolumeIcon,
} from '@neko/ui/icons';
import {
  EditorWorkbenchShell,
  WorkbenchActivityBar,
  WorkbenchEditorTabs,
  WorkbenchListCard,
  WorkbenchPanelHeader,
  WorkbenchStatusBar,
  WorkbenchThumbnailStrip,
  WorkbenchWebviewRuntimeFrame,
} from '@neko/ui/workbench';
import { useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react';
import type {
  DesktopEditorAdapterDescriptor,
  DesktopSnapshot,
  ReadWorkspaceFileResult,
  ResourceActionDescriptor,
  ResourceNode,
  ViewportIntent,
  ViewportIntentAck,
  WorkspaceFileScmStatus,
  WorkspaceFileNode,
  WorkbenchSurfaceId,
} from '../shared/contracts';
import { CreativeEditorAdapterHost } from './creative-editor-adapters';
import { getDesktopBridge } from './desktop-bridge';

const surfaceShortLabels: Record<WorkbenchSurfaceId, string> = {
  explorer: 'EX',
  assets: 'AS',
  generations: 'GN',
  market: 'MK',
  skills: 'SK',
  search: 'SR',
};

type RightPanelId = 'agent' | 'inspector';
type TranslateFn = (key: string, params?: Record<string, string | number>) => string;
type MediaPreviewFileKind = Extract<
  WorkspaceFileNode['kind'],
  'image' | 'video' | 'audio' | 'model' | 'puppet'
>;

const MEDIA_PREVIEW_KIND_ORDER: readonly MediaPreviewFileKind[] = [
  'image',
  'video',
  'audio',
  'model',
  'puppet',
];

export function App(): ReactElement {
  const { setLocale, t } = useI18n();
  const [snapshot, setSnapshot] = useState<DesktopSnapshot | undefined>();
  const [activeSurfaceId, setActiveSurfaceId] = useState<WorkbenchSurfaceId>('explorer');
  const [rightPanelId, setRightPanelId] = useState<RightPanelId>('agent');
  const [selectedFileId, setSelectedFileId] = useState<string | undefined>();
  const [selectedWorkspaceNodeId, setSelectedWorkspaceNodeId] = useState<string | undefined>();
  const [openFileIds, setOpenFileIds] = useState<readonly string[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | undefined>();
  const [ack, setAck] = useState<ViewportIntentAck | undefined>();
  const [selectedFileContent, setSelectedFileContent] = useState<
    ReadWorkspaceFileResult | undefined
  >();
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    let disposed = false;
    let bridge: ReturnType<typeof getDesktopBridge>;

    try {
      bridge = getDesktopBridge();
    } catch (loadError: unknown) {
      setError(describeUnknownError(loadError));
      return () => {
        disposed = true;
      };
    }

    bridge
      .getSnapshot()
      .then((nextSnapshot) => {
        if (disposed) {
          return;
        }
        setLocale(nextSnapshot.host.locale);
        document.documentElement.lang = nextSnapshot.host.locale;
        setSnapshot(nextSnapshot);
        setActiveSurfaceId('explorer');
        const initialOpenFiles = collectInitialOpenFiles(nextSnapshot.workspaceTree.nodes);
        const initialFileId = initialOpenFiles[0]?.id ?? nextSnapshot.workspaceTree.selectedFileId;
        setSelectedFileId(initialFileId);
        setSelectedWorkspaceNodeId(initialFileId);
        setOpenFileIds(initialOpenFiles.map((file) => file.id));
        setSelectedNodeId(nextSnapshot.resourceSurfaces[0]?.nodes[0]?.id);
      })
      .catch((loadError: unknown) => {
        if (!disposed) {
          setError(describeUnknownError(loadError));
        }
      });

    return () => {
      disposed = true;
    };
  }, [setLocale]);

  const selectedFile = useMemo(() => {
    return snapshot && selectedFileId
      ? findWorkspaceFile(snapshot.workspaceTree.nodes, selectedFileId)
      : undefined;
  }, [selectedFileId, snapshot]);

  const openFiles = useMemo(() => {
    if (!snapshot) return [];
    return openFileIds
      .map((id) => findWorkspaceFile(snapshot.workspaceTree.nodes, id))
      .filter((file): file is WorkspaceFileNode => Boolean(file));
  }, [openFileIds, snapshot]);

  const activeResourceSurface = useMemo(() => {
    return snapshot?.resourceSurfaces.find((surface) => surface.surfaceId === activeSurfaceId);
  }, [activeSurfaceId, snapshot]);

  const selectedNode = useMemo(() => {
    const activeNode = activeResourceSurface?.nodes.find((node) => node.id === selectedNodeId);
    if (activeNode) {
      return activeNode;
    }
    return snapshot?.resourceSurfaces.flatMap((surface) => surface.nodes).find((node) => node.id === selectedNodeId);
  }, [activeResourceSurface, selectedNodeId, snapshot]);

  useEffect(() => {
    let disposed = false;
    setSelectedFileContent(undefined);

    if (!selectedFile?.editor || !shouldReadSelectedFileContent(selectedFile)) {
      return () => {
        disposed = true;
      };
    }

    getDesktopBridge()
      .readWorkspaceFile({ relativePath: selectedFile.relativePath })
      .then((result) => {
        if (!disposed) {
          setSelectedFileContent(result);
        }
      })
      .catch((previewError: unknown) => {
        if (!disposed) {
          setError(describeUnknownError(previewError));
        }
      });

    return () => {
      disposed = true;
    };
  }, [selectedFile]);

  const sendViewportIntent = async (
    action: ViewportIntent['action'],
    payload?: Readonly<Record<string, unknown>>,
  ): Promise<void> => {
    if (!snapshot) {
      throw new Error('Desktop snapshot is not loaded.');
    }
    const bridge = getDesktopBridge();
    const nextAck = await bridge.sendViewportIntent({
      viewportId: snapshot.viewport.id,
      action,
      source: 'renderer',
      ...(payload ? { payload } : {}),
    });
    setAck(nextAck);
  };

  const handleSurfaceSelect = (surfaceId: WorkbenchSurfaceId): void => {
    setActiveSurfaceId(surfaceId);
    const nextSurface = snapshot?.resourceSurfaces.find((surface) => surface.surfaceId === surfaceId);
    setSelectedNodeId(nextSurface?.nodes[0]?.id);
  };

  const handleActivitySelect = (surfaceId: string): void => {
    if (!isWorkbenchSurfaceId(surfaceId)) {
      throw new Error(`Unknown workbench surface: ${surfaceId}`);
    }
    handleSurfaceSelect(surfaceId);
  };

  const handleRightPanelSelect = (panelId: string): void => {
    if (!isRightPanelId(panelId)) {
      throw new Error(`Unknown right workbench panel: ${panelId}`);
    }
    setRightPanelId(panelId);
  };

  const handleEditorFileSelect = (fileId: string): void => {
    setSelectedFileId(fileId);
    setSelectedWorkspaceNodeId(fileId);
    setActiveSurfaceId('explorer');
    const file = snapshot ? findWorkspaceFile(snapshot.workspaceTree.nodes, fileId) : undefined;
    if (file?.editor) {
      setOpenFileIds((current) => (current.includes(fileId) ? current : [...current, fileId]));
    }
  };

  const handleWorkspaceNodeSelect = (nodeId: string): void => {
    setSelectedWorkspaceNodeId(nodeId);
    setActiveSurfaceId('explorer');
    const node = snapshot ? findWorkspaceFile(snapshot.workspaceTree.nodes, nodeId) : undefined;
    if (!node || node.kind === 'directory' || !node.editor) {
      return;
    }
    setSelectedFileId(nodeId);
    setOpenFileIds((current) => (current.includes(nodeId) ? current : [...current, nodeId]));
  };

  const handleNodeAction = (node: ResourceNode, action: ResourceActionDescriptor): void => {
    setSelectedNodeId(node.id);
    void sendViewportIntent('inspect', {
      resourceRef: node.ref,
      resourceActionId: action.id,
      resourceActionRisk: action.risk,
    }).catch((intentError: unknown) => {
      setError(describeUnknownError(intentError));
    });
  };

  const handleViewportIntent = (
    action: ViewportIntent['action'],
    payload?: Readonly<Record<string, unknown>>,
  ): void => {
    void sendViewportIntent(action, payload).catch((intentError: unknown) => {
      setError(describeUnknownError(intentError));
    });
  };

  if (error) {
    return <ErrorShell message={error} />;
  }

  if (!snapshot) {
    return (
      <main className="app-shell app-shell--loading">
        <div className="loading-panel">
          <span className="loading-panel__mark">NK</span>
          <span>{t('app.loading')}</span>
        </div>
      </main>
    );
  }

  return (
    <EditorWorkbenchShell
      className="desktop-workbench-shell"
      titleBar={<WorkbenchTitleBar snapshot={snapshot} />}
      activityBar={
        <WorkbenchActivityBar
          activeId={activeSurfaceId}
          items={snapshot.surfaces.map((surface) => ({
            id: surface.id,
            label: t(`surface.${surface.id}.label`),
            icon: <span>{surfaceShortLabels[surface.id]}</span>,
          }))}
          label={t('aria.workbenchSurfaces')}
          onSelect={handleActivitySelect}
        />
      }
      sidebar={
        <section className="workspace-pane" aria-label={t(`surface.${activeSurfaceId}.title`)}>
          {activeSurfaceId === 'explorer' ? (
            <WorkspaceExplorer
              snapshot={snapshot}
              selectedNodeId={selectedWorkspaceNodeId}
              onNodeSelect={handleWorkspaceNodeSelect}
            />
          ) : activeResourceSurface ? (
            <ManagementSurface
              surface={activeResourceSurface}
              selectedNodeId={selectedNode?.id}
              onSelect={setSelectedNodeId}
              onAction={handleNodeAction}
            />
          ) : null}
        </section>
      }
      editor={
        <section className="editor-pane" aria-label={t('aria.editorViewport')}>
          <WorkbenchEditorTabs
            activeId={selectedFile?.id}
            emptyLabel={t('selection.none')}
            label={t('aria.openEditors')}
            tabs={openFiles.map((file) => ({
              id: file.id,
              label: file.name,
              title: file.relativePath,
              icon: <span>{readFileIconLabel(file)}</span>,
            }))}
            onSelect={handleEditorFileSelect}
          />
          <CreativeEditorAdapterHost
            snapshot={snapshot}
            selectedFile={selectedFile}
            selectedFileContent={selectedFileContent}
            onIntent={handleViewportIntent}
          />
        </section>
      }
      secondarySidebar={
        <RightWorkbenchPanel
          activePanelId={rightPanelId}
          agent={
            <WorkbenchWebviewRuntimeFrame runtimeId="agent">
              <AgentWebviewRoot locale={snapshot.host.locale} />
            </WorkbenchWebviewRuntimeFrame>
          }
          inspector={
            <InspectorPanel
              ack={ack}
              selectedFile={selectedFile}
              selectedNode={selectedNode}
              snapshot={snapshot}
              onAction={handleNodeAction}
              onIntent={handleViewportIntent}
            />
          }
          onPanelSelect={handleRightPanelSelect}
        />
      }
      statusBar={
        <WorkbenchStatusBar
          label={t('aria.desktopStatus')}
          items={[
            snapshot.host.kind,
            `engine:${snapshot.viewport.availability}`,
            t('status.files', { count: snapshot.workspaceTree.totalFileCount }),
            t('status.media', { count: snapshot.workspaceTree.mediaFileCount }),
            snapshot.workspace.trust,
          ]}
        />
      }
    />
  );
}


function WorkbenchTitleBar({ snapshot }: { readonly snapshot: DesktopSnapshot }): ReactElement {
  const { t } = useTranslation();
  return (
    <header className="title-bar">
      <div className="title-bar__brand">
        <span className="title-bar__mark">NK</span>
        <strong>{t('title.brand')}</strong>
      </div>
      <nav className="title-bar__menu" aria-label={t('aria.workbenchMenu')}>
        <button type="button">{t('title.menu.file')}</button>
        <button type="button">{t('title.menu.edit')}</button>
        <button type="button">{t('title.menu.window')}</button>
        <button type="button">{t('title.menu.agent')}</button>
        <button type="button">{t('title.menu.render')}</button>
      </nav>
      <div className="title-bar__workspace">{snapshot.workspace.name}</div>
    </header>
  );
}

interface WorkspaceExplorerProps {
  readonly snapshot: DesktopSnapshot;
  readonly selectedNodeId: string | undefined;
  readonly onNodeSelect: (nodeId: string) => void;
}

function WorkspaceExplorer({
  onNodeSelect,
  selectedNodeId,
  snapshot,
}: WorkspaceExplorerProps): ReactElement {
  const { t } = useTranslation();
  const treeItems = useMemo(
    () => toTreeItems(snapshot.workspaceTree.nodes, t),
    [snapshot.workspaceTree.nodes, t],
  );
  const mediaNodes = useMemo(() => collectMediaFiles(snapshot.workspaceTree.nodes).slice(0, 18), [
    snapshot.workspaceTree.nodes,
  ]);

  return (
    <>
      <ExplorerTitleBar title={t('surface.explorer.title')} />
      <ExplorerToolbar label={t('explorer.directoryManagement')} />
      <TreeView
        className="workspace-file-tree"
        items={[
          {
            id: snapshot.workspaceTree.rootRef.id,
            label: snapshot.workspaceTree.rootName.toUpperCase(),
            title: snapshot.workspace.root,
            expanded: true,
            children: treeItems,
          },
        ]}
        label={t('explorer.fileTree')}
        selectedIds={selectedNodeId ? [selectedNodeId] : []}
        showStaticStateIndicators={false}
        virtualization={{ enabled: false, itemHeight: 22 }}
        onSelect={onNodeSelect}
      />
      <ExplorerBottomSections
        mediaCount={snapshot.workspaceTree.mediaFileCount}
        mediaItems={mediaNodes}
        selectedNodeId={selectedNodeId}
        onNodeSelect={onNodeSelect}
      />
    </>
  );
}

function ExplorerTitleBar({ title }: { readonly title: string }): ReactElement {
  const { t } = useTranslation();
  const moreActionsLabel = t('explorer.moreActions');
  return (
    <div className="explorer-titlebar">
      <span>{title}</span>
      <button aria-label={moreActionsLabel} type="button" title={moreActionsLabel}>
        <MoreHorizontalIcon size={15} />
      </button>
    </div>
  );
}

function ExplorerToolbar({
  label,
}: {
  readonly label: string;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <div className="explorer-toolbar" aria-label={label}>
      <span className="explorer-toolbar__spacer" aria-hidden="true" />
      <button aria-label={t('explorer.newFile')} type="button" title={t('explorer.newFile')}>
        <PlusIcon size={14} />
      </button>
      <button
        aria-label={t('explorer.newFolder')}
        type="button"
        title={t('explorer.newFolder')}
      >
        <FolderIcon size={14} />
      </button>
      <button aria-label={t('explorer.refresh')} type="button" title={t('explorer.refresh')}>
        <RefreshIcon size={14} />
      </button>
      <button
        aria-label={t('explorer.collapseAll')}
        type="button"
        title={t('explorer.collapseAll')}
      >
        <ChevronUpIcon size={14} />
      </button>
    </div>
  );
}

interface ExplorerBottomSectionsProps {
  readonly mediaCount: number;
  readonly mediaItems: readonly WorkspaceFileNode[];
  readonly selectedNodeId: string | undefined;
  readonly onNodeSelect: (nodeId: string) => void;
}

function ExplorerBottomSections({
  mediaCount,
  mediaItems,
  onNodeSelect,
  selectedNodeId,
}: ExplorerBottomSectionsProps): ReactElement {
  const { t } = useTranslation();
  return (
    <div className="explorer-bottom-sections">
      <details className="explorer-section explorer-section--media" open>
        <summary>
          <span>{t('explorer.media')}</span>
          <strong>{mediaCount}</strong>
        </summary>
        {mediaItems.length > 0 ? (
          <WorkbenchThumbnailStrip
            className="workspace-media-strip"
            count={mediaCount}
            items={mediaItems.map((node) => ({
              id: node.id,
              label: node.name,
              preview: <MediaThumbPreview node={node} />,
              selected: node.id === selectedNodeId,
              title: formatWorkspaceNodeTitle(node),
            }))}
            label={t('explorer.mediaThumbnails')}
            title={t('explorer.media')}
            onSelect={onNodeSelect}
          />
        ) : null}
      </details>
      <details className="explorer-section">
        <summary>
          <span>{t('explorer.outline')}</span>
        </summary>
      </details>
      <details className="explorer-section">
        <summary>
          <span>{t('explorer.timeline')}</span>
        </summary>
      </details>
    </div>
  );
}

interface ManagementSurfaceProps {
  readonly surface: DesktopSnapshot['resourceSurfaces'][number];
  readonly selectedNodeId: string | undefined;
  readonly onSelect: (nodeId: string) => void;
  readonly onAction: (node: ResourceNode, action: ResourceActionDescriptor) => void;
}

function ManagementSurface({
  onAction,
  onSelect,
  selectedNodeId,
  surface,
}: ManagementSurfaceProps): ReactElement {
  const { t } = useTranslation();
  return (
    <>
      <WorkbenchPanelHeader
        eyebrow={surface.description}
        title={t(`surface.${surface.surfaceId}.title`)}
        count={surface.nodes.length}
      />
      <div className="resource-list" aria-label={t(`surface.${surface.surfaceId}.description`)}>
        {surface.nodes.length === 0 ? (
          <p className="resource-list__empty">{t('surface.empty')}</p>
        ) : null}
        {surface.nodes.map((node) => (
          <WorkbenchListCard
            key={node.id}
            id={node.id}
            label={node.label}
            description={node.preview?.summary ?? node.ref.id}
            eyebrow={node.kind}
            thumbnail={<ResourceThumbnail node={node} />}
            metadata={readResourceMetadataItems(node)}
            badges={node.badges?.map((badge) => ({
              id: badge.label,
              label: badge.label,
              tone: badge.tone === 'info' ? 'info' : badge.tone,
            }))}
            actions={node.actions?.slice(0, 1).map((action) => ({
              id: action.id,
              label: action.label,
              onClick: () => onAction(node, action),
            }))}
            selected={node.id === selectedNodeId}
            onSelect={onSelect}
          />
        ))}
      </div>
    </>
  );
}

interface RightWorkbenchPanelProps {
  readonly activePanelId: RightPanelId;
  readonly agent: ReactNode;
  readonly inspector: ReactNode;
  readonly onPanelSelect: (panelId: string) => void;
}

function RightWorkbenchPanel({
  activePanelId,
  agent,
  inspector,
  onPanelSelect,
}: RightWorkbenchPanelProps): ReactElement {
  const { t } = useTranslation();
  return (
    <aside className="right-workbench-panel" aria-label={t('aria.secondarySidebar')}>
      <WorkbenchEditorTabs
        activeId={activePanelId}
        emptyLabel={t('selection.none')}
        label={t('aria.secondarySidebar')}
        tabs={[
          { id: 'agent', label: t('rightPanel.agent') },
          { id: 'inspector', label: t('rightPanel.inspector') },
        ]}
        onSelect={onPanelSelect}
      />
      <div className="right-workbench-panel__body">
        {activePanelId === 'agent' ? agent : inspector}
      </div>
    </aside>
  );
}

interface InspectorPanelProps {
  readonly ack: ViewportIntentAck | undefined;
  readonly selectedFile: WorkspaceFileNode | undefined;
  readonly selectedNode: ResourceNode | undefined;
  readonly snapshot: DesktopSnapshot;
  readonly onAction: (node: ResourceNode, action: ResourceActionDescriptor) => void;
  readonly onIntent: (
    action: ViewportIntent['action'],
    payload?: Readonly<Record<string, unknown>>,
  ) => void;
}

function InspectorPanel({
  ack,
  onAction,
  onIntent,
  selectedFile,
  selectedNode,
  snapshot,
}: InspectorPanelProps): ReactElement {
  const { t } = useTranslation();
  return (
    <section className="inspector-pane" aria-label={t('inspector.title')}>
      <WorkbenchPanelHeader
        eyebrow={t('inspector.title')}
        title={selectedFile?.name ?? selectedNode?.label ?? t('inspector.selection')}
        detail={selectedFile?.editor?.label ?? snapshot.viewport.availability}
      />
      <section className="inspector-section">
        <p>
          {selectedFile?.relativePath ??
            selectedNode?.preview?.summary ??
            t('selection.none')}
        </p>
        {selectedFile ? <WorkspaceFileMetadata file={selectedFile} /> : null}
        {selectedNode ? <ResourceMetadata node={selectedNode} /> : null}
      </section>
      {selectedFile?.editor ? <EditorAdapterPanel editor={selectedFile.editor} /> : null}
      <section className="inspector-section">
        <h3>{t('inspector.resourceActions')}</h3>
        <div className="inspector-actions">
          {selectedNode?.actions?.map((action) => (
            <button key={action.id} type="button" onClick={() => onAction(selectedNode, action)}>
              {action.label}
            </button>
          )) ?? <span>{t('inspector.noActions')}</span>}
        </div>
      </section>
      <ViewportControls
        ack={ack}
        selectedFile={selectedFile}
        availability={snapshot.viewport.availability}
        onIntent={onIntent}
      />
    </section>
  );
}

function EditorAdapterPanel({
  editor,
}: {
  readonly editor: DesktopEditorAdapterDescriptor;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <section className="inspector-section">
      <h3>{t('adapter.webview')}</h3>
      <dl className="resource-metadata">
        <div>
          <dt>{t('adapter.package')}</dt>
          <dd>{editor.packageName}</dd>
        </div>
        <div>
          <dt>{t('adapter.panel')}</dt>
          <dd>{editor.panelKind}</dd>
        </div>
        <div>
          <dt>{t('adapter.runtime')}</dt>
          <dd>{editor.desktopRuntime}</dd>
        </div>
      </dl>
    </section>
  );
}

interface ViewportControlsProps {
  readonly availability: DesktopSnapshot['viewport']['availability'];
  readonly selectedFile: WorkspaceFileNode | undefined;
  readonly ack: ViewportIntentAck | undefined;
  readonly onIntent: (
    action: ViewportIntent['action'],
    payload?: Readonly<Record<string, unknown>>,
  ) => void;
}

function ViewportControls({
  ack,
  availability,
  onIntent,
  selectedFile,
}: ViewportControlsProps): ReactElement {
  const { t } = useTranslation();
  return (
    <section className="viewport-controls">
      <div className="viewport-controls__summary">
        <span className={clsx('viewport-state', `viewport-state--${availability}`)}>{availability}</span>
        <strong>{t('viewport.control')}</strong>
      </div>
      <div className="viewport-controls__buttons">
        <button type="button" onClick={() => onIntent('activate')}>
          {t('viewport.activate')}
        </button>
        <button type="button" onClick={() => onIntent('play')}>
          {t('viewport.play')}
        </button>
        <button type="button" onClick={() => onIntent('pause')}>
          {t('viewport.pause')}
        </button>
        <button
          type="button"
          onClick={() =>
            onIntent('inspect', selectedFile ? { fileRef: selectedFile.relativePath } : undefined)
          }
        >
          {t('viewport.inspect')}
        </button>
      </div>
      {ack ? (
        <p className="viewport-controls__ack" data-accepted={ack.accepted ? 'true' : 'false'}>
          {t(ack.accepted ? 'viewport.accepted' : 'viewport.rejected')} · {ack.action}:{' '}
          {ack.diagnostic}
        </p>
      ) : null}
    </section>
  );
}

function WorkspaceFileMetadata({ file }: { readonly file: WorkspaceFileNode }): ReactElement {
  const items = [
    file.kind,
    file.editor?.packageName,
    file.sizeBytes !== undefined ? formatBytes(file.sizeBytes) : undefined,
  ].filter((item): item is string => Boolean(item));

  return <MetadataList items={items} />;
}

function ResourceMetadata({
  compact = false,
  node,
}: {
  readonly compact?: boolean;
  readonly node: ResourceNode;
}): ReactElement {
  return <MetadataList compact={compact} items={readResourceMetadataItems(node)} />;
}

function MetadataList({
  compact = false,
  items,
}: {
  readonly compact?: boolean;
  readonly items: readonly ReactNode[];
}): ReactElement {
  const { t } = useTranslation();
  return (
    <dl className={clsx('resource-metadata', compact && 'resource-metadata--compact')}>
      {items.map((item, index) => (
        <div key={index}>
          <dt>{t('resource.meta')}</dt>
          <dd>{item}</dd>
        </div>
      ))}
    </dl>
  );
}

function ResourceThumbnail({ node }: { readonly node: ResourceNode }): ReactElement {
  const style = node.thumbnail?.accent ? { backgroundColor: node.thumbnail.accent } : undefined;
  return <span style={style}>{node.thumbnail?.label ?? node.kind.slice(0, 3).toUpperCase()}</span>;
}

function MediaThumbPreview({ node }: { readonly node: WorkspaceFileNode }): ReactElement {
  if (node.kind === 'image' && node.thumbnail?.url) {
    return <img src={node.thumbnail.url} alt="" />;
  }
  if (node.kind === 'video' && node.thumbnail?.url) {
    return <video src={node.thumbnail.url} muted preload="metadata" />;
  }
  return <span>{node.thumbnail?.label ?? readFileIconLabel(node)}</span>;
}

function readResourceMetadataItems(node: ResourceNode): readonly ReactNode[] {
  const metadata = node.metadata;
  return [
    node.sourceId,
    metadata?.mediaType,
    metadata?.dimensions,
    metadata?.durationLabel,
    metadata?.colorSpace,
    metadata?.status,
  ].filter((item): item is string => Boolean(item));
}

function toTreeItems(
  nodes: readonly WorkspaceFileNode[],
  t: TranslateFn,
): readonly TreeViewItem<WorkspaceFileNode>[] {
  return nodes.map((node): TreeViewItem<WorkspaceFileNode> => {
    const scmDecoration = readTreeItemScmDecoration(node, t);
    return {
      id: node.id,
      label: node.name,
      title: formatWorkspaceNodeTitle(node),
      metadata: node,
      expanded: node.kind === 'directory' && shouldExpandDirectory(node.relativePath),
      icon: <WorkspaceFileIcon node={node} />,
      ...(scmDecoration
        ? {
            decoration: scmDecoration.decoration,
            decorationTitle: scmDecoration.title,
          }
        : {}),
      children: node.children ? toTreeItems(node.children, t) : undefined,
    };
  });
}

interface TreeItemScmDecoration {
  readonly decoration: ReactNode;
  readonly title: string;
}

function readTreeItemScmDecoration(
  node: WorkspaceFileNode,
  t: TranslateFn,
): TreeItemScmDecoration | undefined {
  if (node.kind === 'directory') {
    if (!hasScmDecoratedDescendant(node)) {
      return undefined;
    }
    return {
      decoration: (
        <span
          aria-hidden="true"
          className="workspace-file-scm workspace-file-scm--directory"
        />
      ),
      title: t('explorer.scm.directoryChanges'),
    };
  }

  if (!node.scmStatus) {
    return undefined;
  }

  return {
    decoration: (
      <span className={clsx('workspace-file-scm', `workspace-file-scm--${node.scmStatus}`)}>
        {readScmDecorationLabel(node.scmStatus)}
      </span>
    ),
    title: readScmDecorationTitle(node.scmStatus, t),
  };
}

function WorkspaceFileIcon({ node }: { readonly node: WorkspaceFileNode }): ReactElement {
  const className = `workspace-file-icon workspace-file-icon--${node.kind}`;
  const props = { className, size: 14, strokeWidth: 1.8 };
  switch (node.kind) {
    case 'directory':
      return <FolderIcon {...props} />;
    case 'timeline':
      return <ScissorsIcon {...props} />;
    case 'canvas':
    case 'sketch':
      return <LayersIcon {...props} />;
    case 'image':
      return <CameraIcon {...props} />;
    case 'video':
      return <PlayIcon {...props} />;
    case 'audio':
    case 'audio-project':
      return <VolumeIcon {...props} />;
    case 'model':
      return <PackageIcon {...props} />;
    case 'puppet':
      return <PackageIcon {...props} />;
    case 'story':
    case 'document':
    case 'config':
      return <CodeIcon {...props} />;
    case 'archive':
    case 'unknown':
      return <FileIcon {...props} />;
  }
}

function formatWorkspaceNodeTitle(node: WorkspaceFileNode): string {
  return [
    node.relativePath,
    node.kind,
    node.sizeBytes !== undefined ? formatBytes(node.sizeBytes) : undefined,
    node.modifiedAt ? formatModifiedAt(node.modifiedAt) : undefined,
    node.editor?.packageName,
  ]
    .filter((item): item is string => Boolean(item))
    .join(' · ');
}

function hasScmDecoratedDescendant(node: WorkspaceFileNode): boolean {
  return Boolean(
    node.children?.some((child) => child.scmStatus || hasScmDecoratedDescendant(child)),
  );
}

function readScmDecorationLabel(status: WorkspaceFileScmStatus): string {
  switch (status) {
    case 'added':
      return 'A';
    case 'modified':
      return 'M';
    case 'deleted':
      return 'D';
    case 'renamed':
      return 'R';
    case 'copied':
      return 'C';
    case 'conflicted':
      return '!';
    case 'untracked':
      return 'U';
    case 'ignored':
      return 'I';
  }
}

function readScmDecorationTitle(status: WorkspaceFileScmStatus, t: TranslateFn): string {
  return t(`explorer.scm.${status}`);
}

function isWorkbenchSurfaceId(surfaceId: string): surfaceId is WorkbenchSurfaceId {
  return Object.hasOwn(surfaceShortLabels, surfaceId);
}

function isRightPanelId(panelId: string): panelId is RightPanelId {
  return panelId === 'agent' || panelId === 'inspector';
}

function shouldExpandDirectory(relativePath: string): boolean {
  return (
    relativePath === '.neko' ||
    relativePath === 'neko' ||
    relativePath === 'neko/generated' ||
    relativePath === 'neko/generated/image'
  );
}

function collectInitialOpenFiles(nodes: readonly WorkspaceFileNode[]): readonly WorkspaceFileNode[] {
  const files = flattenWorkspaceFiles(nodes).filter((file) => Boolean(file.editor));
  const preferredOrder = ['timeline', 'canvas', 'audio-project', 'sketch', 'model', 'story'];
  return files
    .sort((left, right) => {
      const leftIndex = preferredOrder.indexOf(left.kind);
      const rightIndex = preferredOrder.indexOf(right.kind);
      return normalizeSortIndex(leftIndex) - normalizeSortIndex(rightIndex);
    })
    .slice(0, 4);
}

function collectMediaFiles(nodes: readonly WorkspaceFileNode[]): readonly WorkspaceFileNode[] {
  const buckets = new Map<MediaPreviewFileKind, WorkspaceFileNode[]>(
    MEDIA_PREVIEW_KIND_ORDER.map((kind) => [kind, []]),
  );

  for (const node of flattenWorkspaceFiles(nodes)) {
    if (isMediaPreviewFile(node)) {
      buckets.get(node.kind)?.push(node);
    }
  }

  const result: WorkspaceFileNode[] = [];
  let appended = true;
  while (appended) {
    appended = false;
    for (const kind of MEDIA_PREVIEW_KIND_ORDER) {
      const next = buckets.get(kind)?.shift();
      if (next) {
        result.push(next);
        appended = true;
      }
    }
  }
  return result;
}

function isMediaPreviewFile(node: WorkspaceFileNode): node is WorkspaceFileNode & {
  readonly kind: MediaPreviewFileKind;
} {
  return MEDIA_PREVIEW_KIND_ORDER.some((kind) => kind === node.kind);
}

function shouldReadSelectedFileContent(file: WorkspaceFileNode): boolean {
  return file.editor?.kind === 'code' || file.editor?.panelKind === 'cut-timeline';
}

function flattenWorkspaceFiles(nodes: readonly WorkspaceFileNode[]): readonly WorkspaceFileNode[] {
  return nodes.flatMap((node) => [node, ...(node.children ? flattenWorkspaceFiles(node.children) : [])]);
}

function findWorkspaceFile(
  nodes: readonly WorkspaceFileNode[],
  fileId: string,
): WorkspaceFileNode | undefined {
  for (const node of nodes) {
    if (node.id === fileId) {
      return node;
    }
    const child = node.children ? findWorkspaceFile(node.children, fileId) : undefined;
    if (child) {
      return child;
    }
  }
  return undefined;
}

function readFileIconLabel(file: WorkspaceFileNode): string {
  return file.thumbnail?.label ?? file.kind.slice(0, 3).toUpperCase();
}

function normalizeSortIndex(index: number): number {
  return index === -1 ? 999 : index;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatModifiedAt(value: string): string {
  return new Date(value).toLocaleString();
}

function ErrorShell({ message }: { readonly message: string }): ReactElement {
  const { t } = useTranslation();
  return (
    <main className="app-shell app-shell--loading">
      <section className="error-panel">
        <h1>{t('app.startFailed')}</h1>
        <p>{message}</p>
      </section>
    </main>
  );
}

function describeUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
