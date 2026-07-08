import { describe, expect, it } from 'vitest';
import { DESKTOP_MACOS_LIGHT_VSCODE_TOKENS } from '../desktop-theme';

describe('desktop theme adapter', () => {
  it('projects VSCode-compatible tokens for reused package webview components', () => {
    expect(DESKTOP_MACOS_LIGHT_VSCODE_TOKENS['--vscode-editor-background']).toBe('#ffffff');
    expect(DESKTOP_MACOS_LIGHT_VSCODE_TOKENS['--vscode-editor-foreground']).toBe('#1d1d1f');
    expect(DESKTOP_MACOS_LIGHT_VSCODE_TOKENS['--vscode-focusBorder']).toBe('#007aff');
    expect(DESKTOP_MACOS_LIGHT_VSCODE_TOKENS).toHaveProperty('--vscode-button-background');
    expect(DESKTOP_MACOS_LIGHT_VSCODE_TOKENS).toHaveProperty('--vscode-panel-border');
    expect(DESKTOP_MACOS_LIGHT_VSCODE_TOKENS).toHaveProperty('--vscode-charts-green');
  });
});
