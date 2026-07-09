import { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } from 'electron';
import { existsSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { normalizeLocale } from '@neko/shared';
import { ConfigManager, FileUserConfigManager } from '@neko/platform/config/index';
import desktopPackage from '../../package.json';
import {
  DESKTOP_BRIDGE_CHANNELS,
  normalizeReadWorkspaceFileRequest,
  normalizeViewportIntent,
  normalizeWriteWorkspaceFileRequest,
  type DesktopFeatureWebviewHostMessageResult,
  type DesktopSnapshot,
  type ReadWorkspaceFileResult,
  type ViewportIntentAck,
  type WriteWorkspaceFileResult,
} from '../shared/contracts';
import { createDesktopAppHostSnapshot } from '../shared/desktop-fixtures';
import {
  NEKO_RESOURCE_SCHEME,
} from './workspace-scan';
import { createDesktopWorkspaceResourceProviderSnapshot } from './workspace-resource-provider';
import { createDesktopResourceSurfaceSnapshot } from './desktop-resource-surfaces';
import {
  createEngineViewportSummary,
  createViewportIntentAck,
  probeEngineConnection,
} from './engine-connection';
import { createDesktopProjectFileIoAdapter } from './project-file-io';
import { createDesktopWorkbenchBootstrapSnapshot } from '../shared/desktop-workbench-adapter';
import {
  InMemoryDesktopAgentConversationRuntime,
  type DesktopAgentConversationRuntime,
  type DesktopAgentSnapshotRuntime,
  handleRawDesktopAgentRuntimeMessageRequest,
} from './agent-webview-host';
import {
  createElectronDesktopCommandExecutor,
  type ElectronSaveDialogPort,
  type ElectronShellPort,
} from './desktop-electron-command-executor';
import { createDesktopAgentConversationFileStorage } from './desktop-agent-conversation-storage';
import { createDesktopSkillFileSnapshotRuntime } from './desktop-agent-snapshot-runtime';
import { handleRawDesktopFeatureWebviewMessage } from './feature-webview-host';

const DEFAULT_WINDOW_WIDTH = 1440;
const DEFAULT_WINDOW_HEIGHT = 920;
const DESKTOP_VERSION = desktopPackage.version;
const MACOS_TRAFFIC_LIGHT_POSITION = { x: 18, y: 14 } as const;

protocol.registerSchemesAsPrivileged([
  {
    scheme: NEKO_RESOURCE_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      stream: true,
      supportFetchAPI: true,
    },
  },
]);

let mainWindow: BrowserWindow | undefined;
let bridgeHandlersRegistered = false;
let agentConfigRuntime: DesktopAgentConfigRuntime | undefined;
let agentConversationRuntime: DesktopAgentConversationRuntimeState | undefined;
let agentSnapshotRuntime: DesktopAgentSnapshotRuntimeState | undefined;

interface DesktopAgentConfigRuntime {
  readonly workspaceRoot: string;
  readonly userConfigManager: FileUserConfigManager;
  readonly configManager: ConfigManager;
}

interface DesktopAgentSnapshotRuntimeState {
  readonly workspaceRoot: string;
  readonly runtime: DesktopAgentSnapshotRuntime;
}

interface DesktopAgentConversationRuntimeState {
  readonly workspaceRoot: string;
  readonly runtime: DesktopAgentConversationRuntime;
}

function registerDesktopBridgeHandlers(): void {
  if (bridgeHandlersRegistered) {
    return;
  }

  ipcMain.handle(DESKTOP_BRIDGE_CHANNELS.getSnapshot, () => createDesktopSnapshot());
  ipcMain.handle(
    DESKTOP_BRIDGE_CHANNELS.readWorkspaceFile,
    async (_event, rawRequest): Promise<ReadWorkspaceFileResult> => {
      const request = normalizeReadWorkspaceFileRequest(rawRequest);
      return getDesktopProjectFileIoAdapter().readWorkspaceTextFile(request);
    },
  );
  ipcMain.handle(
    DESKTOP_BRIDGE_CHANNELS.writeWorkspaceFile,
    async (_event, rawRequest): Promise<WriteWorkspaceFileResult> => {
      const request = normalizeWriteWorkspaceFileRequest(rawRequest);
      return getDesktopProjectFileIoAdapter().writeWorkspaceTextFile(request);
    },
  );
  ipcMain.handle(
    DESKTOP_BRIDGE_CHANNELS.sendViewportIntent,
    async (_event, rawIntent): Promise<ViewportIntentAck> => {
      const intent = normalizeViewportIntent(rawIntent);
      const engineStatus = await probeEngineConnection();
      return createViewportIntentAck(intent, createEngineViewportSummary(engineStatus));
    },
  );
  ipcMain.handle(
    DESKTOP_BRIDGE_CHANNELS.sendFeatureWebviewMessage,
    async (_event, rawRequest): Promise<DesktopFeatureWebviewHostMessageResult> => {
      return handleRawDesktopFeatureWebviewMessage(rawRequest, {
        getProjectFileIo: () => getDesktopProjectFileIoAdapter(),
        probeEngineConnection,
      });
    },
  );
  ipcMain.handle(
    DESKTOP_BRIDGE_CHANNELS.sendAgentRuntimeMessage,
    async (_event, rawRequest) =>
      handleRawDesktopAgentRuntimeMessageRequest(rawRequest, {
        getConfigManager: () => getDesktopAgentConfigRuntime().configManager,
        getConversationRuntime: () => getDesktopAgentConversationRuntime(),
        getCommandExecutor: () => getDesktopCommandExecutor(),
        getSnapshotRuntime: () => getDesktopAgentSnapshotRuntime(),
      }),
  );
  bridgeHandlersRegistered = true;
}

function getDesktopAgentConfigRuntime(): DesktopAgentConfigRuntime {
  const workspaceRoot = resolveWorkspaceRoot();
  if (agentConfigRuntime?.workspaceRoot === workspaceRoot) {
    return agentConfigRuntime;
  }

  disposeDesktopAgentConfigRuntime();
  const userConfigManager = new FileUserConfigManager();
  const configManager = new ConfigManager({
    userConfigManager,
    workspacePath: workspaceRoot,
  });
  agentConfigRuntime = {
    workspaceRoot,
    userConfigManager,
    configManager,
  };
  return agentConfigRuntime;
}

function getDesktopAgentSnapshotRuntime(): DesktopAgentSnapshotRuntime {
  const workspaceRoot = resolveWorkspaceRoot();
  if (agentSnapshotRuntime?.workspaceRoot === workspaceRoot) {
    return agentSnapshotRuntime.runtime;
  }

  agentSnapshotRuntime = {
    workspaceRoot,
    runtime: createDesktopSkillFileSnapshotRuntime({ workspaceRoot }),
  };
  return agentSnapshotRuntime.runtime;
}

function getDesktopAgentConversationRuntime(): DesktopAgentConversationRuntime {
  const workspaceRoot = resolveWorkspaceRoot();
  if (agentConversationRuntime?.workspaceRoot === workspaceRoot) {
    return agentConversationRuntime.runtime;
  }

  agentConversationRuntime = {
    workspaceRoot,
    runtime: new InMemoryDesktopAgentConversationRuntime({
      storage: createDesktopAgentConversationFileStorage({ workspaceRoot }),
    }),
  };
  return agentConversationRuntime.runtime;
}

function getDesktopCommandExecutor() {
  const workspaceRoot = resolveWorkspaceRoot();
  return createElectronDesktopCommandExecutor({
    workspaceRoot,
    getProjectFileIo: () => getDesktopProjectFileIoAdapter(),
    shell: shell as ElectronShellPort,
    dialog: dialog as ElectronSaveDialogPort,
  });
}

function getDesktopProjectFileIoAdapter() {
  return createDesktopProjectFileIoAdapter({ workspaceRoot: resolveWorkspaceRoot() });
}

function disposeDesktopAgentConfigRuntime(): void {
  agentConfigRuntime?.configManager.dispose();
  agentConfigRuntime?.userConfigManager.dispose();
  agentConfigRuntime = undefined;
}

async function createDesktopSnapshot(): Promise<DesktopSnapshot> {
  const workspaceRoot = resolveWorkspaceRoot();
  const [workspaceResourceProvider, resourceSurfaceSnapshot, engineStatus] = await Promise.all([
    createDesktopWorkspaceResourceProviderSnapshot(workspaceRoot),
    createDesktopResourceSurfaceSnapshot({ workspaceRoot }),
    probeEngineConnection(),
  ]);
  const resourceProviders = [
    workspaceResourceProvider.providerSnapshot,
    ...resourceSurfaceSnapshot.providerSnapshots,
  ];
  const viewport = createEngineViewportSummary(engineStatus);
  const baseSnapshot = createDesktopAppHostSnapshot({
    workspaceRoot,
    workspaceName: basename(workspaceRoot) || 'Neko Workspace',
    version: DESKTOP_VERSION,
    locale: normalizeLocale(app.getLocale()),
    resourceSurfaces: resourceSurfaceSnapshot.resourceSurfaces,
    workspaceTree: workspaceResourceProvider.workspaceTree,
    workbench: {
      contributionSnapshot: {
        contributions: [],
        diagnostics: [],
        temporaryBootstrapContributionIds: [],
      },
      resourceProviders,
      diagnostics: resourceProviders.flatMap((provider) => provider.diagnostics),
    },
    viewport,
  });
  const contributionSnapshot = createDesktopWorkbenchBootstrapSnapshot(baseSnapshot);
  return createDesktopAppHostSnapshot({
    workspaceRoot,
    workspaceName: basename(workspaceRoot) || 'Neko Workspace',
    version: DESKTOP_VERSION,
    locale: normalizeLocale(app.getLocale()),
    resourceSurfaces: resourceSurfaceSnapshot.resourceSurfaces,
    workspaceTree: workspaceResourceProvider.workspaceTree,
    workbench: {
      contributionSnapshot,
      resourceProviders,
      diagnostics: [
        ...contributionSnapshot.diagnostics,
        ...resourceProviders.flatMap((provider) => provider.diagnostics),
      ],
    },
    viewport,
  });
}

function resolveWorkspaceRoot(): string {
  const configuredRoot = process.env['NEKO_DESKTOP_WORKSPACE'];
  if (configuredRoot && configuredRoot.trim().length > 0) {
    return resolve(configuredRoot);
  }
  const repoSiblingTestWorkspace = resolve(__dirname, '../../../..', 'neko-test');
  if (existsSync(repoSiblingTestWorkspace)) {
    return repoSiblingTestWorkspace;
  }
  const cwdSiblingTestWorkspace = resolve(process.cwd(), '../neko-test');
  if (existsSync(cwdSiblingTestWorkspace)) {
    return cwdSiblingTestWorkspace;
  }
  return process.cwd();
}

function registerWorkspaceResourceProtocol(): void {
  protocol.handle(NEKO_RESOURCE_SCHEME, async (request) => {
    const requestUrl = new URL(request.url);
    if (requestUrl.host !== 'workspace') {
      return new Response('Unknown Neko resource host.', { status: 404 });
    }

    const relativePath = decodeURIComponent(requestUrl.pathname.slice(1));
    let absolutePath: string;
    try {
      absolutePath = getDesktopProjectFileIoAdapter().resolveWorkspacePath(relativePath);
    } catch (_error: unknown) {
      return new Response('Neko resource path is outside the workspace.', { status: 403 });
    }
    if (!existsSync(absolutePath)) {
      return new Response('Neko resource path was not found.', { status: 404 });
    }

    return net.fetch(pathToFileURL(absolutePath).toString());
  });
}

async function createMainWindow(): Promise<void> {
  const macosWindowChrome =
    process.platform === 'darwin'
      ? {
          titleBarStyle: 'hiddenInset' as const,
          trafficLightPosition: MACOS_TRAFFIC_LIGHT_POSITION,
        }
      : {};
  const window = new BrowserWindow({
    width: DEFAULT_WINDOW_WIDTH,
    height: DEFAULT_WINDOW_HEIGHT,
    minWidth: 1024,
    minHeight: 720,
    backgroundColor: '#11161d',
    title: 'Neko Desktop',
    ...macosWindowChrome,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(__dirname, '../preload/index.cjs'),
    },
  });

  mainWindow = window;
  window.on('closed', () => {
    if (mainWindow === window) {
      mainWindow = undefined;
    }
  });

  const rendererDevServerUrl = process.env['NEKO_DESKTOP_RENDERER_URL'];
  if (rendererDevServerUrl && rendererDevServerUrl.trim().length > 0) {
    await window.loadURL(rendererDevServerUrl);
    return;
  }

  await window.loadFile(join(__dirname, '../renderer/index.html'));
}

async function openMainWindow(): Promise<void> {
  if (mainWindow) {
    mainWindow.show();
    mainWindow.focus();
    return;
  }
  await createMainWindow();
}

function showStartupError(error: unknown): void {
  dialog.showErrorBox('Neko Desktop startup failed', describeUnknownError(error));
}

function describeUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

app
  .whenReady()
  .then(async () => {
    registerWorkspaceResourceProtocol();
    registerDesktopBridgeHandlers();
    await openMainWindow();

    app.on('activate', () => {
      void openMainWindow().catch(showStartupError);
    });
  })
  .catch((error: unknown) => {
    showStartupError(error);
    app.exit(1);
  });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  disposeDesktopAgentConfigRuntime();
});
