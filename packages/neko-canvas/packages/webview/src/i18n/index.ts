/**
 * Webview i18n - Lightweight internationalization for canvas webview
 *
 * The extension passes the VS Code display language to the webview.
 * This module provides a simple t() function for translating UI strings.
 */

// =============================================================================
// Types
// =============================================================================

type Messages = Record<string, string>;

// =============================================================================
// Message Bundles
// =============================================================================

const en: Messages = {
  // Toolbar
  'toolbar.text': 'Text',
  'toolbar.scene': 'Scene',
  'toolbar.addText': 'Add text annotation',
  'toolbar.addScene': 'Add storyboard scene',
  'toolbar.addNode': 'Add Node',
  'toolbar.addMedia': 'Add Media',
  'toolbar.layers': 'Layers',
  'toolbar.undo': 'Undo',
  'toolbar.redo': 'Redo',
  'toolbar.nodes': '{0} nodes',

  // Empty state
  'empty.hint': 'Click + to add elements, or right-click for more options',
  'empty.zoom': 'Scroll to zoom · Middle-click to pan',

  // Status bar
  'status.zoom': 'Zoom: {0}%',
  'status.pan': 'Pan: ({0}, {1})',
  'status.connecting': '🔗 Click another anchor to connect (Esc to cancel)',
  'status.selected': '{0} selected',

  // Context menu
  'menu.addText': 'Add Text',
  'menu.addScene': 'Add Scene',
  'menu.addImage': 'Add Image',
  'menu.addVideo': 'Add Video',
  'menu.addAudio': 'Add Audio',
  'menu.copy': 'Copy',
  'menu.cut': 'Cut',
  'menu.paste': 'Paste',
  'menu.selectAll': 'Select All',
  'menu.fitContent': 'Fit Content',
  'menu.resetView': 'Reset View',
  'menu.delete': 'Delete',
  'menu.duplicate': 'Duplicate',
  'menu.lock': 'Lock',
  'menu.unlock': 'Unlock',
  'menu.bringToFront': 'Bring to Front',
  'menu.sendToBack': 'Send to Back',
  'menu.undo': 'Undo',
  'menu.redo': 'Redo',

  // Nodes
  'node.note': 'Note',
  'node.storyboard': 'Storyboard',
  'node.media': 'Media',
  'node.group': 'Group',
  'node.newText': 'New Text',
  'node.newScene': 'New Scene',
  'node.editPlaceholder': 'Double-click to edit...',
  'node.descPlaceholder': 'Double-click to add description...',
  'node.clickToView': 'Click to view',
  'node.backToThumbnail': 'Back to thumbnail',

  // Property panel
  'panel.properties': 'Properties',
  'panel.noSelection': 'Select a node to view properties',
  'panel.multiSelected': '{0} nodes selected',
  'panel.transform': 'Transform',
  'panel.layer': 'Layer',
  'panel.content': 'Content',
  'panel.storyboard': 'Storyboard',
  'panel.media': 'Media',
  'panel.actions': 'Actions',
  'panel.title': 'Title',
  'panel.description': 'Description',
  'panel.type': 'Type',
  'panel.duration': 'Duration',

  // Loading
  'loading': 'Loading canvas...',

  // Canvas
  'canvas.dropHint': 'Drop files here to add to canvas',
};

const zhCN: Messages = {
  // Toolbar
  'toolbar.text': '文本',
  'toolbar.scene': '场景',
  'toolbar.addText': '添加文本注释',
  'toolbar.addScene': '添加故事板场景',
  'toolbar.addNode': '添加节点',
  'toolbar.addMedia': '添加媒体',
  'toolbar.layers': '图层',
  'toolbar.undo': '撤销',
  'toolbar.redo': '重做',
  'toolbar.nodes': '{0} 个节点',

  // Empty state
  'empty.hint': '点击 + 添加元素，或右键查看更多选项',
  'empty.zoom': '滚轮缩放 · 中键平移',

  // Status bar
  'status.zoom': '缩放: {0}%',
  'status.pan': '平移: ({0}, {1})',
  'status.connecting': '🔗 点击另一个锚点完成连接（Esc 取消）',
  'status.selected': '已选择 {0} 个',

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
  'panel.multiSelected': '已选择 {0} 个节点',
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
  'loading': '加载画布中...',

  // Canvas
  'canvas.dropHint': '拖放文件到画布中添加',
};

// =============================================================================
// State
// =============================================================================

const bundles: Record<string, Messages> = {
  en,
  'zh-cn': zhCN,
  'zh-CN': zhCN,
};

let currentLocale = 'en';

// =============================================================================
// API
// =============================================================================

/**
 * Set the current locale
 */
export function setLocale(locale: string): void {
  currentLocale = locale.toLowerCase();
}

/**
 * Get the current locale
 */
export function getLocale(): string {
  return currentLocale;
}

/**
 * Translate a message key with optional parameters
 * Parameters are replaced using {0}, {1}, etc.
 */
export function t(key: string, ...args: (string | number)[]): string {
  const bundle = bundles[currentLocale] || bundles['en'] || {};
  let message = bundle[key] || en[key] || key;

  // Replace parameters
  for (let i = 0; i < args.length; i++) {
    message = message.replace(`{${i}}`, String(args[i]));
  }

  return message;
}

/**
 * Detect locale from document or VS Code environment
 */
export function detectLocale(): string {
  // Check VS Code language passed via data attribute
  const lang = document.documentElement.lang
    || document.body.getAttribute('data-vscode-language')
    || navigator.language
    || 'en';

  return lang.toLowerCase().startsWith('zh') ? 'zh-cn' : 'en';
}
