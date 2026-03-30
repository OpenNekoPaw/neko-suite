/**
 * ContextMenu - Canvas right-click context menu
 *
 * Re-exports the shared macOS glass ContextMenu.
 * Emoji icon strings are valid ReactNode values and work transparently.
 */

export {
  ContextMenu,
  type ContextMenuProps,
  type MenuItem,
  type MenuAction,
  type MenuSeparator,
} from '@neko/shared/components';
import type { MenuItem } from '@neko/shared/components';
import { t } from '../../i18n';

export type MenuEntry = MenuItem;

// =============================================================================
// Menu Builders
// =============================================================================

export interface CanvasMenuContext {
  canvasPosition: { x: number; y: number };
  hasSelection: boolean;
  selectedCount: number;
  isNodeLocked?: boolean;
  onAddText: (pos: { x: number; y: number }) => void;
  onAddScene: (pos: { x: number; y: number }) => void;
  onAddShot?: (pos: { x: number; y: number }) => void;
  onAddGallery?: (pos: { x: number; y: number }) => void;
  onAddMedia: (type: 'image' | 'video' | 'audio') => void;
  onDelete: () => void;
  onSelectAll: () => void;
  onFitContent: () => void;
  onResetView: () => void;
  onCopy?: () => void;
  onCut?: () => void;
  onPaste?: () => void;
  onPasteInPlace?: () => void;
  onDuplicate?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onGroup?: () => void;
  onUngroup?: () => void;
  canGroup?: boolean;
  canUngroup?: boolean;
  canPaste?: boolean;
  canUndo?: boolean;
  canRedo?: boolean;
  // AI actions
  onGenerateSelected?: () => void;
  onBatchGenerate?: () => void;
  onSendToAgent?: () => void;
  hasShotSelected?: boolean;
}

/**
 * Build context menu items for canvas background right-click
 */
export function buildCanvasMenuItems(ctx: CanvasMenuContext): MenuEntry[] {
  return [
    { label: t('menu.addText'), icon: '📝', onClick: () => ctx.onAddText(ctx.canvasPosition) },
    { label: t('menu.addScene'), icon: '🎬', onClick: () => ctx.onAddScene(ctx.canvasPosition) },
    { label: t('menu.addShot'), icon: '🎬', onClick: () => ctx.onAddShot?.(ctx.canvasPosition) },
    {
      label: t('menu.addGallery'),
      icon: '🖼',
      onClick: () => ctx.onAddGallery?.(ctx.canvasPosition),
    },
    { separator: true },
    { label: t('menu.addImage'), icon: '🖼️', onClick: () => ctx.onAddMedia('image') },
    { label: t('menu.addVideo'), icon: '🎥', onClick: () => ctx.onAddMedia('video') },
    { label: t('menu.addAudio'), icon: '🎵', onClick: () => ctx.onAddMedia('audio') },
    { separator: true },
    {
      label: t('menu.paste'),
      icon: '📋',
      shortcut: '⌘V',
      onClick: () => ctx.onPaste?.(),
      disabled: !ctx.canPaste,
    },
    {
      label: t('menu.pasteInPlace'),
      icon: '📌',
      shortcut: '⇧⌘V',
      onClick: () => ctx.onPasteInPlace?.(),
      disabled: !ctx.canPaste,
    },
    { separator: true },
    {
      label: t('menu.undo'),
      icon: '↩',
      shortcut: '⌘Z',
      onClick: () => ctx.onUndo?.(),
      disabled: !ctx.canUndo,
    },
    {
      label: t('menu.redo'),
      icon: '↪',
      shortcut: '⇧⌘Z',
      onClick: () => ctx.onRedo?.(),
      disabled: !ctx.canRedo,
    },
    { separator: true },
    { label: t('menu.selectAll'), icon: '☐', shortcut: '⌘A', onClick: ctx.onSelectAll },
    { label: t('menu.fitContent'), icon: '⊞', onClick: ctx.onFitContent },
    { label: t('menu.resetView'), icon: '↺', onClick: ctx.onResetView },
  ];
}

/**
 * Build context menu items for node right-click
 */
export function buildNodeMenuItems(ctx: CanvasMenuContext): MenuEntry[] {
  return [
    { label: t('menu.copy'), icon: '📄', shortcut: '⌘C', onClick: () => ctx.onCopy?.() },
    { label: t('menu.cut'), icon: '✂️', shortcut: '⌘X', onClick: () => ctx.onCut?.() },
    { label: t('menu.duplicate'), icon: '⧉', shortcut: '⌘D', onClick: () => ctx.onDuplicate?.() },
    { separator: true },
    { label: t('menu.delete'), icon: '🗑', shortcut: '⌫', onClick: ctx.onDelete },
    { separator: true },
    {
      label: t('menu.group'),
      icon: '📁',
      shortcut: '⌘G',
      onClick: () => ctx.onGroup?.(),
      disabled: !ctx.canGroup,
    },
    {
      label: t('menu.ungroup'),
      icon: '📂',
      shortcut: '⇧⌘G',
      onClick: () => ctx.onUngroup?.(),
      disabled: !ctx.canUngroup,
    },
    { separator: true },
    { label: t('menu.bringToFront'), icon: '⬆', onClick: () => {} },
    { label: t('menu.sendToBack'), icon: '⬇', onClick: () => {} },
    { separator: true },
    { label: t('menu.addText'), icon: '📝', onClick: () => ctx.onAddText(ctx.canvasPosition) },
    { label: t('menu.addScene'), icon: '🎬', onClick: () => ctx.onAddScene(ctx.canvasPosition) },
    { label: t('menu.addShot'), icon: '🎬', onClick: () => ctx.onAddShot?.(ctx.canvasPosition) },
    {
      label: t('menu.addGallery'),
      icon: '🖼',
      onClick: () => ctx.onAddGallery?.(ctx.canvasPosition),
    },
    { separator: true },
    {
      label: '用 Agent 生成图像',
      icon: '✨',
      shortcut: '⌘G',
      onClick: () => ctx.onGenerateSelected?.(),
      disabled: !ctx.hasShotSelected,
    },
    {
      label: '批量生成选中镜头',
      icon: '⚡',
      onClick: () => ctx.onBatchGenerate?.(),
      disabled: !ctx.hasShotSelected || (ctx.selectedCount ?? 0) < 2,
    },
    { separator: true },
    { label: '发送到 Agent', icon: '→', onClick: () => ctx.onSendToAgent?.() },
  ];
}
