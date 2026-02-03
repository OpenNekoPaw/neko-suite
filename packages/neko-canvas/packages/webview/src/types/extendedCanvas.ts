/**
 * Extended Canvas Types - 扩展的画布类型定义
 * 在 @neko/shared 基础上扩展新的节点类型
 */

import type { CanvasNodeBase, CanvasNode as BaseCanvasNode } from '@neko/shared';

// =============================================================================
// Extended Node Types
// =============================================================================

/**
 * 扩展的节点类型
 */
export type ExtendedNodeType =
  | 'media'
  | 'storyboard'
  | 'annotation'
  | 'group'
  | 'text'      // 富文本节点
  | 'artboard'; // 画板节点

/**
 * 富文本节点 - 支持格式化文本
 */
export interface TextCanvasNode extends Omit<CanvasNodeBase, 'type'> {
  type: 'text';
  data: {
    /** 文本内容（支持 Markdown 或纯文本） */
    content: string;
    /** 文本格式 */
    format?: 'plain' | 'markdown';
    /** 样式配置 */
    style?: TextNodeStyle;
  };
}

export interface TextNodeStyle {
  /** 字体大小 */
  fontSize?: number;
  /** 字体粗细 */
  fontWeight?: 'normal' | 'bold';
  /** 文本颜色 */
  color?: string;
  /** 背景颜色 */
  backgroundColor?: string;
  /** 文本对齐 */
  textAlign?: 'left' | 'center' | 'right';
  /** 行高 */
  lineHeight?: number;
  /** 内边距 */
  padding?: number;
}

/**
 * 画板节点 - 固定尺寸的容器区域
 */
export interface ArtboardCanvasNode extends Omit<CanvasNodeBase, 'type'> {
  type: 'artboard';
  data: {
    /** 画板名称 */
    name: string;
    /** 画板描述 */
    description?: string;
    /** 背景颜色 */
    backgroundColor?: string;
    /** 是否显示边框 */
    showBorder?: boolean;
    /** 预设尺寸类型 */
    preset?: ArtboardPreset;
  };
}

export type ArtboardPreset =
  | 'custom'
  | '1080p'      // 1920x1080
  | '4k'         // 3840x2160
  | 'instagram'  // 1080x1080
  | 'story'      // 1080x1920
  | 'youtube';   // 1280x720

/**
 * 扩展的节点联合类型
 */
export type ExtendedCanvasNode =
  | BaseCanvasNode
  | TextCanvasNode
  | ArtboardCanvasNode;

// =============================================================================
// Type Guards
// =============================================================================

export function isTextNode(node: ExtendedCanvasNode): node is TextCanvasNode {
  return node.type === 'text';
}

export function isArtboardNode(node: ExtendedCanvasNode): node is ArtboardCanvasNode {
  return node.type === 'artboard';
}

// =============================================================================
// Default Values
// =============================================================================

export const DEFAULT_TEXT_STYLE: TextNodeStyle = {
  fontSize: 14,
  fontWeight: 'normal',
  color: '#e5e5e5',
  backgroundColor: 'transparent',
  textAlign: 'left',
  lineHeight: 1.5,
  padding: 12,
};

export const ARTBOARD_PRESETS: Record<ArtboardPreset, { width: number; height: number; label: string }> = {
  custom: { width: 800, height: 600, label: 'Custom' },
  '1080p': { width: 1920, height: 1080, label: '1080p (16:9)' },
  '4k': { width: 3840, height: 2160, label: '4K (16:9)' },
  instagram: { width: 1080, height: 1080, label: 'Instagram (1:1)' },
  story: { width: 1080, height: 1920, label: 'Story (9:16)' },
  youtube: { width: 1280, height: 720, label: 'YouTube (16:9)' },
};
