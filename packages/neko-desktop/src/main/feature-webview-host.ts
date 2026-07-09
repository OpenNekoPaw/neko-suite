import {
  normalizeDesktopFeatureWebviewMessageRequest,
  type DesktopFeatureWebviewDiagnostic,
  type DesktopFeatureWebviewHostMessage,
  type DesktopFeatureWebviewHostMessageResult,
  type DesktopFeatureWebviewMessageRequest,
} from '../shared/contracts';
import type { DesktopProjectFileIoAdapter } from './project-file-io';
import type { EngineConnectionStatus } from './engine-connection';
import {
  handleDesktopCutMediaMessage,
  type DesktopCutMediaHostDeps,
} from './cut-media-host';

export interface DesktopFeatureWebviewHostDeps {
  readonly getProjectFileIo: () => DesktopProjectFileIoAdapter;
  readonly probeEngineConnection: () => Promise<EngineConnectionStatus>;
  readonly createEngineClient?: DesktopCutMediaHostDeps['createEngineClient'];
}

export async function handleRawDesktopFeatureWebviewMessage(
  rawRequest: unknown,
  deps: DesktopFeatureWebviewHostDeps,
): Promise<DesktopFeatureWebviewHostMessageResult> {
  let request: DesktopFeatureWebviewMessageRequest;
  try {
    request = normalizeDesktopFeatureWebviewMessageRequest(rawRequest);
  } catch (error: unknown) {
    return createDiagnosticResult({
      code: 'invalid-feature-webview-message',
      message: `Desktop feature Webview request is invalid: ${describeUnknownError(error)}`,
    });
  }

  try {
    return {
      runtimeId: request.runtimeId,
      messages: await handleDesktopFeatureWebviewMessage(request, deps),
    };
  } catch (error: unknown) {
    return createDiagnosticResult({
      code: 'feature-webview-document-load-failed',
      runtimeId: request.runtimeId,
      panelKind: request.panelKind,
      message: describeUnknownError(error),
    });
  }
}

async function handleDesktopFeatureWebviewMessage(
  request: DesktopFeatureWebviewMessageRequest,
  deps: DesktopFeatureWebviewHostDeps,
): Promise<readonly DesktopFeatureWebviewHostMessage[]> {
  const route = readMessageRoute(request.message);
  if (!route) {
    return [
      createDiagnosticMessage({
        code: 'invalid-feature-webview-message',
        runtimeId: request.runtimeId,
        panelKind: request.panelKind,
        message: 'Desktop feature Webview message must contain a string type.',
      }),
    ];
  }

  const cutMediaMessages = await handleDesktopCutMediaMessage(request, deps);
  if (cutMediaMessages) {
    return cutMediaMessages;
  }

  switch (route) {
    case 'ready':
      return loadInitialDocumentMessages(request, deps);
    case 'requestEnginePort':
      return requestEnginePortMessages(request, deps);
    case 'document:save':
      return saveSketchDocumentMessages(request, deps);
    case 'canvasDataReady':
    case 'modelStatus':
    case 'operationApplied':
    case 'webviewKeyboardFocus':
    case 'webviewKeyboardEditable':
      return [];
    default:
      return [
        createDiagnosticMessage({
          code: 'unsupported-feature-webview-route',
          runtimeId: request.runtimeId,
          panelKind: request.panelKind,
          route,
          message: `Desktop feature Webview route is not implemented: ${route}`,
        }),
      ];
  }
}

async function loadInitialDocumentMessages(
  request: DesktopFeatureWebviewMessageRequest,
  deps: DesktopFeatureWebviewHostDeps,
): Promise<readonly DesktopFeatureWebviewHostMessage[]> {
  switch (request.runtimeId) {
    case '@neko-canvas/webview/root':
      return [
        {
          type: 'canvas.hostAppliedDocument',
          data: await readJsonDocument(request, deps),
        },
      ];
    case '@neko-audio/webview/root':
      return [
        {
          type: 'project:init',
          payload: {
            projectData: await readJsonDocument(request, deps),
            waveforms: {},
          },
        },
      ];
    case '@neko-sketch/webview/root':
      return [
        {
          type: 'document:load',
          data: await readJsonDocument(request, deps),
        },
        {
          type: 'featureFlags:update',
          flags: {
            psdImportEnabled: false,
            aiOps: {
              enabled: false,
              operations: {},
            },
          },
        },
      ];
    case '@neko-model/webview/root':
      return [
        {
          type: 'documentContext',
          context: {
            owner: 'neko-model',
            documentKind: request.relativePath.endsWith('.nkm') ? 'nkm' : 'model-asset',
            sceneProfile: '3d',
          },
        },
        ...(await requestEnginePortMessages(request, deps)),
      ];
    case '@neko/webview/root':
    case '@neko/preview-webview/host-adapter':
      return [];
  }
}

async function requestEnginePortMessages(
  request: DesktopFeatureWebviewMessageRequest,
  deps: DesktopFeatureWebviewHostDeps,
): Promise<readonly DesktopFeatureWebviewHostMessage[]> {
  if (request.runtimeId !== '@neko-model/webview/root') {
    return [
      createDiagnosticMessage({
        code: 'unsupported-feature-webview-route',
        runtimeId: request.runtimeId,
        panelKind: request.panelKind,
        route: 'requestEnginePort',
        message: `Engine port requests are only supported by @neko-model/webview/root.`,
      }),
    ];
  }

  const status = await deps.probeEngineConnection();
  return status.reachable ? [{ type: 'enginePort', port: status.port }] : [];
}

async function saveSketchDocumentMessages(
  request: DesktopFeatureWebviewMessageRequest,
  deps: DesktopFeatureWebviewHostDeps,
): Promise<readonly DesktopFeatureWebviewHostMessage[]> {
  if (request.runtimeId !== '@neko-sketch/webview/root') {
    return [
      createDiagnosticMessage({
        code: 'unsupported-feature-webview-route',
        runtimeId: request.runtimeId,
        panelKind: request.panelKind,
        route: 'document:save',
        message: `document:save is only supported by @neko-sketch/webview/root.`,
      }),
    ];
  }
  if (!isRecord(request.message)) {
    return [];
  }
  const document = request.message['data'];
  try {
    await deps.getProjectFileIo().writeWorkspaceTextFile({
      relativePath: request.relativePath,
      content: JSON.stringify(document, null, 2),
      encoding: 'utf8',
    });
    return [];
  } catch (error: unknown) {
    return [
      createDiagnosticMessage({
        code: 'feature-webview-document-save-failed',
        runtimeId: request.runtimeId,
        panelKind: request.panelKind,
        route: 'document:save',
        message: `Failed to save ${request.relativePath}: ${describeUnknownError(error)}`,
      }),
    ];
  }
}

async function readJsonDocument(
  request: DesktopFeatureWebviewMessageRequest,
  deps: DesktopFeatureWebviewHostDeps,
): Promise<unknown> {
  try {
    const file = await deps.getProjectFileIo().readWorkspaceTextFile({
      relativePath: request.relativePath,
    });
    return JSON.parse(file.content);
  } catch (error: unknown) {
    throw new Error(
      `Failed to load ${request.relativePath} for ${request.runtimeId}: ${describeUnknownError(error)}`,
    );
  }
}

function readMessageRoute(message: unknown): string | undefined {
  if (!isRecord(message)) {
    return undefined;
  }
  const type = message['type'];
  return typeof type === 'string' ? type : undefined;
}

function createDiagnosticResult(
  diagnostic: DesktopFeatureWebviewDiagnostic,
): DesktopFeatureWebviewHostMessageResult {
  return {
    messages: [createDiagnosticMessage(diagnostic)],
    diagnostics: [diagnostic],
  };
}

function createDiagnosticMessage(
  diagnostic: DesktopFeatureWebviewDiagnostic,
): DesktopFeatureWebviewHostMessage {
  return {
    type: 'desktopFeatureDiagnostic',
    diagnostic,
  };
}

function describeUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
