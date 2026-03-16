import type { MessageBundle } from '@neko/shared';

export const en = {
  // Toolbar
  'toolbar.text': 'Text',
  'toolbar.scene': 'Scene',
  'toolbar.addText': 'Add text annotation',
  'toolbar.addScene': 'Add storyboard scene',
  'toolbar.addNode': 'Add Node',
  'toolbar.addMedia': 'Add Media',
  'toolbar.layers': 'Layers',
  'toolbar.toggleProperties': 'Toggle Properties',
  'toolbar.undo': 'Undo',
  'toolbar.redo': 'Redo',
  'toolbar.nodes': '{count} nodes',

  // Empty state
  'empty.hint': 'Click + to add elements, or right-click for more options',
  'empty.zoom': 'Scroll to zoom · Middle-click to pan',

  // Status bar
  'status.zoom': 'Zoom: {level}%',
  'status.pan': 'Pan: ({x}, {y})',
  'status.connecting': '🔗 Click another anchor to connect (Esc to cancel)',
  'status.selected': '{count} selected',

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
  'panel.multiSelected': '{count} nodes selected',
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
  loading: 'Loading canvas...',

  // Canvas
  'canvas.dropHint': 'Drop files here to add to canvas',
} as const satisfies MessageBundle;
