import type { MessageBundle } from '@neko/shared';

export const zhCN = {
  // Toolbar
  'toolbar.text': '文本',
  'toolbar.scene': '场景',
  'toolbar.addText': '添加文本注释',
  'toolbar.addScene': '添加故事板场景',
  'toolbar.addNode': '添加节点',
  'toolbar.addMedia': '添加媒体',
  'toolbar.layers': '图层',
  'toolbar.toggleProperties': '切换属性面板',
  'toolbar.undo': '撤销',
  'toolbar.redo': '重做',
  'toolbar.nodes': '{count} 个节点',

  // Empty state
  'empty.hint': '点击 + 添加元素，或右键查看更多选项',
  'empty.zoom': '滚轮缩放 · 中键平移',

  // Status bar
  'status.zoom': '缩放: {level}%',
  'status.pan': '平移: ({x}, {y})',
  'status.connecting': '🔗 点击另一个锚点完成连接（Esc 取消）',
  'status.selected': '已选择 {count} 个',

  // Context menu
  'menu.addText': '添加文本',
  'menu.addScene': '添加场景',
  'menu.addShot': '添加镜头',
  'menu.addGallery': '添加角色画廊',
  'menu.addImage': '添加图片',
  'menu.addVideo': '添加视频',
  'menu.addAudio': '添加音频',
  'menu.copy': '复制',
  'menu.cut': '剪切',
  'menu.paste': '粘贴',
  'menu.pasteInPlace': '原地粘贴',
  'menu.selectAll': '全选',
  'menu.fitContent': '适应内容',
  'menu.resetView': '重置视图',
  'menu.delete': '删除',
  'menu.duplicate': '创建副本',
  'menu.lock': '锁定',
  'menu.unlock': '解锁',
  'menu.bringToFront': '置于顶层',
  'menu.sendToBack': '置于底层',
  'menu.group': '编组',
  'menu.ungroup': '取消编组',
  'menu.undo': '撤销',
  'menu.redo': '重做',

  // Context menu — AI section
  'menu.ai.generateImage': '生成图像',
  'menu.ai.batchGenerate': '批量生成选中镜头',
  'menu.ai.optimizeDesc': '优化描述',
  'menu.ai.adjustCamera': '调整机位',
  'menu.ai.understand': '理解内容',
  'menu.ai.sendToAgent': '发送到 Agent',
  'menu.ai.editInSketch': '在 Sketch 中编辑',
  'menu.ai.generateVideo': '生成视频',
  'menu.ai.editWithControlNet': 'ControlNet 编辑',

  // Nodes
  'node.note': '注释',
  'node.storyboard': '故事板',
  'node.media': '媒体',
  'node.group': '分组',
  'node.newText': '新文本',
  'node.newScene': '新场景',
  'node.editPlaceholder': '双击编辑...',
  'node.descPlaceholder': '双击添加描述...',
  'node.clickToView': '点击查看',
  'node.backToThumbnail': '返回缩略图',

  // Group
  'group.empty': '无子节点',

  // Property panel
  'panel.properties': '属性',
  'panel.noSelection': '选择节点查看属性',
  'panel.multiSelected': '已选择 {count} 个节点',
  'panel.transform': '变换',
  'panel.layer': '图层',
  'panel.content': '内容',
  'panel.storyboard': '故事板',
  'panel.media': '媒体',
  'panel.actions': '操作',
  'panel.title': '标题',
  'panel.description': '描述',
  'panel.type': '类型',
  'panel.duration': '时长',
  'panel.connection': '连接',
  'panel.connectionLabel': '标签',
  'panel.connectionLabelPlaceholder': '添加标签...',
  'panel.connectionType': '类型',
  'panel.connectionInfo': '信息',
  'panel.textStyle': '文本样式',
  'panel.fontSize': '字体大小',
  'panel.fontWeight': '字重',
  'panel.textAlign': '对齐',
  'panel.textColor': '颜色',
  'panel.group': '分组',
  'panel.groupLabel': '标签',
  'panel.groupColor': '颜色',
  'panel.groupChildren': '子节点',

  // Ports
  'panel.ports': '端口',
  'panel.addPort': '添加端口',
  'panel.removePort': '移除',
  'panel.defaultPorts': '使用默认端口',
  'panel.customizePorts': '自定义',

  // Rotation
  'panel.rotation': '旋转',

  // Loading
  loading: '加载画布中...',

  // Canvas
  'canvas.dropHint': '拖放文件到画布中添加',

  // Artboard
  'artboard.label': '画板',
  'artboard.exportPng': '导出为 PNG',
  'artboard.exportSvg': '导出为 SVG',
  'artboard.exporting': '导出中...',

  // Generation panel — advanced section
  'gen.advanced': '高级选项',
  'gen.controlMode': '控制模式',
  'gen.controlStrength': '强度',
  'gen.editInstruction': '编辑指令（可选）',
  'gen.generateVideo': '生成视频',
  'gen.videoDuration': '时长',
} as const satisfies MessageBundle;
