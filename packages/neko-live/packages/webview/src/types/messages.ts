import type {
  TrackingData,
  TrackingMode,
  CameraDevice,
  AvatarType,
  PuppetDelta,
  PuppetParameter,
  LiveDeviceBinding,
  LiveDeviceRole,
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
  | {
      type: 'recordingStopped';
      filePath: string;
      authority?: 'local-preview' | 'compositor';
      diagnostics?: string[];
    }
  | { type: 'recordingPromoted'; filePath: string }
  | { type: 'recordingProgress'; elapsedMs: number }
  | { type: 'cameraDevices'; devices: CameraDevice[] }
  | { type: 'cameraStreamStarted'; streamId: string; wsUrl?: string }
  | { type: 'cameraStreamStopped' }
  | { type: 'deviceBindingChanged'; role: LiveDeviceRole; binding?: LiveDeviceBinding }
  | { type: 'stopCanvasCapture' };

// ─── Webview → Extension ────────────────────────────────────────────────────

export type LiveWebviewMessage =
  | { type: 'ready' }
  | { type: 'requestEnginePort' }
  | { type: 'startVmcReceiver' }
  | { type: 'stopVmcReceiver' }
  | { type: 'selectAvatar' }
  | { type: 'setTrackingMode'; mode: TrackingMode }
  | { type: 'setPuppetParam'; name: string; value: number }
  | { type: 'startRecording'; includeAudio: boolean; authority?: 'local-preview' | 'compositor' }
  | { type: 'stopRecording' }
  | { type: 'promoteRecording'; filePath: string }
  | { type: 'listCameraDevices' }
  | { type: 'startCameraCapture'; deviceId?: string }
  | { type: 'stopCameraCapture' }
  | { type: 'videoRecordingBlob'; dataUrl: string; mimeType: string };
