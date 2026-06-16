import { Badge, Button } from '@neko/ui/primitives';
import { useTranslation } from '../i18n/I18nContext';
import type { DashboardProjectType, WorkflowAvailability, WorkflowId } from '../types';

interface WorkflowAction {
  readonly labelKey: string;
  readonly projectType?: DashboardProjectType;
  readonly command?: string;
  readonly variant: 'primary' | 'secondary';
}

type WorkflowStage = 'available' | 'developing';

interface WorkflowDef {
  readonly id: WorkflowId;
  readonly availabilityId: WorkflowId;
  readonly stage: WorkflowStage;
  readonly actions: readonly WorkflowAction[];
  readonly accent: 'blue' | 'green' | 'violet' | 'amber' | 'red' | 'cyan';
}

const WORKFLOWS: readonly WorkflowDef[] = [
  {
    id: 'fountain',
    availabilityId: 'fountain',
    stage: 'available',
    accent: 'green',
    actions: [
      {
        labelKey: 'dashboard.workflow.fountain.action.primary',
        projectType: 'story',
        variant: 'primary',
      },
      {
        labelKey: 'dashboard.workflow.fountain.action.agent',
        command: 'neko.story.sendToAgent',
        variant: 'secondary',
      },
    ],
  },
  {
    id: 'nkc',
    availabilityId: 'nkc',
    stage: 'available',
    accent: 'blue',
    actions: [
      {
        labelKey: 'dashboard.workflow.nkc.action.primary',
        projectType: 'canvas',
        variant: 'primary',
      },
      {
        labelKey: 'dashboard.workflow.nkc.action.preview',
        command: 'neko.canvas.openNarrativePreview',
        variant: 'secondary',
      },
    ],
  },
  {
    id: 'nkv',
    availabilityId: 'nkv',
    stage: 'available',
    accent: 'cyan',
    actions: [
      {
        labelKey: 'dashboard.workflow.nkv.action.primary',
        projectType: 'video',
        variant: 'primary',
      },
    ],
  },
  {
    id: 'nka',
    availabilityId: 'nka',
    stage: 'developing',
    accent: 'violet',
    actions: [
      {
        labelKey: 'dashboard.workflow.nka.action.primary',
        projectType: 'audio',
        variant: 'primary',
      },
    ],
  },
  {
    id: 'nkm',
    availabilityId: 'nkm',
    stage: 'developing',
    accent: 'amber',
    actions: [
      {
        labelKey: 'dashboard.workflow.nkm.action.primary',
        projectType: 'model',
        variant: 'primary',
      },
      {
        labelKey: 'dashboard.workflow.nkm.action.live',
        command: 'neko.model.liveMode.start',
        variant: 'secondary',
      },
    ],
  },
  {
    id: 'nkp',
    availabilityId: 'nkp',
    stage: 'developing',
    accent: 'red',
    actions: [
      {
        labelKey: 'dashboard.workflow.nkp.action.primary',
        projectType: 'puppet',
        variant: 'primary',
      },
      {
        labelKey: 'dashboard.workflow.nkp.action.live',
        command: 'neko.puppet.liveMode.start',
        variant: 'secondary',
      },
    ],
  },
  {
    id: 'nks',
    availabilityId: 'nks',
    stage: 'developing',
    accent: 'violet',
    actions: [
      {
        labelKey: 'dashboard.workflow.nks.action.primary',
        projectType: 'sketch',
        variant: 'primary',
      },
    ],
  },
];

export interface WorkflowCardsProps {
  readonly workflows: readonly WorkflowAvailability[];
  readonly onCreateProject: (type: DashboardProjectType) => void;
  readonly onCommand: (command: string) => void;
}

export function WorkflowCards({ workflows, onCreateProject, onCommand }: WorkflowCardsProps) {
  const { t } = useTranslation();
  const workflowMap = new Map(workflows.map((w) => [w.id, w]));

  return (
    <section className="workflow-section" aria-label={t('dashboard.workflows')}>
      <h2>{t('dashboard.workflows')}</h2>
      <div className="workflow-grid">
        {WORKFLOWS.map((wf) => {
          const availability = workflowMap.get(wf.availabilityId);
          return (
            <WorkflowCard
              key={wf.id}
              id={wf.id}
              available={availability?.available ?? true}
              state={availability?.state}
              stage={wf.stage}
              accent={wf.accent}
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
  readonly state?: WorkflowAvailability['state'];
  readonly stage: WorkflowStage;
  readonly accent: WorkflowDef['accent'];
  readonly actions: readonly WorkflowAction[];
  readonly onCreateProject: (type: DashboardProjectType) => void;
  readonly onCommand: (command: string) => void;
}

function WorkflowCard({
  id,
  available,
  state,
  stage,
  accent,
  actions,
  onCreateProject,
  onCommand,
}: WorkflowCardProps) {
  const { t } = useTranslation();
  const tags = t(`dashboard.workflow.${id}.tags`)
    .split(',')
    .map((s) => s.trim());
  const interactive = stage === 'available' && available;
  const statusLabel = getWorkflowStatusLabel(t, available, state, stage);

  return (
    <div
      className={`workflow-card workflow-card--${accent} ${
        stage === 'available' && !available ? 'workflow-card--disabled' : ''
      } ${stage === 'developing' ? 'workflow-card--developing' : ''}`}
      aria-disabled={!interactive}
    >
      <h3 className="workflow-card-title">{t(`dashboard.workflow.${id}`)}</h3>
      <p className="workflow-card-desc">{t(`dashboard.workflow.${id}.desc`)}</p>
      <div className="workflow-card-tags">
        {tags.map((tag) => (
          <Badge key={tag} className="h-auto rounded-full px-2 py-0.5">
            {tag}
          </Badge>
        ))}
      </div>
      {interactive ? (
        <div className="workflow-card-actions">
          {actions.map((action) => (
            <Button
              key={action.labelKey}
              size="sm"
              variant={action.variant === 'primary' ? 'default' : 'secondary'}
              className={action.variant === 'primary' ? 'workflow-card-primary-action' : undefined}
              onClick={() => {
                if (action.projectType) onCreateProject(action.projectType);
                else if (action.command) onCommand(action.command);
              }}
            >
              {t(action.labelKey)}
            </Button>
          ))}
        </div>
      ) : (
        <div
          className={`workflow-card-unavailable ${
            stage === 'developing' ? 'workflow-card-unavailable--developing' : ''
          }`}
        >
          {statusLabel}
        </div>
      )}
    </div>
  );
}

function getWorkflowStatusLabel(
  t: (key: string, values?: Record<string, string | number>) => string,
  available: boolean,
  state: WorkflowAvailability['state'] | undefined,
  stage: WorkflowStage,
): string {
  if (stage === 'developing') return t('dashboard.workflow.developing');
  if (available) return t('dashboard.status.ready');
  switch (state) {
    case 'missing':
      return t('dashboard.workflow.missing');
    case 'error':
      return t('dashboard.workflow.activationFailed');
    case 'inactive':
      return t('dashboard.workflow.inactive');
    default:
      return t('dashboard.workflow.unavailable');
  }
}
