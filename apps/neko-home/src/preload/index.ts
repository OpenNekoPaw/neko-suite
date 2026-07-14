import { contextBridge, ipcRenderer } from 'electron';
import {
  HOME_BRIDGE_CHANNELS,
  HOME_BRIDGE_GLOBAL,
  assertHomeBridgeChannel,
  type HomeAgentRuntimeMessageRequest,
  type NekoHomeBridge,
} from '../shared/contracts';
import type { NekoApplicationHandoffRequest } from '@neko/host/application';

const bridge: NekoHomeBridge = Object.freeze({
  getSnapshot() {
    assertHomeBridgeChannel(HOME_BRIDGE_CHANNELS.getSnapshot);
    return ipcRenderer.invoke(HOME_BRIDGE_CHANNELS.getSnapshot);
  },
  sendAgentRuntimeMessage(request: HomeAgentRuntimeMessageRequest) {
    assertHomeBridgeChannel(HOME_BRIDGE_CHANNELS.sendAgentRuntimeMessage);
    return ipcRenderer.invoke(HOME_BRIDGE_CHANNELS.sendAgentRuntimeMessage, request);
  },
  handoff(request: NekoApplicationHandoffRequest) {
    assertHomeBridgeChannel(HOME_BRIDGE_CHANNELS.handoff);
    return ipcRenderer.invoke(HOME_BRIDGE_CHANNELS.handoff, request);
  },
});

contextBridge.exposeInMainWorld(HOME_BRIDGE_GLOBAL, bridge);
