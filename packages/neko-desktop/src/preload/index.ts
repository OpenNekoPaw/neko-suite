import { contextBridge, ipcRenderer } from 'electron';
import {
  DESKTOP_BRIDGE_CHANNELS,
  DESKTOP_BRIDGE_GLOBAL,
  assertDesktopBridgeChannel,
  type DesktopSnapshot,
  type NekoDesktopBridge,
  type ReadWorkspaceFileRequest,
  type ReadWorkspaceFileResult,
  type ViewportIntent,
  type ViewportIntentAck,
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
  sendViewportIntent(intent: ViewportIntent): Promise<ViewportIntentAck> {
    assertDesktopBridgeChannel(DESKTOP_BRIDGE_CHANNELS.sendViewportIntent);
    return ipcRenderer.invoke(DESKTOP_BRIDGE_CHANNELS.sendViewportIntent, intent);
  },
});

contextBridge.exposeInMainWorld(DESKTOP_BRIDGE_GLOBAL, bridge);
