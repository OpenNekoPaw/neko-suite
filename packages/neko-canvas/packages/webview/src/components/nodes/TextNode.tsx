/**
 * TextNode - 富文本节点组件
 * 支持文本编辑和基础格式化
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import type { CanvasViewport } from '@neko/shared';
import { BaseNode } from './BaseNode';
import type { TextCanvasNode, TextNodeStyle } from '../../types/extendedCanvas';
import { DEFAULT_TEXT_STYLE } from '../../types/extendedCanvas';
import clsx from 'clsx';

// =============================================================================
// Types
// =============================================================================

export interface TextNodeProps {
  node: TextCanvasNode;
  viewport: CanvasViewport;
  isSelected: boolean;
  onSelect?: (nodeId: string, multi: boolean) => void;
  onMove?: (nodeId: string, position: { x: number; y: number }) => void;
  onContentChange?: (nodeId: string, content: string) => void;
  onStyleChange?: (nodeId: string, style: Partial<TextNodeStyle>) => void;
}

// =============================================================================
// Component
// =============================================================================

export function TextNode({
  node,
  viewport,
  isSelected,
  onSelect,
  onMove,
  onContentChange,
  onStyleChange,
}: TextNodeProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(node.data.content);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const style: TextNodeStyle = {
    ...DEFAULT_TEXT_STYLE,
    ...node.data.style,
  };

  // 同步外部内容变化
  useEffect(() => {
    if (!isEditing) {
      setEditContent(node.data.content);
    }
  }, [node.data.content, isEditing]);

  // 进入编辑模式时聚焦
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [isEditing]);

  // 双击进入编辑模式
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (!node.locked) {
        setIsEditing(true);
      }
    },
    [node.locked],
  );

  // 处理文本变化
  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditContent(e.target.value);
  }, []);

  // 失焦时保存
  const handleBlur = useCallback(() => {
    setIsEditing(false);
    if (editContent !== node.data.content) {
      onContentChange?.(node.id, editContent);
    }
  }, [editContent, node.data.content, node.id, onContentChange]);

  // 按键处理
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setEditContent(node.data.content);
        setIsEditing(false);
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        handleBlur();
      }
      e.stopPropagation();
    },
    [node.data.content, handleBlur],
  );

  return (
    <BaseNode
      node={node}
      viewport={viewport}
      isSelected={isSelected}
      onSelect={onSelect}
      onMove={onMove}
      className="text-node"
    >
      <div
        className="w-full h-full flex flex-col"
        style={{
          backgroundColor: style.backgroundColor,
        }}
        onDoubleClick={handleDoubleClick}
      >
        {/* ── Header: unified type tag ── */}
        <div
          className="flex items-center gap-1.5 px-2 py-1.5 border-b border-[var(--node-border)]"
          style={{ backgroundColor: 'var(--node-header-bg)' }}
        >
          <span
            className="px-1.5 py-0.5 rounded text-xs font-medium flex-shrink-0"
            style={{ backgroundColor: '#06b6d420', color: '#06b6d4' }}
          >
            TEXT
          </span>
          <span className="text-xs flex-1 truncate" style={{ color: 'var(--node-fg-secondary)' }}>
            {node.data.content ? node.data.content.slice(0, 30) : 'Text'}
          </span>
        </div>

        {/* Format toolbar (visible during editing) */}
        {isEditing && (
          <TextFormatToolbar
            style={style}
            onStyleChange={(updates) => onStyleChange?.(node.id, updates)}
          />
        )}

        {/* 文本内容区域 */}
        <div className="flex-1" style={{ padding: style.padding }}>
          {isEditing ? (
            <textarea
              ref={textareaRef}
              value={editContent}
              onChange={handleChange}
              onBlur={handleBlur}
              onKeyDown={handleKeyDown}
              className={clsx(
                'w-full h-full resize-none bg-transparent border-none outline-none',
                'text-[var(--text-primary)]',
              )}
              style={{
                fontSize: style.fontSize,
                fontWeight: style.fontWeight,
                color: style.color,
                textAlign: style.textAlign,
                lineHeight: style.lineHeight,
              }}
              placeholder="Enter text..."
            />
          ) : (
            <div
              className={clsx(
                'w-full h-full overflow-auto whitespace-pre-wrap break-words',
                !node.data.content && 'text-gray-500 italic',
              )}
              style={{
                fontSize: style.fontSize,
                fontWeight: style.fontWeight,
                color: style.color,
                textAlign: style.textAlign,
                lineHeight: style.lineHeight,
              }}
            >
              {node.data.content || 'Double-click to edit...'}
            </div>
          )}
        </div>
      </div>
    </BaseNode>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

const FONT_SIZES = [10, 12, 14, 16, 18, 20, 24, 28, 32];

function TextFormatToolbar({
  style,
  onStyleChange,
}: {
  style: TextNodeStyle;
  onStyleChange: (updates: Partial<TextNodeStyle>) => void;
}) {
  return (
    <div
      className="flex items-center gap-1 mb-1 pb-1 border-b border-gray-700 flex-wrap"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/* Font size */}
      <select
        className="text-xs px-1 py-0.5 rounded border border-gray-600 bg-gray-800 text-gray-300 outline-none"
        value={style.fontSize ?? 14}
        onChange={(e) => onStyleChange({ fontSize: Number(e.target.value) })}
      >
        {FONT_SIZES.map((size) => (
          <option key={size} value={size}>
            {size}px
          </option>
        ))}
      </select>

      {/* Bold toggle */}
      <button
        className={clsx(
          'px-1.5 py-0.5 rounded text-xs font-bold transition-colors',
          style.fontWeight === 'bold'
            ? 'bg-blue-600 text-white'
            : 'bg-gray-800 text-gray-400 hover:text-gray-200',
        )}
        onClick={() =>
          onStyleChange({ fontWeight: style.fontWeight === 'bold' ? 'normal' : 'bold' })
        }
        title="Bold"
      >
        B
      </button>

      {/* Text align */}
      {(['left', 'center', 'right'] as const).map((align) => (
        <button
          key={align}
          className={clsx(
            'px-1.5 py-0.5 rounded text-xs transition-colors',
            style.textAlign === align
              ? 'bg-blue-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:text-gray-200',
          )}
          onClick={() => onStyleChange({ textAlign: align })}
          title={align.charAt(0).toUpperCase() + align.slice(1)}
        >
          {align === 'left' ? '≡' : align === 'center' ? '≡' : '≡'}
        </button>
      ))}

      {/* Color picker */}
      <input
        type="color"
        className="w-5 h-5 rounded cursor-pointer border-0 p-0"
        value={style.color ?? '#e5e5e5'}
        onChange={(e) => onStyleChange({ color: e.target.value })}
        title="Text Color"
      />
    </div>
  );
}
