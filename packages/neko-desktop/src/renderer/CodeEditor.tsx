import { useEffect, useMemo, useRef, type ReactElement } from 'react';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
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

export function CodeEditor({ content, relativePath, truncated }: CodeEditorProps): ReactElement {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const languageExtensions = useMemo(() => selectLanguageExtensions(relativePath), [relativePath]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) {
      return;
    }

    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: content,
        extensions: [
          lineNumbers(),
          history(),
          drawSelection(),
          highlightActiveLine(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorView.editable.of(false),
          EditorState.readOnly.of(true),
          EditorView.theme({
            '&': {
              height: '100%',
              backgroundColor: '#ffffff',
              color: '#1f2933',
              fontSize: '13px',
            },
            '.cm-scroller': {
              fontFamily:
                'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace',
            },
            '.cm-gutters': {
              backgroundColor: '#f5f7fa',
              color: '#8a96a3',
              borderRight: '1px solid #d9dee5',
            },
            '.cm-activeLine': {
              backgroundColor: '#edf6ff',
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
    <div className="code-editor-panel" data-editor-adapter="codemirror">
      <header className="code-editor-panel__header">
        <strong>{relativePath}</strong>
        <span>CodeMirror</span>
      </header>
      {truncated ? (
        <p className="code-editor-panel__warning">File preview truncated to the first 256 KiB.</p>
      ) : null}
      <div ref={hostRef} className="code-editor-panel__host" />
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
    return [javascript({ typescript: normalizedPath.endsWith('.ts') || normalizedPath.endsWith('.tsx') })];
  }
  return [];
}
