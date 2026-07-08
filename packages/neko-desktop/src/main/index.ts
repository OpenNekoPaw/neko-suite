import { app, BrowserWindow, dialog, ipcMain, net, protocol } from 'electron';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { normalizeLocale } from '@neko/shared';
import desktopPackage from '../../package.json';
import {
  DESKTOP_BRIDGE_CHANNELS,
  normalizeReadWorkspaceFileRequest,
  normalizeViewportIntent,
  type DesktopSnapshot,
  type ReadWorkspaceFileResult,
  type ViewportIntentAck,
} from '../shared/contracts';
import { createDesktopMvpSnapshot } from '../shared/desktop-fixtures';
import {
  NEKO_RESOURCE_SCHEME,
  createWorkspaceFileTreeSnapshot,
} from './workspace-scan';
import { createDesktopResourceSurfaces } from './desktop-resource-surfaces';
import {
  createEngineViewportSummary,
  createViewportIntentAck,
  probeEngineConnection,
} from './engine-connection';

const DEFAULT_WINDOW_WIDTH = 1440;
const DEFAULT_WINDOW_HEIGHT = 920;
const DESKTOP_VERSION = desktopPackage.version;
const MAX_TEXT_FILE_BYTES = 256 * 1024;
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

function registerDesktopBridgeHandlers(): void {
  if (bridgeHandlersRegistered) {
    return;
  }

  ipcMain.handle(DESKTOP_BRIDGE_CHANNELS.getSnapshot, () => createDesktopSnapshot());
  ipcMain.handle(
    DESKTOP_BRIDGE_CHANNELS.readWorkspaceFile,
    async (_event, rawRequest): Promise<ReadWorkspaceFileResult> => {
      const request = normalizeReadWorkspaceFileRequest(rawRequest);
      const absolutePath = resolveWorkspaceFilePath(request.relativePath);
      const content = await readFile(absolutePath);
      const truncated = content.byteLength > MAX_TEXT_FILE_BYTES;
      const selectedContent = truncated ? content.subarray(0, MAX_TEXT_FILE_BYTES) : content;
      return {
        relativePath: request.relativePath,
        content: selectedContent.toString('utf8'),
        encoding: 'utf8',
        truncated,
      };
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

  bridgeHandlersRegistered = true;
}

function resolveWorkspaceFilePath(workspaceRelativePath: string): string {
  const workspaceRoot = resolveWorkspaceRoot();
  const absolutePath = resolve(workspaceRoot, workspaceRelativePath);
  const relativeToWorkspace = relative(workspaceRoot, absolutePath);

  if (
    relativeToWorkspace.length === 0 ||
    relativeToWorkspace.startsWith('..') ||
    isAbsolute(relativeToWorkspace)
  ) {
    throw new Error(`Workspace file path is outside the workspace: ${workspaceRelativePath}`);
  }

  return absolutePath;
}

async function createDesktopSnapshot(): Promise<DesktopSnapshot> {
  const workspaceRoot = resolveWorkspaceRoot();
  const [workspaceTree, resourceSurfaces, engineStatus] = await Promise.all([
    createWorkspaceFileTreeSnapshot(workspaceRoot),
    createDesktopResourceSurfaces({ workspaceRoot }),
    probeEngineConnection(),
  ]);
  return createDesktopMvpSnapshot({
    workspaceRoot,
    workspaceName: basename(workspaceRoot) || 'Neko Workspace',
    version: DESKTOP_VERSION,
    locale: normalizeLocale(app.getLocale()),
    resourceSurfaces,
    workspaceTree,
    viewport: createEngineViewportSummary(engineStatus),
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
      absolutePath = resolveWorkspaceFilePath(relativePath);
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
