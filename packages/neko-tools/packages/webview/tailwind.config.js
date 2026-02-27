/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./mediaDiff.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'vscode-bg': 'var(--vscode-editor-background)',
        'vscode-fg': 'var(--vscode-editor-foreground)',
        'vscode-panel-bg': 'var(--vscode-panel-background)',
        'vscode-panel-border': 'var(--vscode-panel-border)',
        'vscode-sidebar-bg': 'var(--vscode-sideBar-background)',
        'vscode-input-bg': 'var(--vscode-input-background)',
        'vscode-input-fg': 'var(--vscode-input-foreground)',
        'vscode-input-border': 'var(--vscode-input-border)',
        'vscode-button': 'var(--vscode-button-background)',
        'vscode-button-fg': 'var(--vscode-button-foreground)',
        'vscode-button-hover': 'var(--vscode-button-hoverBackground)',
        'vscode-button-secondary': 'var(--vscode-button-secondaryBackground)',
        'vscode-button-secondary-fg': 'var(--vscode-button-secondaryForeground)',
        'vscode-accent': 'var(--vscode-focusBorder)',
        'vscode-badge-bg': 'var(--vscode-badge-background)',
        'vscode-badge-fg': 'var(--vscode-badge-foreground)',
        'vscode-description': 'var(--vscode-descriptionForeground)',
        'vscode-error': 'var(--vscode-errorForeground)',
        'vscode-warning': 'var(--vscode-editorWarning-foreground)',
        'vscode-border': 'var(--vscode-panel-border)',
        'vscode-dropdown-bg': 'var(--vscode-dropdown-background)',
        'vscode-dropdown-fg': 'var(--vscode-dropdown-foreground)',
        'vscode-dropdown-border': 'var(--vscode-dropdown-border)',
      },
      fontFamily: {
        'vscode': 'var(--vscode-font-family)',
      },
      fontSize: {
        'vscode': 'var(--vscode-font-size)',
      },
    },
  },
  plugins: [],
}
