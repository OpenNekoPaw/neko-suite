import { useState, useCallback, useEffect } from 'react';
import { useVSCodeMessaging } from './hooks/useVSCodeMessaging';
import { ScriptRenderer } from './components/ScriptRenderer';
import { ScriptTableView } from './components/ScriptTableView';
import { CreativeGridView } from './components/CreativeGridView';
import type {
  FountainDocument,
  MessageToWebview,
  StorySceneAction,
  StorySceneState,
  StoryViewMode,
} from './types';
import type { NekoStoryScriptIndex } from '@neko/shared';
import './styles/screenplay.css';
import './styles/print.css';

// =============================================================================
// Tab bar
// =============================================================================

const TABS: { id: StoryViewMode; label: string }[] = [
  { id: 'screenplay', label: '剧本预览' },
  { id: 'table', label: '分镜表' },
  { id: 'grid', label: '创意视图' },
];

function TabBar({
  active,
  onChange,
}: {
  active: StoryViewMode;
  onChange: (v: StoryViewMode) => void;
}) {
  return (
    <div
      className="flex items-center gap-0 flex-shrink-0"
      style={{ borderBottom: '1px solid var(--vscode-panel-border)' }}
    >
      {TABS.map((tab) => (
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
          {tab.label}
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
  const [view, setView] = useState<StoryViewMode>('screenplay');

  const handleMessage = useCallback((message: MessageToWebview) => {
    switch (message.type) {
      case 'update':
        setDocument(message.document);
        setScriptIndex(message.scriptIndex);
        break;
      case 'scrollTo':
        scrollToLine(message.line);
        break;
      case 'setView':
        setView(message.view);
        break;
    }
  }, []);

  useEffect(() => {
    if (!scriptIndex) {
      setSceneStates({});
      return;
    }

    setSceneStates((current) => {
      const next: Record<string, StorySceneState> = {};
      for (const scene of scriptIndex.scenes) {
        next[scene.sceneId] = current[scene.sceneId] ?? {
          sceneId: scene.sceneId,
          agentStatus: 'not-requested',
          canvasStatus: 'not-sent',
        };
      }
      return next;
    });
  }, [scriptIndex]);

  const { postMessage } = useVSCodeMessaging(handleMessage);

  const handleNavigate = useCallback((line: number) => {
    // Switch to screenplay view and scroll to line
    setView('screenplay');
    // Give the DOM a tick to switch views before scrolling
    setTimeout(() => scrollToLine(line), 50);
  }, []);

  const handleSceneAction = useCallback(
    (sceneId: string, action: StorySceneAction) => {
      setSceneStates((current) => {
        const existing = current[sceneId];
        if (!existing) {
          return current;
        }

        let nextState: StorySceneState = existing;
        switch (action) {
          case 'analyze':
            nextState = { ...existing, agentStatus: 'ready' };
            break;
          case 'generateStoryboard':
            nextState = { ...existing, agentStatus: 'review', canvasStatus: 'queued' };
            break;
          case 'sendToCanvas':
            nextState = { ...existing, canvasStatus: 'sent' };
            break;
          case 'openCanvas':
            nextState = { ...existing, canvasStatus: 'opened' };
            break;
          case 'toggleSkip': {
            const skipped = existing.agentStatus !== 'skipped' || existing.canvasStatus !== 'skipped';
            nextState = {
              ...existing,
              agentStatus: skipped ? 'skipped' : 'not-requested',
              canvasStatus: skipped ? 'skipped' : 'not-sent',
            };
            break;
          }
        }

        return { ...current, [sceneId]: nextState };
      });

      postMessage({ type: 'sceneAction', sceneId, action });
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
            onNavigate={handleNavigate}
            onSceneAction={handleSceneAction}
          />
        )}
        {view === 'grid' && <CreativeGridView document={document} onNavigate={handleNavigate} />}
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
