import type { TrackingData, TrackingMode, CameraDevice } from './tracking';

// ─── Extension → Webview ────────────────────────────────────────────────────

export type LiveExtensionMessage =
  | { type: 'vmcTrackingData'; data: TrackingData }
  | { type: 'enginePort'; port: number }
  | { type: 'trackingStatus'; mode: TrackingMode; active: boolean }
  | { type: 'avatarSelected'; uri: string }
  | { type: 'cameraDevices'; devices: CameraDevice[] }
  | { type: 'cameraStreamStarted'; streamId: string; wsUrl: string }
  | { type: 'cameraStreamStopped' };

// ─── Webview → Extension ────────────────────────────────────────────────────

export type LiveWebviewMessage =
  | { type: 'ready' }
  | { type: 'requestEnginePort' }
  | { type: 'startVmcReceiver' }
  | { type: 'stopVmcReceiver' }
  | { type: 'selectAvatar' }
  | { type: 'setTrackingMode'; mode: TrackingMode }
  | { type: 'listCameraDevices' }
  | { type: 'startCameraCapture'; deviceId?: string }
  | { type: 'stopCameraCapture' };
