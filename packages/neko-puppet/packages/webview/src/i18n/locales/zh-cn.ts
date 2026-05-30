import type { MessageBundle } from '@neko/shared';

export const zhCN: MessageBundle = {
  // Animation panel
  'puppet.panel.animation': '动画',
  'puppet.animation.noClips': '无动画片段',
  'puppet.animation.liveStream': '实时流已连接',
  'puppet.animation.stop': '停止动画',
  'puppet.animation.play': '播放动画',
  'puppet.animation.seek': '拖动进度',
  'puppet.animation.disablePhysics': '禁用物理',
  'puppet.animation.enablePhysics': '启用物理',
  'puppet.animation.disablePhysicsSim': '禁用物理模拟',
  'puppet.animation.enablePhysicsSim': '启用物理模拟',

  // Crossfade
  'puppet.animation.fadeDuration': '渐变',

  // Parameter panel
  'puppet.panel.parameters': '参数',
  'puppet.parameter.resetDefault': '重置为默认值',
  'puppet.parameter.resetParam': '重置 {name} 为默认值',

  // Control drivers
  'puppet.panel.controlDrivers': '控制驱动',
  'puppet.controlDriver.priority': '优先级',
  'puppet.controlDriver.curvePreview': '控制驱动曲线预览',

  // Morph editor
  'puppet.panel.morph': '变形目标',
  'puppet.morph.noTargets': '无变形目标',
  'puppet.morph.play': '播放变形动画',
  'puppet.morph.stop': '停止变形动画',
  'puppet.morph.stopped': '已停止',

  // Import
  'puppet.import.title': '导入 Puppet (.moc3)',
  'puppet.import.dropHint': '拖入 .moc3 文件或点击导入',

  // Empty state
  'puppet.empty.hint': '拖入 .moc3 文件，或选择以下方式开始',
  'puppet.empty.import': '导入 MOC3',
  'puppet.empty.templateBlank': '空白骨架',
  'puppet.empty.templateHumanoid': '简单人形',

  // Toolbar
  'puppet.toolbar.import': '导入 MOC3',
  'puppet.toolbar.export': '导出 Puppet 资产',
  'puppet.toolbar.package': '打包工程',
  'puppet.toolbar.fitView': '适配视图',
  'puppet.toolbar.leftRail': 'Puppet 工作台工具栏',
  'puppet.toolbar.viewportControls': '视口控件',
  'puppet.toolbar.showRightPanel': '显示右侧面板',
  'puppet.toolbar.hideRightPanel': '隐藏右侧面板',
  'puppet.toolbar.onionSkin': '洋葱皮',

  // Status
  'puppet.status.ready': '就绪',
  'puppet.status.loading': '正在加载 Puppet...',
  'puppet.status.loaded': 'Puppet 已加载',
  'puppet.status.loadFailed': 'Puppet 加载失败',
  'puppet.status.engineUnavailable': 'Neko Engine 不可用。请启动引擎后重新打开 Puppet。',
};
