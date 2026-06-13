/**
 * ContextMenu - Canvas right-click context menu
 *
 * Re-exports the shared macOS glass ContextMenu.
 * Emoji icon strings are valid ReactNode values and work transparently.
 */

export {
  PositionedContextMenu as ContextMenu,
  type MenuItem,
  type MenuAction,
  type MenuSeparator,
} from '@neko/ui/primitives';
export type {
  PositionedContextMenuProps,
  PositionedContextMenuProps as ContextMenuProps,
} from '@neko/ui/primitives';
import type { MenuItem } from '@neko/ui/primitives';
import { buildAIMenuSection } from '@neko/ui/primitives';
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
  onAddTable?: (pos: { x: number; y: number }) => void;
  onImportFile?: () => void;
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
  onSendToAgent?: (intent?: string) => void;
  hasShotSelected?: boolean;
  // Workflow: open selected shot image in neko-sketch
  onEditInSketch?: () => void;
  hasShotWithImage?: boolean;
  // E6: ControlNet editing + video generation
  onGenerateVideo?: () => void;
  onEditWithControlNet?: () => void;
}

/**
 * Build context menu items for canvas background right-click
 */
export function buildCanvasMenuItems(ctx: CanvasMenuContext): MenuEntry[] {
  return [
    {
      label: t('toolbar.addNode'),
      icon: '✚',
      onClick: () => {},
      submenu: [
        {
          label: t('menu.addShot'),
          icon: '🎬',
          onClick: () => ctx.onAddShot?.(ctx.canvasPosition),
        },
        {
          label: t('menu.addScene'),
          icon: '🎞',
          onClick: () => ctx.onAddScene(ctx.canvasPosition),
        },
        {
          label: t('menu.addGallery'),
          icon: '🖼',
          onClick: () => ctx.onAddGallery?.(ctx.canvasPosition),
        },
        {
          label: t('menu.addTable'),
          icon: '📊',
          onClick: () => ctx.onAddTable?.(ctx.canvasPosition),
        },
        { separator: true },
        { label: t('menu.addText'), icon: '📝', onClick: () => ctx.onAddText(ctx.canvasPosition) },
      ],
    },
    {
      label: t('menu.importFile'),
      icon: '📂',
      onClick: () => ctx.onImportFile?.(),
    },
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
    // ── AI section (unified shell) ──
    ...buildAIMenuSection({
      quickActions: [
        {
          id: 'generate-image',
          label: t('menu.ai.generateImage'),
          icon: '✨',
          disabled: !ctx.hasShotSelected,
          onClick: () => ctx.onGenerateSelected?.(),
        },
        {
          id: 'batch-generate',
          label: t('menu.ai.batchGenerate'),
          icon: '⚡',
          disabled: !ctx.hasShotSelected || (ctx.selectedCount ?? 0) < 2,
          onClick: () => ctx.onBatchGenerate?.(),
        },
        {
          id: 'edit-in-sketch',
          label: t('menu.ai.editInSketch'),
          icon: '🎨',
          disabled: !ctx.hasShotWithImage,
          onClick: () => ctx.onEditInSketch?.(),
        },
        {
          id: 'edit-with-controlnet',
          label: t('menu.ai.editWithControlNet'),
          icon: '🎛',
          disabled: !ctx.hasShotWithImage,
          onClick: () => ctx.onEditWithControlNet?.(),
        },
        {
          id: 'generate-video',
          label: t('menu.ai.generateVideo'),
          icon: '🎥',
          disabled: !ctx.hasShotWithImage,
          onClick: () => ctx.onGenerateVideo?.(),
        },
      ],
      agentActions: [
        {
          id: 'optimize-desc',
          label: t('menu.ai.optimizeDesc'),
          onClick: () => ctx.onSendToAgent?.('optimize'),
        },
        {
          id: 'adjust-camera',
          label: t('menu.ai.adjustCamera'),
          onClick: () => ctx.onSendToAgent?.('camera'),
        },
        {
          id: 'understand',
          label: t('menu.ai.understand'),
          onClick: () => ctx.onSendToAgent?.('understand'),
        },
      ],
      sendToAgentLabel: t('menu.ai.sendToAgent'),
    }),
  ];
}
