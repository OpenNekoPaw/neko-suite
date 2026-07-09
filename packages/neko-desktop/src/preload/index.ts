import { contextBridge, ipcRenderer } from 'electron';
import { parseWebviewToExtensionMessage } from '@neko-agent/types';
import { NEKO_AGENT_HOST_MESSAGE_EVENT } from '@neko-agent/types/host-message-event';
import {
  DESKTOP_BRIDGE_CHANNELS,
  DESKTOP_BRIDGE_GLOBAL,
  DESKTOP_LEGACY_VSCODE_API_GLOBAL,
  assertDesktopBridgeChannel,
  type DesktopAgentHostMessageResult,
  type DesktopAgentRuntimeMessageRequest,
  type DesktopFeatureWebviewContext,
  type DesktopFeatureWebviewHostMessageResult,
  type DesktopFeatureWebviewMessageRequest,
  type DesktopSnapshot,
  type NekoDesktopBridge,
  type ReadWorkspaceFileRequest,
  type ReadWorkspaceFileResult,
  type ViewportIntent,
  type ViewportIntentAck,
  type WriteWorkspaceFileRequest,
  type WriteWorkspaceFileResult,
} from '../shared/contracts';

const bridge: NekoDesktopBridge = Object.freeze({
  getSnapshot(): Promise<DesktopSnapshot> {
    assertDesktopBridgeChannel(DESKTOP_BRIDGE_CHANNELS.getSnapshot);
    return ipcRenderer.invoke(DESKTOP_BRIDGE_CHANNELS.getSnapshot);
  },
  readWorkspaceFile(request: ReadWorkspaceFileRequest): Promise<ReadWorkspaceFileResult> {
    assertDesktopBridgeChannel(DESKTOP_BRIDGE_CHANNELS.readWorkspaceFile);
    return ipcRenderer.invoke(DESKTOP_BRIDGE_CHANNELS.readWorkspaceFile, request);
  },
  writeWorkspaceFile(request: WriteWorkspaceFileRequest): Promise<WriteWorkspaceFileResult> {
    assertDesktopBridgeChannel(DESKTOP_BRIDGE_CHANNELS.writeWorkspaceFile);
    return ipcRenderer.invoke(DESKTOP_BRIDGE_CHANNELS.writeWorkspaceFile, request);
  },
  sendViewportIntent(intent: ViewportIntent): Promise<ViewportIntentAck> {
    assertDesktopBridgeChannel(DESKTOP_BRIDGE_CHANNELS.sendViewportIntent);
    return ipcRenderer.invoke(DESKTOP_BRIDGE_CHANNELS.sendViewportIntent, intent);
  },
  setFeatureWebviewContext(context: DesktopFeatureWebviewContext | undefined): void {
    activeFeatureWebviewContext = context;
  },
  sendFeatureWebviewMessage(
    request: DesktopFeatureWebviewMessageRequest,
  ): Promise<DesktopFeatureWebviewHostMessageResult> {
    assertDesktopBridgeChannel(DESKTOP_BRIDGE_CHANNELS.sendFeatureWebviewMessage);
    return ipcRenderer.invoke(DESKTOP_BRIDGE_CHANNELS.sendFeatureWebviewMessage, request);
  },
  sendAgentRuntimeMessage(
    request: DesktopAgentRuntimeMessageRequest,
  ): Promise<DesktopAgentHostMessageResult> {
    assertDesktopBridgeChannel(DESKTOP_BRIDGE_CHANNELS.sendAgentRuntimeMessage);
    return ipcRenderer.invoke(DESKTOP_BRIDGE_CHANNELS.sendAgentRuntimeMessage, request);
  },
});

interface DesktopVSCodeApi {
  postMessage(message: unknown): void;
  getState<T = unknown>(): T | undefined;
  setState<T = unknown>(state: T): void;
}

let desktopVSCodeState: unknown;
let activeFeatureWebviewContext: DesktopFeatureWebviewContext | undefined;
const DESKTOP_FEATURE_DIAGNOSTIC_EVENT = 'nekoDesktopFeatureDiagnostic';

// Migration-only shim for package roots that have not moved to scoped host adapters yet.
// Migrated Agent roots must use sendAgentRuntimeMessage through createElectronAgentHostRuntimeAdapter.
const desktopVSCodeApi: DesktopVSCodeApi = Object.freeze({
  postMessage(message: unknown): void {
    if (parseWebviewToExtensionMessage(message)) {
      dispatchAgentHostMessages({
        messages: [
          {
            type: 'globalError',
            message:
              'Desktop Agent messages must use the scoped Electron Agent host runtime adapter.',
          },
        ],
      });
      return;
    }

    if (activeFeatureWebviewContext) {
      void bridge
        .sendFeatureWebviewMessage({
          ...activeFeatureWebviewContext,
          message,
        })
        .then(dispatchFeatureHostMessages)
        .catch((error: unknown) => {
          dispatchFeatureHostMessages({
            messages: [
              {
                type: 'desktopFeatureDiagnostic',
                diagnostic: {
                  code: 'invalid-feature-webview-message',
                  message: describeUnknownError(error),
                },
              },
            ],
          });
        });
      return;
    }

    dispatchFeatureHostMessages({
      messages: [
        {
          type: 'desktopFeatureDiagnostic',
          diagnostic: {
            code: 'invalid-feature-webview-message',
            message: 'Desktop feature Webview context is missing for legacy postMessage.',
          },
        },
      ],
    });
  },
  getState<T = unknown>(): T | undefined {
    return desktopVSCodeState as T | undefined;
  },
  setState<T = unknown>(state: T): void {
    desktopVSCodeState = state;
  },
});

function dispatchAgentHostMessages(result: DesktopAgentHostMessageResult): void {
  for (const message of result.messages) {
    window.dispatchEvent(new CustomEvent(NEKO_AGENT_HOST_MESSAGE_EVENT, { detail: message }));
  }
}

function dispatchFeatureHostMessages(result: DesktopFeatureWebviewHostMessageResult): void {
  for (const message of result.messages) {
    if (isDesktopFeatureDiagnosticMessage(message)) {
      window.dispatchEvent(
        new CustomEvent(DESKTOP_FEATURE_DIAGNOSTIC_EVENT, { detail: message.diagnostic }),
      );
      continue;
    }
    window.dispatchEvent(new MessageEvent('message', { data: message }));
  }
}

function isDesktopFeatureDiagnosticMessage(
  message: unknown,
): message is { readonly type: 'desktopFeatureDiagnostic'; readonly diagnostic: unknown } {
  return (
    typeof message === 'object' &&
    message !== null &&
    !Array.isArray(message) &&
    (message as { readonly type?: unknown }).type === 'desktopFeatureDiagnostic'
  );
}

function describeUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

contextBridge.exposeInMainWorld(DESKTOP_BRIDGE_GLOBAL, bridge);
contextBridge.exposeInMainWorld(DESKTOP_LEGACY_VSCODE_API_GLOBAL, desktopVSCodeApi);
