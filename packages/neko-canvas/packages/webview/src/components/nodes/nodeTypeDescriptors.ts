/**
 * Unified Node Type Descriptors
 *
 * Single source of truth for node type metadata: label, icon, and default size.
 */

import type { NodeTypeDescriptorRegistry } from './nodeTypeDescriptor';

export function createBuiltInNodeTypeDescriptors(): NodeTypeDescriptorRegistry {
  return {
    media: {
      type: 'media',
      labelKey: 'node.media',
      icon: '\u{1F5BC}\u{FE0F}',
      defaultSize: { width: 280, height: 200 },
    },
    storyboard: {
      type: 'storyboard',
      labelKey: 'node.storyboard',
      icon: '\u{1F3AC}',
      defaultSize: { width: 240, height: 160 },
    },
    annotation: {
      type: 'annotation',
      labelKey: 'toolbar.annotation',
      icon: '\u{1F4DD}',
      defaultSize: { width: 200, height: 100 },
    },
    group: {
      type: 'group',
      labelKey: 'node.group',
      icon: '\u{1F4C1}',
      defaultSize: { width: 320, height: 220 },
    },
    text: {
      type: 'text',
      labelKey: 'toolbar.text',
      icon: '\u{1F524}',
      defaultSize: { width: 260, height: 120 },
    },
    artboard: {
      type: 'artboard',
      labelKey: 'node.artboard',
      icon: '\u{1F5BC}',
      defaultSize: { width: 640, height: 360 },
    },
    shot: {
      type: 'shot',
      labelKey: 'node.shot',
      icon: '\u{1F3AC}',
      defaultSize: { width: 220, height: 200 },
    },
    scene: {
      type: 'scene',
      labelKey: 'node.sceneGroup',
      icon: '\u{1F39E}',
      defaultSize: { width: 640, height: 400 },
    },
    gallery: {
      type: 'gallery',
      labelKey: 'node.gallery',
      icon: '\u{1F5BC}',
      defaultSize: { width: 290, height: 360 },
    },
    script: {
      type: 'script',
      labelKey: 'node.script',
      icon: '\u{1F4C4}',
      defaultSize: { width: 280, height: 220 },
    },
    document: {
      type: 'document',
      labelKey: 'node.document',
      icon: '\u{1F4DA}',
      defaultSize: { width: 220, height: 280 },
    },
    model: {
      type: 'model',
      labelKey: 'node.model',
      icon: '\u{1F9E0}',
      defaultSize: { width: 240, height: 160 },
    },
    'canvas-embed': {
      type: 'canvas-embed',
      labelKey: 'node.canvasEmbed',
      icon: '\u{1F5C2}',
      defaultSize: { width: 260, height: 180 },
    },
  };
}
