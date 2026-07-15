import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { ConfigManager, FileUserConfigManager } from '@neko/platform/config/index';
import {
  NEKO_APPLICATION_CONTRACT_VERSION,
  parseNekoApplicationHandoffRequest,
  type NekoApplicationIdentity,
} from '@neko/host/application';
import homePackage from '../../package.json';
import {
  HOME_BRIDGE_CHANNELS,
  normalizeHomeSessionOperationRequest,
  type HomeSnapshot,
} from '../shared/contracts';
import { createHomeApplicationHandoffPort } from './application-handoff';
import { probeHomeEngineCore } from './engine-core-connection';
import {
  InMemoryHomeAgentConversationRuntime,
  handleRawHomeAgentRuntimeMessageRequest,
  type HomeAgentConversationRuntime,
  type HomeAgentSnapshotRuntime,
} from './home-agent-webview-host';
import { createHomeAgentConversationFileStorage } from './home-agent-conversation-storage';
import { InMemoryHomeAgentProjectionRuntime } from './home-agent-projection-runtime';
import { createHomeSkillFileSnapshotRuntime } from './home-agent-snapshot-runtime';
import { createElectronHomeCommandExecutor } from './home-electron-command-executor';
import { createHomeResourceSurfaceSnapshot } from './home-resource-surfaces';
import { createHomeProjectFileIoAdapter } from './home-workspace-file-io';
import { HomeSessionRuntimeRegistry } from './home-session-runtime';

const HOME_WINDOW = { width: 1280, height: 820, minWidth: 920, minHeight: 640 } as const;
const applicationIdentity: NekoApplicationIdentity = {
  schemaVersion: NEKO_APPLICATION_CONTRACT_VERSION,
  applicationId: 'neko-home',
  instanceId: randomUUID(),
  version: homePackage.version,
};

let mainWindow: BrowserWindow | undefined;
let handlersRegistered = false;
let configRuntime: { root: string; user: FileUserConfigManager; config: ConfigManager } | undefined;
let conversationRuntime: { root: string; runtime: HomeAgentConversationRuntime; projection: InMemoryHomeAgentProjectionRuntime } | undefined;
let snapshotRuntime: { root: string; runtime: HomeAgentSnapshotRuntime } | undefined;
let sessionRuntime: { root: string; registry: HomeSessionRuntimeRegistry } | undefined;

function registerBridgeHandlers(): void {
  if (handlersRegistered) return;
  ipcMain.handle(HOME_BRIDGE_CHANNELS.getSnapshot, createHomeSnapshot);
  ipcMain.handle(HOME_BRIDGE_CHANNELS.sendAgentRuntimeMessage, (_event, request) =>
    handleRawHomeAgentRuntimeMessageRequest(request, {
      getConfigManager: () => getConfigRuntime().config,
      getConversationRuntime: getConversationRuntime,
      getCommandExecutor: () =>
        createElectronHomeCommandExecutor({
          workspaceRoot: resolveHomeWorkspaceRoot(),
          getProjectFileIo: () =>
            createHomeProjectFileIoAdapter({ workspaceRoot: resolveHomeWorkspaceRoot() }),
          shell,
          dialog,
        }),
      getProjectionRuntime: getProjectionRuntime,
      getSnapshotRuntime: getSnapshotRuntime,
    }),
  );
  ipcMain.handle(HOME_BRIDGE_CHANNELS.manageSession, (_event, rawRequest) => {
    const request = normalizeHomeSessionOperationRequest(rawRequest);
    const registry = getSessionRuntimeRegistry();
    const session = (() => {
      switch (request.type) {
        case 'create':
          return registry.createSession(request.config);
        case 'select':
          return registry.selectSession(request.sessionId);
        case 'queue':
          return registry.enqueue(request, request.prompt);
        case 'cancel':
          return registry.cancel(request);
        case 'resume':
          return registry.resume(request);
      }
    })();
    return { sessionId: session.sessionId, runtimeId: session.runtimeId, status: session.status };
  });
  ipcMain.handle(HOME_BRIDGE_CHANNELS.handoff, async (_event, rawRequest) => {
    const request = parseNekoApplicationHandoffRequest(rawRequest, {
      expectedSource: applicationIdentity,
    });
    return createHomeApplicationHandoffPort(shell).handoff(request);
  });
  handlersRegistered = true;
}

async function createHomeSnapshot(): Promise<HomeSnapshot> {
  const workspaceRoot = resolveHomeWorkspaceRoot();
  mkdirSync(workspaceRoot, { recursive: true });
  const [engine, resources] = await Promise.all([
    probeHomeEngineCore(),
    createHomeResourceSurfaceSnapshot({ workspaceRoot }),
  ]);
  const sessions = getSessionRuntimeRegistry();
  return {
    application: applicationIdentity,
    workspace: {
      workspaceId: process.env.NEKO_HOME_WORKSPACE_ID?.trim() || 'personal',
      kind: 'personal',
      label: 'Personal Workspace',
    },
    engine,
    resourceSurfaces: resources.resourceSurfaces,
    resourceProviders: resources.providerSnapshots,
    sessionProjection: {
      ...(sessions.getSelectedSessionId()
        ? { selectedSessionId: sessions.getSelectedSessionId() }
        : {}),
      sessions: sessions.listSessions().map((session) => ({
        sessionId: session.sessionId,
        runtimeId: session.runtimeId,
        status: session.status,
        queuedCount: session.queue.filter((item) => item.status === 'queued').length,
        taskCount: session.tasks.length,
      })),
    },
  };
}

function getSessionRuntimeRegistry(): HomeSessionRuntimeRegistry {
  const root = resolveHomeWorkspaceRoot();
  if (sessionRuntime?.root === root) return sessionRuntime.registry;
  const registry = new HomeSessionRuntimeRegistry();
  registry.createSession({ workspaceRoot: root });
  sessionRuntime = { root, registry };
  return registry;
}

function getConfigRuntime() {
  const root = resolveHomeWorkspaceRoot();
  if (configRuntime?.root === root) return configRuntime;
  configRuntime?.config.dispose();
  configRuntime?.user.dispose();
  const user = new FileUserConfigManager();
  configRuntime = { root, user, config: new ConfigManager({ userConfigManager: user, workspacePath: root }) };
  return configRuntime;
}

function getConversationRuntime(): HomeAgentConversationRuntime {
  const root = resolveHomeWorkspaceRoot();
  if (conversationRuntime?.root === root) return conversationRuntime.runtime;
  const runtime = new InMemoryHomeAgentConversationRuntime({
    storage: createHomeAgentConversationFileStorage({ workspaceRoot: root }),
  });
  conversationRuntime = { root, runtime, projection: new InMemoryHomeAgentProjectionRuntime() };
  return runtime;
}

function getProjectionRuntime(): InMemoryHomeAgentProjectionRuntime {
  getConversationRuntime();
  if (!conversationRuntime) throw new Error('Home Agent projection runtime is unavailable.');
  return conversationRuntime.projection;
}

function getSnapshotRuntime(): HomeAgentSnapshotRuntime {
  const root = resolveHomeWorkspaceRoot();
  if (snapshotRuntime?.root === root) return snapshotRuntime.runtime;
  snapshotRuntime = { root, runtime: createHomeSkillFileSnapshotRuntime({ workspaceRoot: root }) };
  return snapshotRuntime.runtime;
}

function resolveHomeWorkspaceRoot(): string {
  const configured = process.env.NEKO_HOME_WORKSPACE?.trim();
  return configured ? resolve(configured) : join(app.getPath('userData'), 'personal-workspace');
}

async function createWindow(): Promise<void> {
  registerBridgeHandlers();
  mainWindow = new BrowserWindow({
    ...HOME_WINDOW,
    title: 'Neko Home',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  const devUrl = process.env.NEKO_HOME_RENDERER_URL?.trim();
  if (devUrl) await mainWindow.loadURL(devUrl);
  else await mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  mainWindow.on('closed', () => {
    mainWindow = undefined;
  });
}

app.whenReady().then(createWindow).catch((error: unknown) => {
  process.stderr.write(`Neko Home startup failed: ${error instanceof Error ? error.message : String(error)}\n`);
  app.exit(1);
});

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => {
  configRuntime?.config.dispose();
  configRuntime?.user.dispose();
});
