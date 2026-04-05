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

  // Puppet viewer
  'puppet.waiting': 'Waiting for tracking data...',
  'puppet.noModel': 'No puppet loaded',
} satisfies MessageBundle;
