import { useState, useCallback } from 'react';
import { Tabs } from '@neko/ui/primitives';
import { useVSCodeMessaging } from './hooks/useVSCodeMessaging';
import { ScriptRenderer } from './components/ScriptRenderer';
import { ScriptTableView } from './components/ScriptTableView';
import type {
  FountainDocument,
  MessageToWebview,
  StoryTableAction,
  StoryTableActionScope,
  StoryViewMode,
} from './types';
import type { NekoStoryScriptIndex, StorySceneVideoReadiness } from '@neko/shared';
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
    <div className="story-view-tabs" aria-label={t('tab.table')}>
      <Tabs
        className="story-view-tabs-root"
        listClassName="story-view-tab-list"
        value={active}
        onValueChange={(value) => onChange(value as StoryViewMode)}
        items={TAB_IDS.map((tab) => ({
          value: tab.id,
          label: t(tab.labelKey),
        }))}
      />
    </div>
  );
}

// =============================================================================
// App
// =============================================================================

export function App() {
  const [document, setDocument] = useState<FountainDocument | null>(null);
  const [scriptIndex, setScriptIndex] = useState<NekoStoryScriptIndex | null>(null);
  const [readinessRows, setReadinessRows] = useState<readonly StorySceneVideoReadiness[]>([]);
  const [characterThumbnails, setCharacterThumbnails] = useState<Record<string, string>>({});
  const [view, setView] = useState<StoryViewMode>('screenplay');

  const handleMessage = useCallback((message: MessageToWebview) => {
    switch (message.type) {
      case 'update':
        setDocument(message.document);
        setScriptIndex(message.scriptIndex);
        if (message.readinessRows) {
          setReadinessRows(message.readinessRows);
        } else {
          setReadinessRows([]);
        }
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

  const handleTableAction = useCallback(
    (action: StoryTableAction, scope?: StoryTableActionScope) => {
      postMessage({ type: 'tableAction', action, scope });
    },
    [postMessage],
  );

  const handleCharacterNavigate = useCallback(
    (name: string, sceneId?: string, characterId?: string) => {
      postMessage({ type: 'characterNavigate', name, sceneId, characterId });
    },
    [postMessage],
  );

  return (
    <div
      className="story-view-shell"
      style={{ backgroundColor: 'var(--vscode-editor-background)' }}
    >
      <TabBar active={view} onChange={setView} />

      <div className="story-view-content">
        {view === 'screenplay' && <ScriptRenderer document={document} />}
        {view === 'table' && (
          <ScriptTableView
            scriptIndex={scriptIndex}
            readinessRows={readinessRows}
            characterThumbnails={characterThumbnails}
            onNavigate={handleNavigate}
            onTableAction={handleTableAction}
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
