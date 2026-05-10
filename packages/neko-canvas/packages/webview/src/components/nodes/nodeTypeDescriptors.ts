/**
 * Unified Node Type Descriptors
 *
 * Single source of truth for node type metadata: label, icon, tag, and default size.
 */

import type { NodeTypeDescriptorRegistry } from './nodeTypeDescriptor';

export function createBuiltInNodeTypeDescriptors(): NodeTypeDescriptorRegistry {
  return {
    media: {
      type: 'media',
      labelKey: 'node.media',
      icon: '\u{1F5BC}\u{FE0F}',
      tagLabel: 'MEDIA',
      tagColor: '#3b82f6',
      defaultSize: { width: 280, height: 200 },
    },
    storyboard: {
      type: 'storyboard',
      labelKey: 'node.storyboard',
      icon: '\u{1F3AC}',
      tagLabel: 'BOARD',
      tagColor: '#f59e0b',
      defaultSize: { width: 240, height: 160 },
    },
    annotation: {
      type: 'annotation',
      labelKey: 'toolbar.annotation',
      icon: '\u{1F4DD}',
      tagLabel: 'NOTE',
      tagColor: '#eab308',
      defaultSize: { width: 200, height: 100 },
    },
    group: {
      type: 'group',
      labelKey: 'node.group',
      icon: '\u{1F4C1}',
      tagLabel: 'GROUP',
      tagColor: '#6b7280',
      defaultSize: { width: 320, height: 220 },
    },
    text: {
      type: 'text',
      labelKey: 'toolbar.text',
      icon: '\u{1F524}',
      tagLabel: 'TEXT',
      tagColor: '#06b6d4',
      defaultSize: { width: 260, height: 120 },
    },
    artboard: {
      type: 'artboard',
      labelKey: 'node.artboard',
      icon: '\u{1F5BC}',
      tagLabel: 'ARTBOARD',
      tagColor: '#a855f7',
      defaultSize: { width: 640, height: 360 },
    },
    shot: {
      type: 'shot',
      labelKey: 'node.shot',
      icon: '\u{1F3AC}',
      tagLabel: 'SHOT',
      tagColor: '#ef4444',
      defaultSize: { width: 220, height: 200 },
    },
    scene: {
      type: 'scene',
      labelKey: 'node.sceneGroup',
      icon: '\u{1F39E}',
      tagLabel: 'SCENE',
      tagColor: '#10b981',
      defaultSize: { width: 640, height: 400 },
    },
    gallery: {
      type: 'gallery',
      labelKey: 'node.gallery',
      icon: '\u{1F5BC}',
      tagLabel: 'GALLERY',
      tagColor: '#8b5cf6',
      defaultSize: { width: 290, height: 360 },
    },
    script: {
      type: 'script',
      labelKey: 'node.script',
      icon: '\u{1F4C4}',
      tagLabel: 'SCRIPT',
      tagColor: '#f97316',
      defaultSize: { width: 280, height: 220 },
    },
    document: {
      type: 'document',
      labelKey: 'node.document',
      icon: '\u{1F4DA}',
      tagLabel: 'DOC',
      tagColor: '#64748b',
      defaultSize: { width: 220, height: 280 },
    },
    model: {
      type: 'model',
      labelKey: 'node.model',
      icon: '\u{1F9E0}',
      tagLabel: 'MODEL',
      tagColor: '#14b8a6',
      defaultSize: { width: 240, height: 160 },
    },
    'canvas-embed': {
      type: 'canvas-embed',
      labelKey: 'node.canvasEmbed',
      icon: '\u{1F5C2}',
      tagLabel: 'CANVAS',
      tagColor: '#6366f1',
      defaultSize: { width: 260, height: 180 },
    },
    project: {
      type: 'project',
      labelKey: 'node.project',
      icon: '\u{1F4E6}',
      tagLabel: 'PROJECT',
      tagColor: '#d946ef',
      defaultSize: { width: 260, height: 180 },
    },
  };
}
