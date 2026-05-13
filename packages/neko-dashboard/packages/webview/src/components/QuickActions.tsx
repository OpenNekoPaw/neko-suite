import type { DashboardProjectType } from '../types';

const ACTIONS: ReadonlyArray<{ readonly type: DashboardProjectType; readonly label: string }> = [
  { type: 'video', label: 'New Video' },
  { type: 'canvas', label: 'New Canvas' },
  { type: 'sketch', label: 'New Sketch' },
  { type: 'audio', label: 'New Audio' },
  { type: 'model', label: 'New Model' },
  { type: 'puppet', label: 'New Puppet' },
];

export interface QuickActionsProps {
  readonly onCreateProject: (type: DashboardProjectType) => void;
}

export function QuickActions({ onCreateProject }: QuickActionsProps) {
  return (
    <section className="panel quick-actions" aria-label="Quick actions">
      <h2>Quick Start</h2>
      <div className="button-row">
        {ACTIONS.map((action) => (
          <button key={action.type} type="button" onClick={() => onCreateProject(action.type)}>
            {action.label}
          </button>
        ))}
      </div>
    </section>
  );
}
