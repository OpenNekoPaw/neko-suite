/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Editor colors
        'vscode-bg': 'var(--vscode-editor-background)',
        'vscode-fg': 'var(--vscode-editor-foreground)',

        // Panel colors
        'vscode-panel-bg': 'var(--vscode-panel-background)',
        'vscode-panel-border': 'var(--vscode-panel-border)',
        'vscode-panel-title': 'var(--vscode-panelTitle-activeForeground)',

        // Sidebar colors
        'vscode-sidebar-bg': 'var(--vscode-sideBar-background)',
        'vscode-sidebar-fg': 'var(--vscode-sideBar-foreground)',
        'vscode-sidebar-border': 'var(--vscode-sideBar-border)',

        // List colors
        'vscode-list-hover': 'var(--vscode-list-hoverBackground)',
        'vscode-list-active': 'var(--vscode-list-activeSelectionBackground)',
        'vscode-list-active-fg': 'var(--vscode-list-activeSelectionForeground)',
        'vscode-list-inactive': 'var(--vscode-list-inactiveSelectionBackground)',

        // Input colors
        'vscode-input-bg': 'var(--vscode-input-background)',
        'vscode-input-fg': 'var(--vscode-input-foreground)',
        'vscode-input-border': 'var(--vscode-input-border)',
        'vscode-input-placeholder': 'var(--vscode-input-placeholderForeground)',

        // Button colors
        'vscode-button': 'var(--vscode-button-background)',
        'vscode-button-fg': 'var(--vscode-button-foreground)',
        'vscode-button-hover': 'var(--vscode-button-hoverBackground)',
        'vscode-button-secondary': 'var(--vscode-button-secondaryBackground)',
        'vscode-button-secondary-fg': 'var(--vscode-button-secondaryForeground)',
        'vscode-button-secondary-hover': 'var(--vscode-button-secondaryHoverBackground)',

        // Focus/Accent colors
        'vscode-accent': 'var(--vscode-focusBorder)',
        'vscode-focus': 'var(--vscode-focusBorder)',

        // Badge colors
        'vscode-badge-bg': 'var(--vscode-badge-background)',
        'vscode-badge-fg': 'var(--vscode-badge-foreground)',

        // Icon colors
        'vscode-icon': 'var(--vscode-icon-foreground)',

        // Status colors
        'vscode-error': 'var(--vscode-errorForeground)',
        'vscode-warning': 'var(--vscode-editorWarning-foreground)',
        'vscode-info': 'var(--vscode-editorInfo-foreground)',

        // Toolbar colors
        'vscode-toolbar-bg': 'var(--vscode-toolbar-hoverBackground)',
        'vscode-toolbar-active': 'var(--vscode-toolbar-activeBackground)',

        // Dropdown colors
        'vscode-dropdown-bg': 'var(--vscode-dropdown-background)',
        'vscode-dropdown-fg': 'var(--vscode-dropdown-foreground)',
        'vscode-dropdown-border': 'var(--vscode-dropdown-border)',

        // Widget colors
        'vscode-widget-bg': 'var(--vscode-editorWidget-background)',
        'vscode-widget-border': 'var(--vscode-editorWidget-border)',

        // Description text
        'vscode-description': 'var(--vscode-descriptionForeground)',

        // Legacy compatibility
        'vscode-border': 'var(--vscode-panel-border)',
      },
      fontFamily: {
        'vscode': 'var(--vscode-font-family)',
        'vscode-editor': 'var(--vscode-editor-font-family)',
      },
      fontSize: {
        'vscode': 'var(--vscode-font-size)',
        'vscode-editor': 'var(--vscode-editor-font-size)',
      },
    },
  },
  plugins: [],
}
