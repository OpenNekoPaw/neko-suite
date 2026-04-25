import { describe, expect, it } from 'vitest';
import {
  parseIdcRuntimeState,
  parsePendingApprovalState,
  readIdcRuntimeState,
  readPendingApprovalState,
} from '../idc-runtime-state-reader';

describe('idc-runtime-state-reader', () => {
  it('reads stage/run/approval restore state from idc-runtime.json', async () => {
    const state = await readIdcRuntimeState({
      filePath: '/tmp/proj/.neko/state/idc-runtime.json',
      fsOps: {
        async readFile(): Promise<string> {
          return JSON.stringify({
            updatedAt: 42,
            stage: {
              current: 'plan',
              enteredAt: 21,
              transitions: [
                { from: null, to: 'draft', at: 10 },
                { from: 'draft', to: 'plan', at: 20 },
              ],
            },
            run: {
              active: {
                id: 'run-1',
                runKind: 'wf-demo',
                workflowId: 'wf-demo',
                status: 'running',
                createdAt: 1,
                startedAt: 2,
                roundCount: 1,
                rounds: [
                  {
                    round: 0,
                    activatedStages: ['draft', 'plan'],
                    skippedStages: [],
                    decidedAt: 3,
                  },
                ],
                artifacts: [
                  {
                    kind: 'draft',
                    artifactId: 'draft-1',
                    path: '/tmp/proj/.neko/drafts/draft-run-1.md',
                    updatedAt: 4,
                  },
                ],
              },
            },
            approval: {
              pending: [
                {
                  channel: 'permission',
                  confirmationToken: 'confirm-1',
                  toolCallId: 'call-1',
                  toolName: 'Write',
                  action: 'Write file',
                  description: 'Write src/demo.ts',
                  details: {
                    path: 'src/demo.ts',
                    arguments: { path: 'src/demo.ts' },
                  },
                },
              ],
            },
            feedback: {
              pendingGuidance: {
                content: '- Repair the draft artifact before retrying.',
                sourceRunId: 'run-1',
                sourceRunStartedAt: 2,
              },
            },
          });
        },
      },
    });

    expect(state).toEqual({
      updatedAt: 42,
      stage: {
        current: 'plan',
        enteredAt: 21,
        transitions: [
          { from: null, to: 'draft', at: 10 },
          { from: 'draft', to: 'plan', at: 20 },
        ],
      },
      run: {
        active: expect.objectContaining({
          id: 'run-1',
          runKind: 'wf-demo',
          workflowId: 'wf-demo',
          roundCount: 1,
          rounds: [
            expect.objectContaining({
              round: 0,
              activatedStages: ['draft', 'plan'],
            }),
          ],
        }),
      },
      approval: {
        updatedAt: 42,
        pending: [
          expect.objectContaining({
            confirmationToken: 'confirm-1',
            toolCallId: 'call-1',
            toolName: 'Write',
          }),
        ],
      },
      feedback: {
        pendingGuidance: {
          content: '- Repair the draft artifact before retrying.',
          sourceRunId: 'run-1',
          sourceRunStartedAt: 2,
        },
      },
    });
  });

  it('accepts legacy string feedback guidance snapshots during restore', () => {
    const state = parseIdcRuntimeState(
      JSON.stringify({
        stage: {
          current: 'plan',
          transitions: [],
        },
        run: {},
        approval: {
          pending: [],
        },
        feedback: {
          pendingGuidance: '- Retry once after repairing the draft.',
        },
      }),
    );

    expect(state?.feedback.pendingGuidance).toEqual({
      content: '- Retry once after repairing the draft.',
    });
  });

  it('restores legacy run snapshots that only persisted workflowId', () => {
    const state = parseIdcRuntimeState(
      JSON.stringify({
        stage: {
          current: 'draft',
          transitions: [],
        },
        run: {
          active: {
            id: 'run-legacy',
            workflowId: 'wf-legacy',
            status: 'running',
            createdAt: 1,
            roundCount: 0,
          },
        },
        approval: {
          pending: [],
        },
        feedback: {
          pendingGuidance: null,
        },
      }),
    );

    expect(state?.run.active).toEqual(
      expect.objectContaining({
        id: 'run-legacy',
        runKind: 'wf-legacy',
        workflowId: 'wf-legacy',
      }),
    );
  });

  it('reads pending approval snapshots from idc-runtime.json', async () => {
    const state = await readPendingApprovalState({
      filePath: '/tmp/proj/.neko/state/idc-runtime.json',
      fsOps: {
        async readFile(): Promise<string> {
          return JSON.stringify({
            updatedAt: 42,
            approval: {
              pending: [
                {
                  channel: 'permission',
                  confirmationToken: 'confirm-1',
                  toolCallId: 'call-1',
                  toolName: 'Write',
                  action: 'Write file',
                  description: 'Write src/demo.ts',
                  details: {
                    path: 'src/demo.ts',
                    arguments: { path: 'src/demo.ts' },
                  },
                },
              ],
            },
          });
        },
      },
    });

    expect(state).toEqual({
      updatedAt: 42,
      pending: [
        expect.objectContaining({
          confirmationToken: 'confirm-1',
          toolCallId: 'call-1',
          toolName: 'Write',
        }),
      ],
    });
  });

  it('returns null when the runtime state file is absent', async () => {
    const state = await readPendingApprovalState({
      filePath: '/tmp/proj/.neko/state/idc-runtime.json',
      fsOps: {
        async readFile(): Promise<string> {
          throw Object.assign(new Error('ENOENT: no such file or directory'), { code: 'ENOENT' });
        },
      },
    });

    expect(state).toBeNull();
  });

  it('ignores malformed approval entries and bad json', () => {
    expect(parsePendingApprovalState('{')).toBeNull();
    expect(parseIdcRuntimeState('{')).toBeNull();

    const state = parsePendingApprovalState(
      JSON.stringify({
        updatedAt: 7,
        approval: {
          pending: [
            {
              channel: 'permission',
              confirmationToken: 'confirm-1',
              toolCallId: 'call-1',
              toolName: 'Write',
              action: 'Write file',
              description: 'Write src/demo.ts',
              details: { arguments: { path: 'src/demo.ts' } },
            },
            {
              channel: 'permission',
              confirmationToken: '',
              toolCallId: 'broken',
              toolName: 'Write',
              action: 'Write file',
              description: 'Broken',
              details: {},
            },
            {
              channel: 'other',
              confirmationToken: 'confirm-2',
              toolCallId: 'call-2',
              toolName: 'Write',
              action: 'Write file',
              description: 'Wrong channel',
              details: {},
            },
          ],
        },
        feedback: {
          pendingGuidance: null,
        },
      }),
    );

    expect(state).toEqual({
      updatedAt: 7,
      pending: [
        expect.objectContaining({
          confirmationToken: 'confirm-1',
          toolCallId: 'call-1',
        }),
      ],
    });
  });

  it('drops malformed run snapshots while preserving valid runtime fields', () => {
    const state = parseIdcRuntimeState(
      JSON.stringify({
        stage: {
          current: 'draft',
          transitions: [{ from: null, to: 'draft', at: 1 }],
        },
        run: {
          active: {
            id: 'broken-run',
            workflowId: 'wf-demo',
            status: 'running',
            createdAt: 1,
            roundCount: 'nope',
          },
          lastCompleted: {
            id: 'run-2',
            workflowId: 'wf-demo',
            status: 'completed',
            createdAt: 2,
            roundCount: 0,
          },
        },
        approval: {
          pending: [
            {
              channel: 'permission',
              confirmationToken: 'confirm-1',
              toolCallId: 'call-1',
              toolName: 'Write',
              action: 'Write file',
              description: 'Write src/demo.ts',
              details: { arguments: { path: 'src/demo.ts' } },
            },
          ],
        },
      }),
    );

    expect(state).toEqual({
      stage: {
        current: 'draft',
        transitions: [{ from: null, to: 'draft', at: 1 }],
      },
      run: {
        active: expect.objectContaining({
          id: 'broken-run',
          workflowId: 'wf-demo',
          status: 'running',
          roundCount: 0,
        }),
        lastCompleted: expect.objectContaining({
          id: 'run-2',
          workflowId: 'wf-demo',
          status: 'completed',
        }),
      },
      approval: {
        pending: [
          expect.objectContaining({
            confirmationToken: 'confirm-1',
            toolCallId: 'call-1',
          }),
        ],
      },
      feedback: {
        pendingGuidance: null,
      },
    });
  });
});
