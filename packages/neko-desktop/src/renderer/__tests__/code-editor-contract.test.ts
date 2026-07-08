import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('desktop code editor contract', () => {
  it('keeps CodeMirror editable with syntax highlighting and a minimap surface', () => {
    const source = readFileSync(resolve(packageRoot, 'src/renderer/CodeEditor.tsx'), 'utf8');

    expect(source).toContain("from '@codemirror/language'");
    expect(source).toContain('syntaxHighlighting(defaultHighlightStyle');
    expect(source).not.toContain('EditorView.editable.of(false)');
    expect(source).not.toContain('EditorState.readOnly.of(true)');
    expect(source).toContain('EditorView.updateListener.of');
    expect(source).toContain('code-editor-body');
    expect(source).toContain('code-editor-minimap');
    expect(source).toContain('aria-label="Document minimap"');
  });

  it('keeps the editor host in the flexible grid row for normal and truncated files', () => {
    const styles = readFileSync(resolve(packageRoot, 'src/renderer/styles.css'), 'utf8');

    expect(styles).toContain('grid-template-rows: 34px minmax(0, 1fr);');
    expect(styles).toMatch(/\.code-editor-panel\[data-truncated=['"]true['"]\]/u);
    expect(styles).toContain('grid-template-rows: 34px auto minmax(0, 1fr);');
    expect(styles).toContain('.code-editor-body');
    expect(styles).toContain('grid-template-columns: minmax(0, 1fr) 72px;');
    expect(styles).toContain('.code-editor-minimap');
    expect(styles).toContain('.code-editor-panel__host .cm-scroller');
  });
});
