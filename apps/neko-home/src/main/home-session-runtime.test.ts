import { describe, expect, it } from 'vitest';
import {
  HomeSessionRuntimeDiagnostic,
  HomeSessionRuntimeRegistry,
} from './home-session-runtime';

describe('Home session runtime registry', () => {
  it('keeps mutable runtime state isolated when selection changes', () => {
    const registry = new HomeSessionRuntimeRegistry();
    const first = registry.createSession({ model: 'first-model' });
    const second = registry.createSession({ model: 'second-model' });

    registry.enqueue(first, 'Continue the first session');
    registry.bindTask(first, {
      taskId: 'task-1',
      runId: 'run-1',
      status: 'running',
    });
    registry.attachResource(first, 'resource:output-1');
    registry.selectSession(second.sessionId);

    expect(registry.getSelectedSessionId()).toBe(second.sessionId);
    expect(registry.getSession(first)).toMatchObject({
      config: { model: 'first-model' },
      queue: [{ prompt: 'Continue the first session', status: 'queued' }],
      tasks: [{ taskId: 'task-1', runId: 'run-1', status: 'running' }],
      resourceIds: ['resource:output-1'],
    });
    expect(registry.getSession(second)).toMatchObject({
      config: { model: 'second-model' },
      queue: [],
      tasks: [],
      resourceIds: [],
    });
  });

  it('rejects stale runtime identity instead of using the selected session', () => {
    const registry = new HomeSessionRuntimeRegistry();
    const first = registry.createSession();
    const second = registry.createSession();
    registry.selectSession(second.sessionId);

    expect(() =>
      registry.enqueue(
        { sessionId: first.sessionId, runtimeId: second.runtimeId },
        'must not be rerouted',
      ),
    ).toThrowError(HomeSessionRuntimeDiagnostic);
    try {
      registry.enqueue(
        { sessionId: first.sessionId, runtimeId: second.runtimeId },
        'must not be rerouted',
      );
    } catch (error: unknown) {
      expect(error).toMatchObject({ code: 'stale-session-runtime' });
    }
    expect(registry.getSession(first).queue).toEqual([]);
    expect(registry.getSession(second).queue).toEqual([]);
  });

  it('cancels and resumes only the addressed runtime', () => {
    const registry = new HomeSessionRuntimeRegistry();
    const first = registry.createSession();
    const second = registry.createSession();
    registry.enqueue(first, 'first work');
    registry.enqueue(second, 'second work');
    registry.startNext(first);

    expect(registry.cancel(first)).toMatchObject({
      status: 'cancelled',
      queue: [{ status: 'cancelled' }],
    });
    expect(registry.getSession(second)).toMatchObject({
      status: 'idle',
      queue: [{ status: 'queued' }],
    });
    expect(registry.resume(first).status).toBe('idle');
  });
});
