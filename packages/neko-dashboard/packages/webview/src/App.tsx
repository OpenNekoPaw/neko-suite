import { useEffect, useReducer } from 'react';
import type { DashboardTask } from '@neko/shared';
import { useTranslation } from './i18n/I18nContext';
import { MetricCards } from './components/MetricCards';
import { SkillList } from './components/SkillList';
import { WorkflowCards } from './components/WorkflowCards';
import { TaskTable } from './components/TaskTable';
import { postMessage } from './services/messenger';
import { applyTaskChange } from './taskState';
import type { DashboardData, ExtensionToWebviewMessage } from './types';

interface DashboardState {
  readonly data: DashboardData | null;
  readonly error: string | null;
}

type Action =
  | { readonly type: 'update'; readonly data: DashboardData }
  | {
      readonly type: 'taskChanged';
      readonly task: DashboardTask;
      readonly eventType: 'added' | 'updated' | 'removed';
    }
  | { readonly type: 'error'; readonly message: string };

const initialState: DashboardState = {
  data: null,
  error: null,
};

export function App() {
  const { t } = useTranslation();
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    const listener = (event: MessageEvent<ExtensionToWebviewMessage>) => {
      const message = event.data;
      switch (message.type) {
        case 'update':
          dispatch({ type: 'update', data: message.data });
          return;
        case 'taskProgress':
          dispatch({
            type: 'taskChanged',
            task: message.event.task,
            eventType: message.event.type,
          });
          return;
        case 'taskCompleted':
          dispatch({ type: 'taskChanged', task: message.task, eventType: 'updated' });
          return;
        case 'error':
          dispatch({ type: 'error', message: message.message });
          return;
      }
    };

    window.addEventListener('message', listener);
    postMessage({ type: 'ready' });

    return () => window.removeEventListener('message', listener);
  }, []);

  const data = state.data;

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <h1>{t('dashboard.title')}</h1>
        <button type="button" onClick={() => postMessage({ type: 'refresh' })}>
          {t('common.refresh')}
        </button>
      </header>

      {state.error ? <div className="error-banner">{state.error}</div> : null}

      {data ? (
        data.mode === 'welcome' ? (
          <WelcomeView data={data} />
        ) : (
          <WorkView data={data} />
        )
      ) : (
        <div className="panel">{t('common.loading')}</div>
      )}
    </main>
  );
}

function handleCreateProject(projectType: DashboardData['projects'][number]['type']) {
  postMessage({ type: 'createProject', projectType });
}

function handleCommand(command: string) {
  postMessage({ type: 'executeCommand', command });
}

function WelcomeView({ data }: { readonly data: DashboardData }) {
  return (
    <>
      <MetricCards runtime={data.runtime} projectCount={0} taskCount={data.tasks.length} />
      <WorkflowCards
        workflows={data.workflows}
        onCreateProject={handleCreateProject}
        onCommand={handleCommand}
      />
      <SkillList skills={data.skills} onCommand={handleCommand} />
    </>
  );
}

function WorkView({ data }: { readonly data: DashboardData }) {
  return (
    <>
      <MetricCards
        runtime={data.runtime}
        projectCount={data.projects.length}
        taskCount={data.tasks.length}
      />
      <WorkflowCards
        workflows={data.workflows}
        onCreateProject={handleCreateProject}
        onCommand={handleCommand}
      />
      <SkillList skills={data.skills} onCommand={handleCommand} />
      <TaskTable
        tasks={data.tasks}
        onCancel={(taskId) => postMessage({ type: 'cancelTask', taskId })}
        onRetry={(taskId) => postMessage({ type: 'retryTask', taskId })}
        onRevealOutput={(taskId) => postMessage({ type: 'revealTaskOutput', taskId })}
      />
    </>
  );
}

function reducer(state: DashboardState, action: Action): DashboardState {
  switch (action.type) {
    case 'update':
      return { data: action.data, error: null };
    case 'taskChanged':
      if (!state.data) return state;
      return {
        ...state,
        data: {
          ...state.data,
          tasks: applyTaskChange(state.data.tasks, action.task, action.eventType),
        },
      };
    case 'error':
      return { ...state, error: action.message };
  }
}
