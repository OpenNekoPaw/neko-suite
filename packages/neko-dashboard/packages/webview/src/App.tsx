import { useEffect, useReducer } from 'react';
import type { DashboardTask } from '@neko/shared';
import { useTranslation } from './i18n/I18nContext';
import { MetricCards } from './components/MetricCards';
import { SkillList } from './components/SkillList';
import { WorkflowCards } from './components/WorkflowCards';
import { TaskTable } from './components/TaskTable';
import { CreativeEntitiesSection } from './components/CreativeEntitiesSection';
import { postMessage } from './services/messenger';
import { applyTaskChange } from './taskState';
import type {
  DashboardCreativeEntityState,
  DashboardData,
  DashboardSkill,
  ExtensionToWebviewMessage,
} from './types';
import type { SkillCatalogActionId } from '@neko/shared';

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
  | { readonly type: 'creativeEntitiesChanged'; readonly state: DashboardCreativeEntityState }
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
        case 'creativeEntitiesChanged':
          dispatch({ type: 'creativeEntitiesChanged', state: message.state });
          return;
        case 'creativeEntityActionResult':
          if (!message.result.ok && message.result.message) {
            dispatch({ type: 'error', message: message.result.message });
          }
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
  const projectCount = data?.projects.length ?? 0;
  const taskCount = data?.tasks.length ?? 0;
  const skillCount = data?.skills.length ?? 0;

  return (
    <main className="dashboard-shell">
      <header className="dashboard-header">
        <div className="dashboard-title-block">
          <h1>{t('dashboard.title')}</h1>
          <div className="dashboard-header-summary" aria-label={t('dashboard.summary')}>
            <span>
              {t('dashboard.status.projects')}: {projectCount}
            </span>
            <span>
              {t('tasks.title')}: {taskCount}
            </span>
            <span>
              {t('dashboard.skills')}: {skillCount}
            </span>
          </div>
        </div>
        <button
          className="dashboard-refresh-button"
          type="button"
          onClick={() => postMessage({ type: 'refresh' })}
        >
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

function handleSkillCommand(skill: DashboardSkill) {
  if (!skill.command) return;
  postMessage({
    type: 'executeCommand',
    command: skill.command,
    intent: skill.description,
    skill: {
      id: skill.id,
      extensionId: skill.extensionId,
      name: skill.name,
      description: skill.description,
      locale: skill.locale,
      ...(skill.tags ? { tags: skill.tags } : {}),
    },
  });
}

function handleSkillAction(
  skill: DashboardSkill | undefined,
  action: SkillCatalogActionId,
  input: { readonly skillName?: string } = {},
) {
  postMessage({
    type: 'skillAction',
    request: {
      action,
      ...(skill
        ? {
            skillRef: {
              extensionId: skill.extensionId,
              id: skill.id,
              source: skill.catalog.source,
            },
          }
        : {}),
      ...(input.skillName ? { skillName: input.skillName } : {}),
      ...(action === 'create' || action === 'fork' || action === 'duplicate'
        ? { targetSource: skill?.catalog.source === 'personal' ? 'personal' : 'project' }
        : {}),
    },
  });
}

function WelcomeView({ data }: { readonly data: DashboardData }) {
  return (
    <div className="dashboard-content">
      <MetricCards runtime={data.runtime} projectCount={0} taskCount={data.tasks.length} />
      <div className="dashboard-workbench-grid dashboard-workbench-grid--welcome">
        <div className="dashboard-main-stack">
          <WorkflowCards
            workflows={data.workflows}
            onCreateProject={handleCreateProject}
            onCommand={handleCommand}
          />
          <CreativeEntitiesPanel data={data} />
        </div>
        <aside className="dashboard-side-stack">
          <SkillList
            skills={data.skills}
            onCommand={handleSkillCommand}
            onSkillAction={handleSkillAction}
          />
        </aside>
      </div>
    </div>
  );
}

function WorkView({ data }: { readonly data: DashboardData }) {
  return (
    <div className="dashboard-content">
      <MetricCards
        runtime={data.runtime}
        projectCount={data.projects.length}
        taskCount={data.tasks.length}
      />
      <div className="dashboard-workbench-grid">
        <div className="dashboard-main-stack">
          <WorkflowCards
            workflows={data.workflows}
            onCreateProject={handleCreateProject}
            onCommand={handleCommand}
          />
          <CreativeEntitiesPanel data={data} />
          <TaskTable
            tasks={data.tasks}
            onCancel={(taskId) => postMessage({ type: 'cancelTask', taskId })}
            onRetry={(taskId) => postMessage({ type: 'retryTask', taskId })}
            onRevealOutput={(taskId) => postMessage({ type: 'revealTaskOutput', taskId })}
          />
        </div>
        <aside className="dashboard-side-stack">
          <SkillList
            skills={data.skills}
            onCommand={handleSkillCommand}
            onSkillAction={handleSkillAction}
          />
        </aside>
      </div>
    </div>
  );
}

function CreativeEntitiesPanel({ data }: { readonly data: DashboardData }) {
  return (
    <CreativeEntitiesSection
      state={data.creativeEntities}
      onSelect={(ref) => postMessage({ type: 'selectCreativeEntity', ref })}
      onAction={(request) => postMessage({ type: 'creativeEntityAction', request })}
      onRefresh={() => postMessage({ type: 'refreshCreativeEntities' })}
    />
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
    case 'creativeEntitiesChanged':
      if (!state.data) return state;
      return {
        ...state,
        data: {
          ...state.data,
          creativeEntities: action.state,
        },
      };
    case 'error':
      return { ...state, error: action.message };
  }
}
