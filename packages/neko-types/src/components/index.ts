/**
 * @neko/shared/components — Shared UI component library
 *
 * Components use CSS classes injected by the Tailwind preset plugin.
 * All packages using nekoTailwindPreset get these classes automatically.
 *
 * Import:
 *   import { VerticalToolbar, ToolbarButton, ContextMenu, MacButton, ... } from '@neko/shared/components';
 */

// ── Layout / Structure ────────────────────────────────────────────────────────

export { VerticalToolbar, ToolbarButton, ToolbarSeparator, ToolbarSpacer } from './Toolbar';
export type { VerticalToolbarProps, ToolbarButtonProps } from './Toolbar';

export { CollapsibleSection } from './CollapsibleSection';
export type { CollapsibleSectionProps } from './CollapsibleSection';

export { Panel, PanelSection } from './Panel';
export type { PanelProps, PanelSectionProps } from './Panel';

// ── Overlay ───────────────────────────────────────────────────────────────────

export { ContextMenu } from './ContextMenu';
export type { ContextMenuProps, MenuItem, MenuAction, MenuSeparator } from './ContextMenu';

export { buildAIMenuSection } from './contextMenuAI';
export type { AICapability, AIMenuConfig } from './contextMenuAI';

// ── Media ─────────────────────────────────────────────────────────────────────

export { TimelineRuler } from './TimelineRuler';
export type { TimelineRulerProps } from './TimelineRuler';

export { ProgressBar } from './ProgressBar';
export type { ProgressBarProps } from './ProgressBar';

// ── Primitives (macOS-style controls) ─────────────────────────────────────────

export { MacButton } from './MacButton';
export type { MacButtonProps, ButtonVariant, ButtonSize } from './MacButton';

export { MacIconButton } from './MacIconButton';
export type { MacIconButtonProps, IconButtonSize } from './MacIconButton';

export { MacSlider } from './MacSlider';
export type { MacSliderProps } from './MacSlider';

export { MacTabs } from './MacTabs';
export type { MacTabsProps, MacTab } from './MacTabs';
