import { useState, useCallback } from 'react';
import { useVSCodeMessaging } from './hooks/useVSCodeMessaging';
import { ScriptRenderer } from './components/ScriptRenderer';
import { ScriptTableView } from './components/ScriptTableView';
import type {
  FountainDocument,
  MessageToWebview,
  StorySceneAction,
  StorySceneState,
  StoryViewMode,
} from './types';
import type { NekoStoryScriptIndex } from '@neko/shared';
import { useTranslation } from './i18n/I18nContext';
import './styles/screenplay.css';
import './styles/print.css';

// =============================================================================
// Tab bar
// =============================================================================

const TAB_IDS: { id: StoryViewMode; labelKey: string }[] = [
  { id: 'screenplay', labelKey: 'tab.screenplay' },
  { id: 'table', labelKey: 'tab.table' },
];

function TabBar({
  active,
  onChange,
}: {
  active: StoryViewMode;
  onChange: (v: StoryViewMode) => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      className="flex items-center gap-0 flex-shrink-0"
      style={{ borderBottom: '1px solid var(--vscode-panel-border)' }}
    >
      {TAB_IDS.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          style={{
            padding: '6px 14px',
            fontSize: 12,
            background: 'none',
            border: 'none',
            borderBottom:
              active === tab.id ? '2px solid var(--vscode-focusBorder)' : '2px solid transparent',
            color:
              active === tab.id
                ? 'var(--vscode-foreground)'
                : 'var(--vscode-descriptionForeground)',
            cursor: 'pointer',
            transition: 'color 0.1s',
            fontWeight: active === tab.id ? 600 : 400,
            marginBottom: -1,
          }}
        >
          {t(tab.labelKey)}
        </button>
      ))}
    </div>
  );
}

// =============================================================================
// App
// =============================================================================

export function App() {
  const [document, setDocument] = useState<FountainDocument | null>(null);
  const [scriptIndex, setScriptIndex] = useState<NekoStoryScriptIndex | null>(null);
  const [sceneStates, setSceneStates] = useState<Record<string, StorySceneState>>({});
  const [characterThumbnails, setCharacterThumbnails] = useState<Record<string, string>>({});
  const [view, setView] = useState<StoryViewMode>('screenplay');

  const handleMessage = useCallback((message: MessageToWebview) => {
    switch (message.type) {
      case 'update':
        setDocument(message.document);
        setScriptIndex(message.scriptIndex);
        setSceneStates(message.sceneStates);
        break;
      case 'scrollTo':
        scrollToLine(message.line);
        break;
      case 'setView':
        setView(message.view);
        break;
      case 'characterThumbnails':
        setCharacterThumbnails(message.data);
        break;
    }
  }, []);

  const { postMessage } = useVSCodeMessaging(handleMessage);

  const handleNavigate = useCallback(
    (line: number) => {
      postMessage({ type: 'navigate', line, character: 0 });
    },
    [postMessage],
  );

  const handleSceneAction = useCallback(
    (sceneId: string, action: StorySceneAction) => {
      postMessage({ type: 'sceneAction', sceneId, action });
    },
    [postMessage],
  );

  const handleCharacterSendToAgent = useCallback(
    (name: string) => {
      postMessage({ type: 'characterSendToAgent', name });
    },
    [postMessage],
  );

  const handleCharacterNavigate = useCallback(
    (name: string) => {
      postMessage({ type: 'characterNavigate', name });
    },
    [postMessage],
  );

  return (
    <div
      className="flex flex-col h-screen overflow-hidden"
      style={{ backgroundColor: 'var(--vscode-editor-background)' }}
    >
      <TabBar active={view} onChange={setView} />

      <div className="flex-1 overflow-hidden">
        {view === 'screenplay' && <ScriptRenderer document={document} />}
        {view === 'table' && (
          <ScriptTableView
            scriptIndex={scriptIndex}
            sceneStates={sceneStates}
            characterThumbnails={characterThumbnails}
            onNavigate={handleNavigate}
            onSceneAction={handleSceneAction}
            onCharacterSendToAgent={handleCharacterSendToAgent}
            onCharacterNavigate={handleCharacterNavigate}
          />
        )}
      </div>
    </div>
  );
}

function scrollToLine(line: number) {
  const elements = window.document.querySelectorAll<HTMLElement>('[data-line]');
  let closestElement: HTMLElement | null = null;
  let closestDiff = Infinity;

  elements.forEach((el) => {
    const elLine = parseInt(el.getAttribute('data-line') ?? '0', 10);
    const diff = Math.abs(elLine - line);
    if (diff < closestDiff) {
      closestDiff = diff;
      closestElement = el;
    }
  });

  if (closestElement !== null) {
    (closestElement as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}
