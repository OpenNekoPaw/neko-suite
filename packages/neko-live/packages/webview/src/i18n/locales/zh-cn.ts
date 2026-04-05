import type { MessageBundle } from '@neko/shared';

export const zhCN = {
  // Status
  'status.disconnected': '未连接',
  'status.vmcFps': 'VMC {fps} fps',
  'status.avatarLoaded': '头像已加载',
  'status.2d': '2D',
  'status.3d': '3D',

  // Controls
  'controls.start': '开始',
  'controls.stop': '停止',
  'controls.avatar': '头像',
  'controls.rec': '录制',
  'controls.stopRec': '停止录制',
  'controls.bones': '骨骼',

  // Tracking modes
  'mode.vmc': 'VMC',
  'mode.mediapipe': 'MediaPipe',
  'mode.hybrid': '混合',

  // Recording
  'recording.rec': '录制中',
  'recording.saved': '已保存：{filename}',

  // Puppet viewer
  'puppet.waiting': '等待追踪数据...',
  'puppet.noModel': '未加载 Puppet 模型',

  // Empty state (no avatar loaded)
  'empty.title': 'Neko Live',
  'empty.step1': '1. 点击「开始」连接 VMC 追踪',
  'empty.step2': '2. 点击「头像」加载 VRM 或 Puppet 模型',
  'empty.step3': '3. 追踪数据将实时驱动虚拟形象',
  'empty.waitingData': '等待追踪数据...',
  'empty.trackingPreview': '追踪数据预览',
  'empty.headRotation': '头部',
} satisfies MessageBundle;
