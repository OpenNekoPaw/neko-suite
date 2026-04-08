/**
 * CanvasToolbar - Left vertical toolbar
 *
 * Provides quick access to:
 * - Add node (expandable panel)
 * - Layer panel toggle
 * - Undo / Redo
 * - Canvas settings
 *
 * Uses shared ToolbarButton for consistent active state and hover styling.
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { ToolbarButton, ToolbarSeparator } from '@neko/shared/components';
import { useHistoryStore } from '../../stores/historyStore';
import { useCanvasOperationStore } from '../../stores/canvasOperationStore';
import { t } from '../../i18n';
import { PlusIcon, UndoIcon, RedoIcon } from '@neko/shared/icons';
import type { OperationSource } from '@neko/shared';

// =============================================================================
// Types
// =============================================================================

export interface CanvasToolbarProps {
  onAddText: () => void;
  onAddMedia: (type: 'image' | 'video' | 'audio') => void;
  onUndo: () => void;
  onRedo: () => void;
  /** Storyboard node creation callbacks */
  onAddShot?: () => void;
  onAddSceneGroup?: () => void;
  onAddGallery?: () => void;
  onAddScript?: () => void;
  onAddDocument?: () => void;
  onAddModel?: () => void;
  /** Hand tool (drag-to-pan) mode */
  isPanMode?: boolean;
  onTogglePanMode?: () => void;
}

type ExpandedPanel = 'add' | 'ops' | null;
type OperationFilter = 'all' | OperationSource;

// =============================================================================
// Component
// =============================================================================

export function CanvasToolbar({
  onAddText,
  onAddMedia,
  onUndo,
  onRedo,
  onAddShot,
  onAddSceneGroup,
  onAddGallery,
  onAddScript,
  onAddDocument,
  onAddModel,
  isPanMode = false,
  onTogglePanMode,
}: CanvasToolbarProps) {
  const [expandedPanel, setExpandedPanel] = useState<ExpandedPanel>(null);
  const canUndo = useHistoryStore((s) => s.canUndo());
  const canRedo = useHistoryStore((s) => s.canRedo());
  const operationLog = useCanvasOperationStore((s) => s.operationLog);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [operationFilter, setOperationFilter] = useState<OperationFilter>('all');

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!expandedPanel) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setExpandedPanel(null);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpandedPanel(null);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [expandedPanel]);

  const togglePanel = useCallback((panel: ExpandedPanel) => {
    setExpandedPanel((prev) => (prev === panel ? null : panel));
  }, []);

  const handleAddAndClose = useCallback((action: () => void) => {
    action();
    setExpandedPanel(null);
  }, []);

  return (
    <div ref={toolbarRef} className="neko-vtoolbar relative z-20" style={{ width: 48 }}>
      {/* Hand Tool (drag-to-pan) */}
      <ToolbarButton
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M10 15V6a1.5 1.5 0 0 1 3 0v5a1.5 1.5 0 0 1 3 0v1a1.5 1.5 0 0 1 3 0v5a6 6 0 0 1-6 6h-1a6 6 0 0 1-4.243-1.757l-3.5-3.5a1.5 1.5 0 0 1 2.121-2.121L8 17V6" />
          </svg>
        }
        title={`${t('toolbar.handTool') ?? '移动工具'} (H)`}
        active={isPanMode}
        onClick={onTogglePanMode}
      />

      {/* Add Node Button */}
      <ToolbarButton
        icon={<PlusIcon size={18} />}
        title={t('toolbar.addNode')}
        active={expandedPanel === 'add'}
        onClick={() => togglePanel('add')}
      />

      <ToolbarSeparator />

      <ToolbarButton
        icon={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M5 4a3 3 0 0 0-3 3v1h20V7a3 3 0 0 0-3-3H5Z" />
            <path d="M2 10v7a3 3 0 0 0 3 3h14a3 3 0 0 0 3-3v-7H2Zm5 2h10v2H7v-2Zm0 4h6v2H7v-2Z" />
          </svg>
        }
        title="操作历史"
        active={expandedPanel === 'ops'}
        onClick={() => togglePanel('ops')}
      />

      {/* Undo */}
      <ToolbarButton
        icon={<UndoIcon size={18} />}
        title={`${t('toolbar.undo')} (⌘Z)`}
        onClick={onUndo}
        disabled={!canUndo}
      />

      {/* Redo */}
      <ToolbarButton
        icon={<RedoIcon size={18} />}
        title={`${t('toolbar.redo')} (⇧⌘Z)`}
        onClick={onRedo}
        disabled={!canRedo}
      />

      {/* ============================================================= */}
      {/* Expanded Panels (positioned to the right of the toolbar)      */}
      {/* ============================================================= */}

      {expandedPanel === 'add' && (
        <div
          className="absolute left-full top-0 ml-1.5"
          style={{
            minWidth: 210,
            padding: '5px',
            background: 'var(--neko-glass-bg)',
            backdropFilter: 'var(--neko-glass-blur)',
            WebkitBackdropFilter: 'var(--neko-glass-blur)',
            border: '1px solid var(--neko-glass-border)',
            borderRadius: 'var(--neko-radius-lg)',
            boxShadow: 'var(--neko-glass-shadow)',
            color: 'var(--neko-fg)',
          }}
        >
          {/* Primary storyboard tools (shown first when available) */}
          {onAddShot && (
            <AddPanelItem
              icon={<span className="text-[13px]">🎬</span>}
              label="镜头"
              onClick={() => handleAddAndClose(onAddShot)}
            />
          )}
          {onAddSceneGroup && (
            <AddPanelItem
              icon={<span className="text-[13px]">🎞</span>}
              label="场景"
              onClick={() => handleAddAndClose(onAddSceneGroup)}
            />
          )}
          {onAddGallery && (
            <AddPanelItem
              icon={<span className="text-[13px]">🖼</span>}
              label="角色画廊"
              onClick={() => handleAddAndClose(onAddGallery)}
            />
          )}
          {onAddScript && (
            <AddPanelItem
              icon={<span className="text-[13px]">📄</span>}
              label="剧本引用"
              onClick={() => handleAddAndClose(onAddScript)}
            />
          )}
          {onAddDocument && (
            <AddPanelItem
              icon={<span className="text-[13px]">📚</span>}
              label="文档引用"
              onClick={() => handleAddAndClose(onAddDocument)}
            />
          )}
          {onAddModel && (
            <AddPanelItem
              icon={<span className="text-[13px]">🧠</span>}
              label="模型引用"
              onClick={() => handleAddAndClose(onAddModel)}
            />
          )}

          <div className="neko-menu-sep" />

          <AddPanelItem
            icon={
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M4 7V4h16v3" />
                <path d="M9 20h6" />
                <path d="M12 4v16" />
              </svg>
            }
            label="备注"
            onClick={() => handleAddAndClose(onAddText)}
          />

          <div className="neko-menu-sep" />

          <AddPanelItem
            icon={<span className="text-[13px]">🖼️</span>}
            label="图片"
            onClick={() => handleAddAndClose(() => onAddMedia('image'))}
          />
          <AddPanelItem
            icon={<span className="text-[13px]">🎥</span>}
            label="视频"
            onClick={() => handleAddAndClose(() => onAddMedia('video'))}
          />
          <AddPanelItem
            icon={<span className="text-[13px]">🎵</span>}
            label="音频"
            onClick={() => handleAddAndClose(() => onAddMedia('audio'))}
          />
        </div>
      )}

      {expandedPanel === 'ops' && (
        <OperationPanel
          operationFilter={operationFilter}
          operations={operationLog}
          onFilterChange={setOperationFilter}
        />
      )}
    </div>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

interface AddPanelItemProps {
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  onClick: () => void;
}

function AddPanelItem({ icon, label, shortcut, onClick }: AddPanelItemProps) {
  return (
    <button className="neko-menu-item" onClick={onClick}>
      <span className="neko-menu-item-icon">{icon}</span>
      <span className="neko-menu-item-label">{label}</span>
      {shortcut !== undefined && <span className="neko-menu-item-shortcut">{shortcut}</span>}
    </button>
  );
}

interface OperationPanelProps {
  operations: ReturnType<typeof useCanvasOperationStore.getState>['operationLog'];
  operationFilter: OperationFilter;
  onFilterChange: (filter: OperationFilter) => void;
}

const OPERATION_FILTERS: ReadonlyArray<{ value: OperationFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'user', label: '用户' },
  { value: 'ai', label: 'AI' },
  { value: 'system', label: '系统' },
];

function OperationPanel({ operations, operationFilter, onFilterChange }: OperationPanelProps) {
  const filtered = operations
    .filter((operation) =>
      operationFilter === 'all' ? true : operation.meta.source === operationFilter,
    )
    .slice(-12)
    .reverse();

  return (
    <div
      className="absolute left-full top-12 ml-1.5"
      style={{
        width: 280,
        maxHeight: 360,
        padding: '8px',
        background: 'var(--neko-glass-bg)',
        backdropFilter: 'var(--neko-glass-blur)',
        WebkitBackdropFilter: 'var(--neko-glass-blur)',
        border: '1px solid var(--neko-glass-border)',
        borderRadius: 'var(--neko-radius-lg)',
        boxShadow: 'var(--neko-glass-shadow)',
        color: 'var(--neko-fg)',
      }}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[11px] font-semibold tracking-[0.12em] text-[var(--neko-fg-secondary)]">
          操作历史
        </div>
        <div className="text-[10px] text-[var(--neko-fg-tertiary)]">{operations.length} 条</div>
      </div>

      <div className="mb-2 flex flex-wrap gap-1">
        {OPERATION_FILTERS.map((filter) => (
          <button
            key={filter.value}
            onClick={() => onFilterChange(filter.value)}
            style={{
              fontSize: 10,
              padding: '3px 8px',
              borderRadius: 999,
              border:
                operationFilter === filter.value
                  ? '1px solid var(--neko-accent)'
                  : '1px solid var(--node-border)',
              background:
                operationFilter === filter.value ? 'var(--neko-accent-soft)' : 'transparent',
              color: 'var(--neko-fg)',
            }}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <div className="max-h-[280px] overflow-y-auto space-y-1.5 pr-1">
        {filtered.length === 0 ? (
          <div className="rounded-md border border-dashed border-[var(--node-border)] px-3 py-4 text-[11px] text-[var(--neko-fg-secondary)]">
            当前筛选条件下还没有操作记录。
          </div>
        ) : (
          filtered.map((operation) => (
            <div
              key={operation.meta.id}
              className="rounded-md px-2 py-1.5"
              style={{
                border: '1px solid var(--node-border)',
                background: 'var(--node-surface)',
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="truncate text-[11px] font-medium">
                  {operation.meta.description ?? operation.type}
                </div>
                <div className="text-[10px] uppercase text-[var(--neko-fg-secondary)]">
                  {operation.meta.source}
                </div>
              </div>
              <div className="mt-1 text-[10px] text-[var(--neko-fg-secondary)]">
                {operation.type}
              </div>
              <div className="mt-1 text-[10px] text-[var(--neko-fg-tertiary)]">
                {new Date(operation.meta.timestamp).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
