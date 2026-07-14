import { nekoDesignTokens, type ThemeKind } from '@neko/shared/theme';

export type HomeThemeKind = Extract<ThemeKind, 'light' | 'dark'>;

const HOME_COMMON_VSCODE_TOKENS: Readonly<Record<string, string>> = {
  '--vscode-font-family':
    '-apple-system, BlinkMacSystemFont, "SF Pro Text", Inter, "Segoe UI", sans-serif',
  '--vscode-font-size': '13px',
  '--vscode-editor-font-family':
    '"SF Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  '--vscode-editor-font-size': '13px',
};

const HOME_LIGHT_VSCODE_TOKENS: Readonly<Record<string, string>> = {
  '--vscode-editor-background': '#ffffff',
  '--vscode-editor-foreground': '#202124',
  '--vscode-foreground': '#202124',
  '--vscode-descriptionForeground': '#62676d',
  '--vscode-focusBorder': '#1769aa',
  '--vscode-sideBar-background': '#eef0f2',
  '--vscode-sideBar-foreground': '#202124',
  '--vscode-sideBar-border': '#d9dcdf',
  '--vscode-panel-background': '#f5f6f7',
  '--vscode-panel-border': '#d9dcdf',
  '--vscode-list-hoverBackground': '#e7eaed',
  '--vscode-list-activeSelectionBackground': '#dde2e7',
  '--vscode-list-activeSelectionForeground': '#202124',
  '--vscode-input-background': '#ffffff',
  '--vscode-input-foreground': '#202124',
  '--vscode-input-border': '#b8bec5',
  '--vscode-input-placeholderForeground': '#7a8189',
  '--vscode-button-background': '#1769aa',
  '--vscode-button-foreground': '#ffffff',
  '--vscode-button-hoverBackground': '#0f5f9f',
  '--vscode-button-secondaryBackground': '#eef0f2',
  '--vscode-button-secondaryForeground': '#202124',
  '--vscode-button-secondaryHoverBackground': '#dde2e7',
  '--vscode-badge-background': '#e1e4e7',
  '--vscode-badge-foreground': '#59636e',
  '--vscode-icon-foreground': '#62676d',
  '--vscode-errorForeground': '#b42318',
  '--vscode-editorWarning-foreground': '#a15c00',
  '--vscode-editorInfo-foreground': '#1769aa',
  '--vscode-editorWidget-background': '#ffffff',
  '--vscode-editorWidget-border': '#d9dcdf',
  '--vscode-dropdown-background': '#ffffff',
  '--vscode-dropdown-foreground': '#202124',
  '--vscode-dropdown-border': '#b8bec5',
  '--vscode-toolbar-hoverBackground': '#e7eaed',
  '--vscode-toolbar-activeBackground': '#dde2e7',
  '--vscode-scrollbarSlider-background': 'rgba(70, 77, 84, 0.22)',
  '--vscode-scrollbarSlider-hoverBackground': 'rgba(70, 77, 84, 0.32)',
  '--vscode-scrollbarSlider-activeBackground': 'rgba(70, 77, 84, 0.42)',
};

const HOME_DARK_VSCODE_TOKENS: Readonly<Record<string, string>> = {
  '--vscode-editor-background': '#202327',
  '--vscode-editor-foreground': '#e7e9eb',
  '--vscode-foreground': '#e7e9eb',
  '--vscode-descriptionForeground': '#a7adb4',
  '--vscode-focusBorder': '#58a6d6',
  '--vscode-sideBar-background': '#191c20',
  '--vscode-sideBar-foreground': '#e7e9eb',
  '--vscode-sideBar-border': '#34383d',
  '--vscode-panel-background': '#181a1d',
  '--vscode-panel-border': '#34383d',
  '--vscode-list-hoverBackground': '#282d32',
  '--vscode-list-activeSelectionBackground': '#30353a',
  '--vscode-list-activeSelectionForeground': '#f2f3f4',
  '--vscode-input-background': '#282c31',
  '--vscode-input-foreground': '#e7e9eb',
  '--vscode-input-border': '#4b525a',
  '--vscode-input-placeholderForeground': '#8e969f',
  '--vscode-button-background': '#1769aa',
  '--vscode-button-foreground': '#ffffff',
  '--vscode-button-hoverBackground': '#2479b9',
  '--vscode-button-secondaryBackground': '#282c31',
  '--vscode-button-secondaryForeground': '#e7e9eb',
  '--vscode-button-secondaryHoverBackground': '#343a40',
  '--vscode-badge-background': '#34383d',
  '--vscode-badge-foreground': '#c1c6cb',
  '--vscode-icon-foreground': '#a7adb4',
  '--vscode-errorForeground': '#ff7b72',
  '--vscode-editorWarning-foreground': '#d29922',
  '--vscode-editorInfo-foreground': '#58a6d6',
  '--vscode-editorWidget-background': '#282c31',
  '--vscode-editorWidget-border': '#4b525a',
  '--vscode-dropdown-background': '#282c31',
  '--vscode-dropdown-foreground': '#e7e9eb',
  '--vscode-dropdown-border': '#4b525a',
  '--vscode-toolbar-hoverBackground': '#30353a',
  '--vscode-toolbar-activeBackground': '#3a4148',
  '--vscode-scrollbarSlider-background': 'rgba(190, 198, 206, 0.22)',
  '--vscode-scrollbarSlider-hoverBackground': 'rgba(190, 198, 206, 0.32)',
  '--vscode-scrollbarSlider-activeBackground': 'rgba(190, 198, 206, 0.42)',
};

export function detectHomeThemeKind(): HomeThemeKind {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyHomeTheme(kind: HomeThemeKind): void {
  const root = document.documentElement;
  const platform = readHomePlatform();
  const vscodeTokens = kind === 'dark' ? HOME_DARK_VSCODE_TOKENS : HOME_LIGHT_VSCODE_TOKENS;
  const nekoTokens = kind === 'dark' ? nekoDesignTokens.dark : nekoDesignTokens.light;
  applyCssTokens(root, HOME_COMMON_VSCODE_TOKENS);
  applyCssTokens(root, vscodeTokens);
  applyCssTokens(root, nekoTokens);
  root.dataset.nekoHomePlatform = platform;
  root.dataset.nekoTheme = kind;
  document.body.dataset.platform = platform;
  document.body.dataset.vscodeThemeKind = kind === 'dark' ? 'vscode-dark' : 'vscode-light';
  document.body.classList.remove('vscode-dark', 'vscode-light', 'vscode-high-contrast');
  document.body.classList.add(kind === 'dark' ? 'vscode-dark' : 'vscode-light');
}

export function initializeHomeTheme(): () => void {
  const preference = window.matchMedia('(prefers-color-scheme: dark)');
  const applyPreference = (): void => applyHomeTheme(preference.matches ? 'dark' : 'light');
  applyPreference();
  preference.addEventListener('change', applyPreference);
  return () => preference.removeEventListener('change', applyPreference);
}

function applyCssTokens(root: HTMLElement, tokens: Readonly<Record<string, string>>): void {
  for (const [name, value] of Object.entries(tokens)) root.style.setProperty(name, value);
}

function readHomePlatform(): string {
  const platform = navigator.platform.toLowerCase();
  if (platform.includes('mac')) return 'darwin';
  if (platform.includes('win')) return 'win32';
  if (platform.includes('linux')) return 'linux';
  return 'unknown';
}
