import { useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { EditorState, type Extension } from '@codemirror/state';
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  keymap,
  lineNumbers,
} from '@codemirror/view';

export interface CodeEditorProps {
  readonly content: string;
  readonly relativePath: string;
  readonly truncated: boolean;
}

interface CodeEditorMinimapLine {
  readonly emphasis: number;
  readonly widthPercent: number;
}

export function CodeEditor({ content, relativePath, truncated }: CodeEditorProps): ReactElement {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [documentText, setDocumentText] = useState(content);
  const languageExtensions = useMemo(() => selectLanguageExtensions(relativePath), [relativePath]);
  const minimapLines = useMemo(() => createMinimapLines(documentText), [documentText]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    setDocumentText(content);
    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: content,
        extensions: [
          lineNumbers(),
          history(),
          drawSelection(),
          highlightActiveLine(),
          syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              setDocumentText(update.state.doc.toString());
            }
          }),
          EditorView.theme({
            '&': {
              height: '100%',
              backgroundColor: 'var(--vscode-editor-background, #ffffff)',
              color: 'var(--vscode-editor-foreground, #1f2933)',
              fontSize: 'var(--vscode-editor-font-size, 13px)',
            },
            '.cm-scroller': {
              fontFamily:
                'var(--vscode-editor-font-family, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace)',
              overflow: 'auto',
            },
            '.cm-content': {
              minHeight: '100%',
              caretColor: 'var(--vscode-editorCursor-foreground, #007aff)',
            },
            '.cm-gutters': {
              backgroundColor: 'var(--vscode-editorGutter-background, #f5f7fa)',
              color: 'var(--vscode-editorLineNumber-foreground, #8a96a3)',
              borderRight: '1px solid var(--vscode-editorGroup-border, #d9dee5)',
            },
            '.cm-activeLine': {
              backgroundColor: 'var(--vscode-editor-lineHighlightBackground, #edf6ff)',
            },
            '.cm-activeLineGutter': {
              backgroundColor: 'var(--vscode-editor-lineHighlightBackground, #edf6ff)',
            },
          }),
          ...languageExtensions,
        ],
      }),
    });

    return () => {
      view.destroy();
    };
  }, [content, languageExtensions]);

  return (
    <div
      className="code-editor-panel"
      data-editor-adapter="codemirror"
      data-truncated={truncated ? 'true' : 'false'}
    >
      <header className="code-editor-panel__header">
        <strong>{relativePath}</strong>
        <span>CodeMirror</span>
      </header>
      {truncated ? (
        <p className="code-editor-panel__warning">File preview truncated to the first 256 KiB.</p>
      ) : null}
      <div className="code-editor-body">
        <div ref={hostRef} className="code-editor-panel__host" />
        <aside className="code-editor-minimap" aria-label="Document minimap">
          {minimapLines.map((line, index) => (
            <span
              key={`${index}:${line.widthPercent}`}
              className="code-editor-minimap__line"
              style={{
                inlineSize: `${line.widthPercent}%`,
                opacity: line.emphasis,
              }}
            />
          ))}
        </aside>
      </div>
    </div>
  );
}

function selectLanguageExtensions(relativePath: string): readonly Extension[] {
  const normalizedPath = relativePath.toLowerCase();
  if (normalizedPath.endsWith('.json')) {
    return [json()];
  }
  if (normalizedPath.endsWith('.md') || normalizedPath.endsWith('.fountain')) {
    return [markdown()];
  }
  if (
    normalizedPath.endsWith('.js') ||
    normalizedPath.endsWith('.jsx') ||
    normalizedPath.endsWith('.ts') ||
    normalizedPath.endsWith('.tsx')
  ) {
    return [
      javascript({ typescript: normalizedPath.endsWith('.ts') || normalizedPath.endsWith('.tsx') }),
    ];
  }
  return [];
}

function createMinimapLines(content: string): readonly CodeEditorMinimapLine[] {
  const lines = content.split(/\r\n|\r|\n/u);
  const maxLines = 220;
  const step = Math.max(1, Math.ceil(lines.length / maxLines));
  const minimapLines: CodeEditorMinimapLine[] = [];

  for (let index = 0; index < lines.length; index += step) {
    const group = lines.slice(index, index + step);
    const longestLineLength = group.reduce(
      (longest, line) => Math.max(longest, line.trimEnd().length),
      0,
    );
    minimapLines.push({
      emphasis: longestLineLength > 0 ? 0.48 : 0.18,
      widthPercent:
        longestLineLength > 0 ? Math.min(100, Math.max(12, (longestLineLength / 96) * 100)) : 5,
    });
  }

  return minimapLines.length > 0 ? minimapLines : [{ emphasis: 0.18, widthPercent: 5 }];
}
