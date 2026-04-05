import type {
  TrackingData,
  TrackingMode,
  CameraDevice,
  AvatarType,
  PuppetDelta,
  PuppetParameter,
} from './tracking';

// ─── Extension → Webview ────────────────────────────────────────────────────

export type LiveExtensionMessage =
  | { type: 'vmcTrackingData'; data: TrackingData }
  | { type: 'enginePort'; port: number }
  | { type: 'trackingStatus'; mode: TrackingMode; active: boolean }
  | { type: 'avatarSelected'; uri: string; avatarType: AvatarType }
  | { type: 'puppetLoaded'; parameters: PuppetParameter[] }
  | { type: 'puppetDelta'; delta: PuppetDelta }
  | { type: 'recordingStarted' }
  | { type: 'recordingStopped'; filePath: string }
  | { type: 'recordingProgress'; elapsedMs: number }
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
  | { type: 'setPuppetParam'; name: string; value: number }
  | { type: 'startRecording'; includeAudio: boolean }
  | { type: 'stopRecording' }
  | { type: 'listCameraDevices' }
  | { type: 'startCameraCapture'; deviceId?: string }
  | { type: 'stopCameraCapture' };
