// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';
import { applyHomeTheme } from './home-theme';

describe('Home theme composition', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-neko-theme');
    document.body.className = '';
  });

  it('projects shared light tokens and Electron theme compatibility attributes', () => {
    applyHomeTheme('light');

    expect(document.documentElement.dataset.nekoTheme).toBe('light');
    expect(document.documentElement.style.getPropertyValue('--neko-accent')).toContain(
      '--vscode-focusBorder',
    );
    expect(document.documentElement.style.getPropertyValue('--vscode-editor-background')).toBe(
      '#ffffff',
    );
    expect(document.body.classList.contains('vscode-light')).toBe(true);
  });

  it('switches to a dark token projection without retaining the light class', () => {
    applyHomeTheme('light');
    applyHomeTheme('dark');

    expect(document.documentElement.dataset.nekoTheme).toBe('dark');
    expect(document.documentElement.style.getPropertyValue('--vscode-editor-background')).toBe(
      '#202327',
    );
    expect(document.body.classList.contains('vscode-light')).toBe(false);
    expect(document.body.classList.contains('vscode-dark')).toBe(true);
  });
});
