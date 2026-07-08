import { nekoDesignTokens, type ThemeKind } from '@neko/shared/theme';

export interface DesktopThemeInput {
  readonly kind: ThemeKind;
}

export const DESKTOP_MACOS_LIGHT_VSCODE_TOKENS: Readonly<Record<string, string>> = {
  '--vscode-font-family':
    '-apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, "Segoe UI", sans-serif',
  '--vscode-font-size': '13px',
  '--vscode-editor-font-family':
    '"SF Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  '--vscode-editor-font-size': '13px',
  '--vscode-editor-background': '#ffffff',
  '--vscode-editor-foreground': '#1d1d1f',
  '--vscode-foreground': 'var(--vscode-editor-foreground)',
  '--vscode-descriptionForeground': '#6e6e73',
  '--vscode-focusBorder': '#007aff',
  '--vscode-sideBar-background': '#f5f5f7',
  '--vscode-sideBar-foreground': '#1d1d1f',
  '--vscode-sideBar-border': 'rgba(60, 60, 67, 0.16)',
  '--vscode-sideBarTitle-foreground': '#3a3a3c',
  '--vscode-activityBar-background': '#f5f5f7',
  '--vscode-panel-background': '#f5f5f7',
  '--vscode-panel-border': 'rgba(60, 60, 67, 0.16)',
  '--vscode-panelTitle-activeForeground': '#1d1d1f',
  '--vscode-list-hoverBackground': 'rgba(0, 0, 0, 0.045)',
  '--vscode-list-activeSelectionBackground': 'rgba(0, 122, 255, 0.18)',
  '--vscode-list-activeSelectionForeground': '#1d1d1f',
  '--vscode-list-inactiveSelectionBackground': 'rgba(0, 122, 255, 0.10)',
  '--vscode-toolbar-hoverBackground': 'rgba(0, 0, 0, 0.055)',
  '--vscode-toolbar-activeBackground': 'rgba(0, 122, 255, 0.14)',
  '--vscode-input-background': '#ffffff',
  '--vscode-input-foreground': '#1d1d1f',
  '--vscode-input-border': 'rgba(60, 60, 67, 0.20)',
  '--vscode-input-placeholderForeground': '#8e8e93',
  '--vscode-button-background': '#007aff',
  '--vscode-button-foreground': '#ffffff',
  '--vscode-button-hoverBackground': '#0a84ff',
  '--vscode-button-secondaryBackground': 'rgba(60, 60, 67, 0.09)',
  '--vscode-button-secondaryForeground': '#1d1d1f',
  '--vscode-button-secondaryHoverBackground': 'rgba(60, 60, 67, 0.14)',
  '--vscode-badge-background': 'rgba(60, 60, 67, 0.10)',
  '--vscode-badge-foreground': '#5f6368',
  '--vscode-icon-foreground': '#6e6e73',
  '--vscode-errorForeground': '#ff3b30',
  '--vscode-editorWarning-foreground': '#b56a00',
  '--vscode-editorInfo-foreground': '#007aff',
  '--vscode-charts-blue': '#007aff',
  '--vscode-charts-green': '#34c759',
  '--vscode-charts-yellow': '#ffcc00',
  '--vscode-charts-orange': '#ff9500',
  '--vscode-charts-red': '#ff3b30',
  '--vscode-charts-purple': '#af52de',
  '--vscode-editorWidget-background': 'rgba(242, 242, 247, 0.96)',
  '--vscode-editorWidget-border': 'rgba(60, 60, 67, 0.16)',
  '--vscode-menu-background': 'rgba(242, 242, 247, 0.96)',
  '--vscode-menu-foreground': '#1d1d1f',
  '--vscode-dropdown-background': '#ffffff',
  '--vscode-dropdown-foreground': '#1d1d1f',
  '--vscode-dropdown-border': 'rgba(60, 60, 67, 0.18)',
  '--vscode-textBlockQuote-background': 'rgba(60, 60, 67, 0.07)',
  '--vscode-textCodeBlock-background': 'rgba(60, 60, 67, 0.08)',
  '--vscode-scrollbarSlider-background': 'rgba(60, 60, 67, 0.22)',
  '--vscode-scrollbarSlider-hoverBackground': 'rgba(60, 60, 67, 0.30)',
  '--vscode-scrollbarSlider-activeBackground': 'rgba(60, 60, 67, 0.40)',
  '--vscode-statusBar-background': '#f5f5f7',
  '--vscode-statusBar-foreground': '#5f6368',
};

const BODY_THEME_CLASSES: Record<ThemeKind, string> = {
  dark: 'vscode-dark',
  light: 'vscode-light',
  'high-contrast': 'vscode-high-contrast',
  'high-contrast-light': 'vscode-light',
};

const BODY_THEME_DATA: Record<ThemeKind, string> = {
  dark: 'vscode-dark',
  light: 'vscode-light',
  'high-contrast': 'vscode-high-contrast',
  'high-contrast-light': 'vscode-high-contrast-light',
};

export function applyDesktopTheme(input: DesktopThemeInput): void {
  const root = document.documentElement;
  const platform = readDesktopPlatform();
  root.dataset.nekoDesktopPlatform = platform;

  const tokens = input.kind === 'dark'
    ? nekoDesignTokens.dark
    : input.kind === 'high-contrast'
      ? nekoDesignTokens.highContrast
      : nekoDesignTokens.light;

  applyCssTokens(root, DESKTOP_MACOS_LIGHT_VSCODE_TOKENS);
  applyCssTokens(root, tokens);

  document.body.dataset.platform = platform;
  document.body.dataset.vscodeThemeKind = BODY_THEME_DATA[input.kind];
  document.body.classList.remove('vscode-dark', 'vscode-light', 'vscode-high-contrast');
  document.body.classList.add(BODY_THEME_CLASSES[input.kind]);
}

function applyCssTokens(
  root: HTMLElement,
  tokens: Readonly<Record<string, string>>,
): void {
  for (const [name, value] of Object.entries(tokens)) {
    root.style.setProperty(name, value);
  }
}

function readDesktopPlatform(): string {
  const platform = navigator.platform.toLowerCase();
  if (platform.includes('mac')) return 'darwin';
  if (platform.includes('win')) return 'win32';
  if (platform.includes('linux')) return 'linux';
  return 'unknown';
}
