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
  'menu.addImage': '添加图片',
  'menu.addVideo': '添加视频',
  'menu.addAudio': '添加音频',
  'menu.copy': '复制',
  'menu.cut': '剪切',
  'menu.paste': '粘贴',
  'menu.selectAll': '全选',
  'menu.fitContent': '适应内容',
  'menu.resetView': '重置视图',
  'menu.delete': '删除',
  'menu.duplicate': '创建副本',
  'menu.lock': '锁定',
  'menu.unlock': '解锁',
  'menu.bringToFront': '置于顶层',
  'menu.sendToBack': '置于底层',
  'menu.undo': '撤销',
  'menu.redo': '重做',

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

  // Loading
  loading: '加载画布中...',

  // Canvas
  'canvas.dropHint': '拖放文件到画布中添加',
} as const satisfies MessageBundle;
