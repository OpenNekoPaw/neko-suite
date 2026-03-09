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
      node={node as any}
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
          padding: style.padding,
        }}
        onDoubleClick={handleDoubleClick}
      >
        {/* 节点标题栏 */}
        <div className="flex items-center gap-2 mb-2 text-xs text-gray-400 border-b border-gray-700 pb-1">
          <span className="text-blue-400">T</span>
          <span>Text</span>
        </div>

        {/* 文本内容区域 */}
        {isEditing ? (
          <textarea
            ref={textareaRef}
            value={editContent}
            onChange={handleChange}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            className={clsx(
              'flex-1 w-full resize-none bg-transparent border-none outline-none',
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
              'flex-1 overflow-auto whitespace-pre-wrap break-words',
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
    </BaseNode>
  );
}
