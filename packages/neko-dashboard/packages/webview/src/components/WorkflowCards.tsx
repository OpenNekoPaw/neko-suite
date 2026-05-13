import { useTranslation } from '../i18n/I18nContext';
import type { DashboardProjectType, WorkflowAvailability, WorkflowId } from '../types';

interface WorkflowAction {
  readonly labelKey: string;
  readonly projectType?: DashboardProjectType;
  readonly command?: string;
}

interface WorkflowDef {
  readonly id: WorkflowId;
  readonly actions: readonly WorkflowAction[];
}

const WORKFLOWS: readonly WorkflowDef[] = [
  {
    id: 'filmmaking',
    actions: [
      { labelKey: 'dashboard.quickStart.video', projectType: 'video' },
      { labelKey: 'dashboard.quickStart.audio', projectType: 'audio' },
    ],
  },
  {
    id: 'screenwriting',
    actions: [{ labelKey: 'dashboard.quickStart.screenplay', command: 'neko.story.newFile' }],
  },
  {
    id: 'visual',
    actions: [
      { labelKey: 'dashboard.quickStart.sketch', projectType: 'sketch' },
      { labelKey: 'dashboard.quickStart.canvas', projectType: 'canvas' },
    ],
  },
  {
    id: 'modeling',
    actions: [{ labelKey: 'dashboard.quickStart.model', projectType: 'model' }],
  },
  {
    id: 'animation',
    actions: [{ labelKey: 'dashboard.quickStart.puppet', projectType: 'puppet' }],
  },
  {
    id: 'ai',
    actions: [{ labelKey: 'dashboard.quickStart.ai', command: 'neko.ai.chat' }],
  },
];

export interface WorkflowCardsProps {
  readonly workflows: readonly WorkflowAvailability[];
  readonly onCreateProject: (type: DashboardProjectType) => void;
  readonly onCommand: (command: string) => void;
}

export function WorkflowCards({ workflows, onCreateProject, onCommand }: WorkflowCardsProps) {
  const { t } = useTranslation();
  const availMap = new Map(workflows.map((w) => [w.id, w.available]));

  return (
    <section className="panel" aria-label={t('dashboard.workflows')}>
      <h2>{t('dashboard.workflows')}</h2>
      <div className="workflow-grid">
        {WORKFLOWS.map((wf) => {
          const available = availMap.get(wf.id) ?? true;
          return (
            <WorkflowCard
              key={wf.id}
              id={wf.id}
              available={available}
              actions={wf.actions}
              onCreateProject={onCreateProject}
              onCommand={onCommand}
            />
          );
        })}
      </div>
    </section>
  );
}

interface WorkflowCardProps {
  readonly id: WorkflowId;
  readonly available: boolean;
  readonly actions: readonly WorkflowAction[];
  readonly onCreateProject: (type: DashboardProjectType) => void;
  readonly onCommand: (command: string) => void;
}

function WorkflowCard({ id, available, actions, onCreateProject, onCommand }: WorkflowCardProps) {
  const { t } = useTranslation();
  const tags = t(`dashboard.workflow.${id}.tags`)
    .split(',')
    .map((s) => s.trim());

  return (
    <div className={`workflow-card ${available ? '' : 'workflow-card--disabled'}`}>
      <h3 className="workflow-card-title">{t(`dashboard.workflow.${id}`)}</h3>
      <p className="workflow-card-desc">{t(`dashboard.workflow.${id}.desc`)}</p>
      <div className="workflow-card-tags">
        {tags.map((tag) => (
          <span key={tag} className="badge">
            {tag}
          </span>
        ))}
      </div>
      {available ? (
        <div className="workflow-card-actions">
          {actions.map((action) => (
            <button
              key={action.labelKey}
              type="button"
              onClick={() => {
                if (action.projectType) onCreateProject(action.projectType);
                else if (action.command) onCommand(action.command);
              }}
            >
              {t(action.labelKey)}
            </button>
          ))}
        </div>
      ) : (
        <div className="workflow-card-unavailable">{t('dashboard.workflow.unavailable')}</div>
      )}
    </div>
  );
}
