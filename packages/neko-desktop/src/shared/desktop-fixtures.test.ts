import { describe, expect, it } from 'vitest';
import { createDesktopMvpSnapshot } from './desktop-fixtures';

describe('desktop snapshot factory', () => {
  it('lists distinct workbench surfaces for project, domain, catalog, and search workflows', () => {
    const snapshot = createDesktopMvpSnapshot({ workspaceRoot: '${WORKSPACE}/neko-project' });

    expect(snapshot.surfaces.map((surface) => surface.id)).toEqual([
      'explorer',
      'assets',
      'generations',
      'market',
      'skills',
      'search',
    ]);
    expect(snapshot.resourceSurfaces.map((surface) => surface.surfaceId)).toEqual([
      'explorer',
      'assets',
      'generations',
      'market',
      'skills',
      'search',
    ]);
  });

  it('does not fabricate resource nodes or workspace files without runtime loaders', () => {
    const snapshot = createDesktopMvpSnapshot({ workspaceRoot: '${WORKSPACE}/neko-project' });

    expect(snapshot.workspaceTree.nodes).toEqual([]);
    expect(snapshot.workspaceTree.totalFileCount).toBe(0);
    expect(snapshot.resourceSurfaces.every((surface) => surface.nodes.length === 0)).toBe(true);
    expect(JSON.stringify(snapshot)).not.toContain('Storyboard Director');
    expect(JSON.stringify(snapshot)).not.toContain('Quality Review');
    expect(JSON.stringify(snapshot)).not.toContain('Shot 001 keyframe');
    expect(JSON.stringify(snapshot)).not.toContain('Trailer export');
  });

  it('accepts real resource surfaces injected by the desktop AppHost loader', () => {
    const snapshot = createDesktopMvpSnapshot({
      workspaceRoot: '${WORKSPACE}/neko-project',
      resourceSurfaces: [
        {
          surfaceId: 'skills',
          title: 'Skills',
          description: 'Workspace skills.',
          nodes: [
            {
              id: 'skill:review',
              sourceId: 'skills',
              kind: 'skill',
              label: 'review',
              ref: { kind: 'skill', id: '.neko/skills/review/SKILL.md', source: 'skills' },
            },
          ],
        },
      ],
    });

    expect(snapshot.resourceSurfaces).toHaveLength(1);
    expect(snapshot.resourceSurfaces[0]?.nodes[0]?.ref.id).toBe('.neko/skills/review/SKILL.md');
  });

  it('marks the Engine viewport as unavailable until runtime health is injected', () => {
    const snapshot = createDesktopMvpSnapshot({ workspaceRoot: '${WORKSPACE}/neko-project' });

    expect(snapshot.viewport.owner).toBe('neko-engine');
    expect(snapshot.viewport.availability).toBe('unavailable');
    expect(snapshot.viewport.capabilities).toContain('engine-owned-output-truth');
    expect(snapshot.viewport.nonAuthoritativeWebSurfaces).toContain('electron-webcontents');
  });

  it('keeps Agent UI state out of the desktop snapshot contract', () => {
    const snapshot = createDesktopMvpSnapshot({ workspaceRoot: '${WORKSPACE}/neko-project' });

    expect(snapshot.host.locale).toBe('en');
    expect('agentConsole' in snapshot).toBe(false);
    expect(JSON.stringify(snapshot)).not.toContain('agent-projection');
    expect(JSON.stringify(snapshot)).not.toContain('task-projection');
  });
});
