import type { MessageBundle } from '@neko/shared';

export const en = {
  // Status
  'status.disconnected': 'Disconnected',
  'status.vmcFps': 'VMC {fps} fps',
  'status.avatarLoaded': 'Avatar loaded',
  'status.2d': '2D',
  'status.3d': '3D',

  // Controls
  'controls.start': 'Start',
  'controls.stop': 'Stop',
  'controls.avatar': 'Avatar',
  'controls.rec': 'Rec',
  'controls.stopRec': 'Stop Rec',
  'controls.bones': 'Bones',

  // Tracking modes
  'mode.vmc': 'VMC',
  'mode.mediapipe': 'MediaPipe',
  'mode.hybrid': 'Hybrid',

  // Recording
  'recording.rec': 'REC',
  'recording.saved': 'Saved: {filename}',
  'recording.noAvatar': 'Load an avatar before recording',
  'recording.noCanvas': 'No rendering canvas available',
  'recording.captureFailed': 'Canvas capture failed',

  // Puppet viewer
  'puppet.waiting': 'Waiting for tracking data...',
  'puppet.noModel': 'No puppet loaded',

  // Empty state (no avatar loaded)
  'empty.title': 'Neko Live',
  'empty.step1': '1. Click "Start" to connect VMC tracking',
  'empty.step2': '2. Click "Avatar" to load a VRM or Puppet model',
  'empty.step3': '3. Tracking data will drive the avatar in real-time',
  'empty.waitingData': 'Waiting for tracking data...',
  'empty.trackingPreview': 'Tracking Data Preview',
  'empty.headRotation': 'Head',
} satisfies MessageBundle;
