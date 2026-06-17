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
  'puppet.action.reset': '重置',
  'puppet.panel.parameters': '参数',
  'puppet.panel.blendShapes': '混合形状',
  'puppet.panel.nodes': '节点',
  'puppet.panel.runtime': '运行时',
  'puppet.parameter.resetDefault': '重置为默认值',
  'puppet.parameter.resetParam': '重置 {name} 为默认值',
  'puppet.nodes.treeLabel': 'Puppet 节点',
  'puppet.runtime.profile': '配置',
  'puppet.runtime.profile.live2d': 'Live2D Puppet',
  'puppet.runtime.profile.native': 'Neko Puppet',
  'puppet.runtime.adapter': '适配器',

  // Control drivers
  'puppet.panel.controlDrivers': '控制驱动',
  'puppet.controlDriver.priority': '优先级',
  'puppet.controlDriver.curvePreview': '控制驱动曲线预览',
  'puppet.controlDriver.source.blendShape': '混合形状',
  'puppet.controlDriver.source.expression': '表情',
  'puppet.controlDriver.source.tracking': '追踪',
  'puppet.controlDriver.source.live2d': 'Live2D',
  'puppet.controlDriver.target.bone': '骨骼',
  'puppet.controlDriver.target.position': '位置',
  'puppet.controlDriver.target.scale': '缩放',
  'puppet.controlDriver.target.blendShape': '混合形状',
  'puppet.controlDriver.curve.linear': '线性',
  'puppet.controlDriver.curve.bezier': '贝塞尔',
  'puppet.controlDriver.curve.step': '阶梯',

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
  'puppet.rightDock.mode.label': '创作模式',
  'puppet.rightDock.mode.basic': '基础',
  'puppet.rightDock.mode.basic.description': 'AI 辅助摆姿与关键参数',
  'puppet.rightDock.mode.professional': '专业',
  'puppet.rightDock.mode.professional.description': '节点树、控制驱动与动画工具',

  // Viewport and timeline
  'puppet.viewport.localPreview': '本地预览',
  'puppet.keyframes.title': '关键帧',
  'puppet.keyframes.collapse': '收起关键帧编辑器',
  'puppet.keyframes.expand': '展开关键帧编辑器',

  // Status
  'puppet.status.ready': '就绪',
  'puppet.status.loading': '正在加载 Puppet...',
  'puppet.status.loaded': 'Puppet 已加载',
  'puppet.status.loadFailed': 'Puppet 加载失败',
  'puppet.status.engineUnavailable': 'Neko Engine 不可用。请启动引擎后重新打开 Puppet。',
};
