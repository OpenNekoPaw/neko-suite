/**
 * Theme Design Tokens
 *
 * Single source of truth for VSCode CSS variable mappings.
 * Used by:
 * 1. Tailwind preset (all webview tailwind.config.js)
 * 2. Runtime CSS variable access
 * 3. Documentation
 *
 * Token names match the Tailwind utility class names:
 *   bg-vscode-bg, text-vscode-fg, border-vscode-border, etc.
 *
 * Layer 0: Zero dependencies.
 */

export const vscodeCSSTokens = {
  colors: {
    // Editor
    'vscode-bg': 'var(--vscode-editor-background)',
    'vscode-fg': 'var(--vscode-editor-foreground)',

    // Panel
    'vscode-panel-bg': 'var(--vscode-panel-background)',
    'vscode-panel-border': 'var(--vscode-panel-border)',
    'vscode-panel-title': 'var(--vscode-panelTitle-activeForeground)',

    // Sidebar
    'vscode-sidebar-bg': 'var(--vscode-sideBar-background)',
    'vscode-sidebar-fg': 'var(--vscode-sideBar-foreground)',
    'vscode-sidebar-border': 'var(--vscode-sideBar-border)',

    // List
    'vscode-list-hover': 'var(--vscode-list-hoverBackground)',
    'vscode-list-active': 'var(--vscode-list-activeSelectionBackground)',
    'vscode-list-active-fg':
      'var(--vscode-list-activeSelectionForeground)',
    'vscode-list-inactive':
      'var(--vscode-list-inactiveSelectionBackground)',

    // Input
    'vscode-input-bg': 'var(--vscode-input-background)',
    'vscode-input-fg': 'var(--vscode-input-foreground)',
    'vscode-input-border': 'var(--vscode-input-border)',
    'vscode-input-placeholder':
      'var(--vscode-input-placeholderForeground)',

    // Button
    'vscode-button': 'var(--vscode-button-background)',
    'vscode-button-fg': 'var(--vscode-button-foreground)',
    'vscode-button-hover': 'var(--vscode-button-hoverBackground)',
    'vscode-button-secondary':
      'var(--vscode-button-secondaryBackground)',
    'vscode-button-secondary-fg':
      'var(--vscode-button-secondaryForeground)',
    'vscode-button-secondary-hover':
      'var(--vscode-button-secondaryHoverBackground)',

    // Focus / Accent
    'vscode-accent': 'var(--vscode-focusBorder)',
    'vscode-focus': 'var(--vscode-focusBorder)',

    // Badge
    'vscode-badge-bg': 'var(--vscode-badge-background)',
    'vscode-badge-fg': 'var(--vscode-badge-foreground)',

    // Icon
    'vscode-icon': 'var(--vscode-icon-foreground)',

    // Status
    'vscode-error': 'var(--vscode-errorForeground)',
    'vscode-warning': 'var(--vscode-editorWarning-foreground)',
    'vscode-info': 'var(--vscode-editorInfo-foreground)',

    // Toolbar
    'vscode-toolbar-bg': 'var(--vscode-toolbar-hoverBackground)',
    'vscode-toolbar-active': 'var(--vscode-toolbar-activeBackground)',

    // Dropdown
    'vscode-dropdown-bg': 'var(--vscode-dropdown-background)',
    'vscode-dropdown-fg': 'var(--vscode-dropdown-foreground)',
    'vscode-dropdown-border': 'var(--vscode-dropdown-border)',

    // Widget
    'vscode-widget-bg': 'var(--vscode-editorWidget-background)',
    'vscode-widget-border': 'var(--vscode-editorWidget-border)',

    // Description text
    'vscode-description': 'var(--vscode-descriptionForeground)',

    // Scrollbar
    'vscode-scrollbar': 'var(--vscode-scrollbarSlider-background)',
    'vscode-scrollbar-hover':
      'var(--vscode-scrollbarSlider-hoverBackground)',
    'vscode-scrollbar-active':
      'var(--vscode-scrollbarSlider-activeBackground)',

    // Legacy alias
    'vscode-border': 'var(--vscode-panel-border)',
  },

  fontFamily: {
    vscode: 'var(--vscode-font-family)',
    'vscode-editor': 'var(--vscode-editor-font-family)',
  },

  fontSize: {
    vscode: 'var(--vscode-font-size)',
    'vscode-editor': 'var(--vscode-editor-font-size)',
  },
} as const;
