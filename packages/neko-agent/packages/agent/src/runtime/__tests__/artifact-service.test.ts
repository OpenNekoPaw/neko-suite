import { describe, expect, it } from 'vitest';
import type { Draft, ExecutionPlan, Task } from '@neko-agent/types';
import { createWorkspaceArtifactService, toIdcRunArtifactBinding } from '../artifact-service';

describe('createWorkspaceArtifactService', () => {
  it('writes draft / plan / task creation documents to creator-facing paths and indexes them by run', async () => {
    const writes: Array<{ path: string; data: string }> = [];
    const dirs: string[] = [];
    const service = createWorkspaceArtifactService({
      workspaceRoot: '/workspace/demo',
      fsOps: {
        async mkdir(path: string): Promise<void> {
          dirs.push(path);
        },
        async writeFile(path: string, data: string, _encoding: 'utf-8'): Promise<void> {
          writes.push({ path, data });
        },
      },
    });

    const draft: Draft = {
      id: 'draft-1',
      title: 'Launch teaser',
      status: 'pending_review',
      domain: 'cut',
      createdAt: 1,
      updatedAt: 2,
      intent: 'Sell the vibe.',
      approach: 'Open with motion.',
      artifact: 'A 15 second teaser.',
    };
    const plan: ExecutionPlan = {
      id: 'plan-1',
      draftId: 'draft-1',
      title: 'Launch teaser plan',
      status: 'ready',
      createdAt: 3,
      updatedAt: 4,
      steps: [
        {
          id: 'step-1',
          tool: 'write',
          rationale: 'Persist the teaser.',
          args: '{"path":"out.md"}',
        },
      ],
    };
    const task: Task = {
      id: 'task-1',
      createdAt: 5,
      updatedAt: 6,
      items: [{ id: 'task-item-1', content: 'Export preview', status: 'pending' }],
    };

    const draftRecord = await service.writeDraft('run-1', draft);
    const planRecord = await service.writePlan('run-1', plan);
    const taskRecord = await service.writeTask('run-1', task);

    expect(dirs).toEqual([
      '/workspace/demo/neko/creations/cut-launch-teaser-draft-1',
      '/workspace/demo/.neko/.cache',
      '/workspace/demo/neko/creations/cut-launch-teaser-draft-1',
      '/workspace/demo/neko/creations/cut-launch-teaser-draft-1',
    ]);
    expect(writes.map((entry) => entry.path)).toEqual([
      '/workspace/demo/neko/creations/cut-launch-teaser-draft-1/brief.md',
      '/workspace/demo/.neko/.cache/artifact-index.json',
      '/workspace/demo/neko/creations/cut-launch-teaser-draft-1/plan.md',
      '/workspace/demo/.neko/.cache/artifact-index.json',
      '/workspace/demo/neko/creations/cut-launch-teaser-draft-1/checklist.md',
      '/workspace/demo/.neko/.cache/artifact-index.json',
    ]);
    expect(draftRecord.content).toContain('# Launch teaser');
    expect(planRecord.content).toContain('## Steps');
    expect(taskRecord.content).toContain('# Tasks');
    expect(service.listRunIds()).toEqual(['run-1']);
    expect(service.getCreationIdByRunId('run-1')).toBe('cut-launch-teaser-draft-1');
    expect(service.listByRunId('run-1')).toEqual([draftRecord, planRecord, taskRecord]);
    expect(service.getByRunId('run-1', 'plan')).toEqual(planRecord);
    const cacheSnapshot = JSON.parse(
      writes
        .filter((entry) => entry.path === '/workspace/demo/.neko/.cache/artifact-index.json')
        .at(-1)!.data,
    ) as {
      entries: Array<{ kind: string; artifactId: string }>;
    };
    expect(cacheSnapshot.entries).toEqual([
      expect.objectContaining({ kind: 'draft', artifactId: 'draft-1' }),
      expect.objectContaining({ kind: 'plan', artifactId: 'plan-1' }),
      expect.objectContaining({ kind: 'task', artifactId: 'task-1' }),
    ]);
    expect(toIdcRunArtifactBinding(taskRecord)).toEqual({
      kind: 'task',
      artifactId: 'task-1',
      path: '/workspace/demo/neko/creations/cut-launch-teaser-draft-1/checklist.md',
      updatedAt: 6,
    });
  });

  it('ingests watcher-observed artifact content without re-writing the file', async () => {
    const writes: Array<{ path: string; data: string }> = [];
    const service = createWorkspaceArtifactService({
      workspaceRoot: '/workspace/demo',
      fsOps: {
        async mkdir(): Promise<void> {},
        async writeFile(path: string, data: string, _encoding: 'utf-8'): Promise<void> {
          writes.push({ path, data });
        },
      },
    });

    const record = service.ingestObservedArtifact({
      kind: 'draft',
      runId: 'run-observed',
      path: '/workspace/demo/neko/creations/observed-creation/brief.md',
      content: [
        '---',
        'id: observed-draft',
        'kind: draft',
        'title: Observed draft',
        'status: pending_review',
        'domain: cut',
        'createdAt: 2026-04-22T10:00:00.000Z',
        'updatedAt: 2026-04-22T10:30:00.000Z',
        'referenceChain:',
        '  - asset://characters/hero',
        '---',
        '',
        '# Observed draft',
        '',
        '## Intent',
        '',
        'Intent body',
        '',
        '## Approach',
        '',
        'Approach body',
        '',
        '## Concrete artifact',
        '',
        'Artifact body',
        '',
      ].join('\n'),
    });

    await service.flush?.();

    expect(record.kind).toBe('draft');
    expect(record.value.referenceChain).toEqual(['asset://characters/hero']);
    expect(service.getByRunId('run-observed', 'draft')).toEqual(record);
    expect(writes.map((entry) => entry.path)).toEqual([
      '/workspace/demo/.neko/.cache/artifact-index.json',
    ]);
    expect(JSON.parse(writes[0]!.data)).toEqual(
      expect.objectContaining({
        entries: [
          expect.objectContaining({
            kind: 'draft',
            runId: 'run-observed',
            artifactId: 'observed-draft',
          }),
        ],
      }),
    );
  });

  it('restores in-memory artifact records from artifact-index.json and markdown files', async () => {
    const writes: Array<{ path: string; data: string }> = [];
    const files = new Map<string, string>([
      [
        '/workspace/demo/.neko/.cache/artifact-index.json',
        JSON.stringify({
          schemaVersion: 1,
          updatedAt: 9,
          entries: [
            {
              kind: 'draft',
              runId: 'run-restore',
              artifactId: 'draft-restore',
              path: '/workspace/demo/neko/creations/restored-creation/brief.md',
              updatedAt: 2,
              title: 'Restored draft',
              status: 'pending_review',
              domain: 'cut',
            },
            {
              kind: 'task',
              runId: 'run-restore',
              artifactId: 'task-restore',
              path: '/workspace/demo/neko/creations/restored-creation/checklist.md',
              updatedAt: 6,
              itemCount: 1,
              counts: {
                pending: 1,
                in_progress: 0,
                completed: 0,
                failed: 0,
              },
            },
          ],
        }),
      ],
      [
        '/workspace/demo/neko/creations/restored-creation/brief.md',
        [
          '---',
          'id: draft-restore',
          'kind: draft',
          'title: Restored draft',
          'status: pending_review',
          'domain: cut',
          'createdAt: 2026-04-22T10:00:00.000Z',
          'updatedAt: 2026-04-22T10:30:00.000Z',
          '---',
          '',
          '# Restored draft',
          '',
          '## Intent',
          '',
          'Restore intent',
          '',
          '## Approach',
          '',
          'Restore approach',
          '',
          '## Concrete artifact',
          '',
          'Restore artifact',
          '',
        ].join('\n'),
      ],
      [
        '/workspace/demo/neko/creations/restored-creation/checklist.md',
        [
          '---',
          'id: task-restore',
          'kind: task',
          'createdAt: 2026-04-22T11:00:00.000Z',
          'updatedAt: 2026-04-22T11:05:00.000Z',
          '---',
          '',
          '# Tasks',
          '',
          '### 1. [pending] Restore task',
          '',
          'Replay checklist into the shared task plane.',
          '',
        ].join('\n'),
      ],
    ]);
    const service = createWorkspaceArtifactService({
      workspaceRoot: '/workspace/demo',
      fsOps: {
        async mkdir(): Promise<void> {},
        async writeFile(path: string, data: string, _encoding: 'utf-8'): Promise<void> {
          writes.push({ path, data });
        },
        async readFile(path: string): Promise<string> {
          const match = files.get(path);
          if (!match) {
            throw Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' });
          }
          return match;
        },
      },
    });

    const restored = await service.restore?.();

    expect(restored).toEqual([
      expect.objectContaining({
        kind: 'draft',
        runId: 'run-restore',
        artifactId: 'draft-restore',
      }),
      expect.objectContaining({
        kind: 'task',
        runId: 'run-restore',
        artifactId: 'task-restore',
      }),
    ]);
    expect(service.listByRunId('run-restore')).toEqual(restored);
    expect(service.listRunIds()).toEqual(['run-restore']);
    expect(writes).toEqual([]);
  });

  it('does not restore retired managed .neko creation document paths from stale index entries', async () => {
    const files = new Map<string, string>([
      [
        '/workspace/demo/.neko/.cache/artifact-index.json',
        JSON.stringify({
          schemaVersion: 1,
          updatedAt: 9,
          entries: [
            {
              kind: 'draft',
              runId: 'run-retired',
              artifactId: 'draft-retired',
              path: '/workspace/demo/.neko/drafts/draft-run-retired.md',
              updatedAt: 2,
              title: 'Retired draft',
              status: 'pending_review',
              domain: 'cut',
            },
          ],
        }),
      ],
      ['/workspace/demo/.neko/drafts/draft-run-retired.md', 'retired path should not be read'],
    ]);
    const readPaths: string[] = [];
    const service = createWorkspaceArtifactService({
      workspaceRoot: '/workspace/demo',
      fsOps: {
        async mkdir(): Promise<void> {},
        async writeFile(): Promise<void> {},
        async readFile(path: string): Promise<string> {
          readPaths.push(path);
          const match = files.get(path);
          if (!match) {
            throw Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' });
          }
          return match;
        },
      },
    });

    const restored = await service.restore?.();

    expect(restored).toEqual([]);
    expect(readPaths).toEqual(['/workspace/demo/.neko/.cache/artifact-index.json']);
    expect(service.listRunIds()).toEqual([]);
  });
});
