import React from 'react';
import type { ModelSelectionWorkflow } from '../stores/modelStore';
import { useTranslation } from '../i18n/I18nContext';

export interface SelectionModeControlsProps {
  workflow: ModelSelectionWorkflow;
  typedPickingAvailable: boolean;
  characterRegionsAvailable: boolean;
  onWorkflowChange: (workflow: ModelSelectionWorkflow) => void;
}

const WORKFLOWS: readonly {
  readonly workflow: ModelSelectionWorkflow;
  readonly labelKey: string;
  readonly titleKey: string;
}[] = [
  {
    workflow: 'object',
    labelKey: 'selection.workflow.object',
    titleKey: 'selection.workflowTitle.object',
  },
  {
    workflow: 'face-region',
    labelKey: 'selection.workflow.faceRegion',
    titleKey: 'selection.workflowTitle.faceRegion',
  },
  {
    workflow: 'bone-pose',
    labelKey: 'selection.workflow.bonePose',
    titleKey: 'selection.workflowTitle.bonePose',
  },
  {
    workflow: 'light',
    labelKey: 'selection.workflow.light',
    titleKey: 'selection.workflowTitle.light',
  },
  {
    workflow: 'animation',
    labelKey: 'selection.workflow.animation',
    titleKey: 'selection.workflowTitle.animation',
  },
  {
    workflow: 'export-inspect',
    labelKey: 'selection.workflow.exportInspect',
    titleKey: 'selection.workflowTitle.exportInspect',
  },
];

export function SelectionModeControls({
  workflow,
  typedPickingAvailable,
  characterRegionsAvailable,
  onWorkflowChange,
}: SelectionModeControlsProps): React.JSX.Element {
  const { t } = useTranslation();

  return (
    <div className="model-selection-mode-controls" aria-label={t('selection.aria.workflowModes')}>
      {WORKFLOWS.map((item) => {
        const disabled =
          !typedPickingAvailable || (item.workflow === 'face-region' && !characterRegionsAvailable);
        return (
          <button
            key={item.workflow}
            type="button"
            className={workflow === item.workflow ? 'active' : undefined}
            aria-pressed={workflow === item.workflow}
            disabled={disabled}
            title={t(item.titleKey)}
            onClick={() => onWorkflowChange(item.workflow)}
          >
            {t(item.labelKey)}
          </button>
        );
      })}
    </div>
  );
}
