import type {
  WorkbenchAgentSurfaceContribution,
  WorkbenchContributionOwner,
} from '@neko/workbench-core';

export const AGENT_WORKBENCH_OWNER: WorkbenchContributionOwner = {
  id: '@neko-agent/webview',
  kind: 'core-package',
  displayName: 'Neko Agent',
  trust: 'core',
};

export function createAgentWorkbenchSurfaceContributions(): readonly WorkbenchAgentSurfaceContribution[] {
  return [
    {
      id: 'neko.agent.right-panel',
      kind: 'agent-surface',
      owner: AGENT_WORKBENCH_OWNER,
      label: 'Agent',
      placement: 'right-panel',
      runtime: 'agent-package-root',
      requiredHostCapabilities: ['workbench.agentSurfaces'],
      supportedHosts: ['vscode', 'electron'],
    },
    {
      id: 'neko.agent.main-panel',
      kind: 'agent-surface',
      owner: AGENT_WORKBENCH_OWNER,
      label: 'Agent Studio',
      placement: 'main-panel',
      runtime: 'agent-package-root',
      requiredHostCapabilities: ['workbench.agentSurfaces'],
      supportedHosts: ['vscode', 'electron'],
    },
    {
      id: 'neko.agent.floating-composer',
      kind: 'agent-surface',
      owner: AGENT_WORKBENCH_OWNER,
      label: 'Floating Composer',
      placement: 'floating-composer',
      runtime: 'agent-package-root',
      requiredHostCapabilities: ['workbench.agentSurfaces'],
      supportedHosts: ['vscode', 'electron'],
    },
  ];
}
