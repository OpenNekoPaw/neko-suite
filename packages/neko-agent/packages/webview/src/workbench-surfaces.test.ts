import { describe, expect, it } from 'vitest';
import {
  AGENT_WORKBENCH_OWNER,
  createAgentWorkbenchSurfaceContributions,
} from './workbench-surfaces';

describe('Agent workbench surfaces', () => {
  it('exports host-neutral Agent surface descriptors owned by Agent', () => {
    const contributions = createAgentWorkbenchSurfaceContributions();

    expect(AGENT_WORKBENCH_OWNER.id).toBe('@neko-agent/webview');
    expect(contributions.map((contribution) => contribution.id)).toEqual([
      'neko.agent.right-panel',
      'neko.agent.main-panel',
      'neko.agent.floating-composer',
    ]);
    expect(contributions.map((contribution) => contribution.placement)).toEqual([
      'right-panel',
      'main-panel',
      'floating-composer',
    ]);
    expect(contributions.every((contribution) => contribution.owner.id === '@neko-agent/webview')).toBe(
      true,
    );
    expect(JSON.stringify(contributions)).not.toContain('React');
    expect(JSON.stringify(contributions)).not.toContain('Electron');
    expect(JSON.stringify(contributions)).not.toContain('vscode.');
  });
});
