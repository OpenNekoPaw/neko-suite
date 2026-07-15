export type HomeSessionStatus = 'idle' | 'running' | 'cancelled';

export interface HomeSessionIdentity {
  readonly sessionId: string;
  readonly runtimeId: string;
}

export interface HomeSessionQueueItem {
  readonly id: string;
  readonly prompt: string;
  readonly status: 'queued' | 'running' | 'cancelled' | 'completed';
}

export interface HomeSessionTaskBinding {
  readonly taskId: string;
  readonly runId: string;
  readonly status: 'pending' | 'running' | 'cancelled' | 'completed' | 'failed';
}

export interface HomeSessionLogEntry {
  readonly sequence: number;
  readonly level: 'info' | 'warning' | 'error';
  readonly message: string;
}

export interface HomeSessionRuntimeSnapshot extends HomeSessionIdentity {
  readonly status: HomeSessionStatus;
  readonly config: Readonly<Record<string, unknown>>;
  readonly queue: readonly HomeSessionQueueItem[];
  readonly tasks: readonly HomeSessionTaskBinding[];
  readonly logs: readonly HomeSessionLogEntry[];
  readonly resourceIds: readonly string[];
}

export type HomeSessionRuntimeDiagnosticCode =
  | 'unknown-session'
  | 'stale-session-runtime'
  | 'invalid-session-operation';

export class HomeSessionRuntimeDiagnostic extends Error {
  constructor(
    readonly code: HomeSessionRuntimeDiagnosticCode,
    message: string,
    readonly identity: Readonly<Partial<HomeSessionIdentity>>,
  ) {
    super(message);
    this.name = 'HomeSessionRuntimeDiagnostic';
  }
}

interface MutableHomeSessionRuntime extends HomeSessionIdentity {
  status: HomeSessionStatus;
  config: Record<string, unknown>;
  queue: HomeSessionQueueItem[];
  tasks: HomeSessionTaskBinding[];
  logs: HomeSessionLogEntry[];
  resourceIds: Set<string>;
  nextQueueOrdinal: number;
  nextLogSequence: number;
}

export class HomeSessionRuntimeRegistry {
  private readonly sessions = new Map<string, MutableHomeSessionRuntime>();
  private selectedSessionId: string | undefined;
  private nextSessionOrdinal = 1;

  createSession(config: Readonly<Record<string, unknown>> = {}): HomeSessionRuntimeSnapshot {
    const ordinal = this.nextSessionOrdinal++;
    const sessionId = `home-session-${ordinal}`;
    const runtime: MutableHomeSessionRuntime = {
      sessionId,
      runtimeId: `${sessionId}:runtime-1`,
      status: 'idle',
      config: { ...config },
      queue: [],
      tasks: [],
      logs: [],
      resourceIds: new Set(),
      nextQueueOrdinal: 1,
      nextLogSequence: 1,
    };
    this.sessions.set(sessionId, runtime);
    this.selectedSessionId ??= sessionId;
    this.appendLog(runtime, 'info', 'Session runtime created.');
    return snapshot(runtime);
  }

  listSessions(): readonly HomeSessionRuntimeSnapshot[] {
    return [...this.sessions.values()].map(snapshot);
  }

  getSelectedSessionId(): string | undefined {
    return this.selectedSessionId;
  }

  selectSession(sessionId: string): HomeSessionRuntimeSnapshot {
    const runtime = this.requireSession(sessionId);
    this.selectedSessionId = sessionId;
    return snapshot(runtime);
  }

  getSession(identity: HomeSessionIdentity): HomeSessionRuntimeSnapshot {
    return snapshot(this.requireIdentity(identity));
  }

  enqueue(identity: HomeSessionIdentity, prompt: string): HomeSessionRuntimeSnapshot {
    const runtime = this.requireIdentity(identity);
    if (prompt.trim().length === 0) {
      throw new HomeSessionRuntimeDiagnostic(
        'invalid-session-operation',
        'Home session queue prompt is required.',
        identity,
      );
    }
    runtime.queue.push({
      id: `${runtime.sessionId}:queue-${runtime.nextQueueOrdinal++}`,
      prompt,
      status: 'queued',
    });
    this.appendLog(runtime, 'info', 'Message queued.');
    return snapshot(runtime);
  }

  startNext(identity: HomeSessionIdentity): HomeSessionRuntimeSnapshot {
    const runtime = this.requireIdentity(identity);
    const item = runtime.queue.find((candidate) => candidate.status === 'queued');
    if (!item) {
      throw new HomeSessionRuntimeDiagnostic(
        'invalid-session-operation',
        'Home session has no queued message to start.',
        identity,
      );
    }
    runtime.queue = runtime.queue.map((candidate) =>
      candidate.id === item.id ? { ...candidate, status: 'running' } : candidate,
    );
    runtime.status = 'running';
    this.appendLog(runtime, 'info', `Queue item started: ${item.id}`);
    return snapshot(runtime);
  }

  cancel(identity: HomeSessionIdentity): HomeSessionRuntimeSnapshot {
    const runtime = this.requireIdentity(identity);
    runtime.status = 'cancelled';
    runtime.queue = runtime.queue.map((item) =>
      item.status === 'queued' || item.status === 'running'
        ? { ...item, status: 'cancelled' }
        : item,
    );
    runtime.tasks = runtime.tasks.map((task) =>
      task.status === 'pending' || task.status === 'running'
        ? { ...task, status: 'cancelled' }
        : task,
    );
    this.appendLog(runtime, 'warning', 'Session runtime cancelled.');
    return snapshot(runtime);
  }

  resume(identity: HomeSessionIdentity): HomeSessionRuntimeSnapshot {
    const runtime = this.requireIdentity(identity);
    if (runtime.status !== 'cancelled') {
      throw new HomeSessionRuntimeDiagnostic(
        'invalid-session-operation',
        'Only a cancelled Home session runtime can resume.',
        identity,
      );
    }
    runtime.status = 'idle';
    this.appendLog(runtime, 'info', 'Session runtime resumed.');
    return snapshot(runtime);
  }

  bindTask(identity: HomeSessionIdentity, task: HomeSessionTaskBinding): HomeSessionRuntimeSnapshot {
    const runtime = this.requireIdentity(identity);
    if (runtime.tasks.some((candidate) => candidate.taskId === task.taskId)) {
      throw new HomeSessionRuntimeDiagnostic(
        'invalid-session-operation',
        `Home session task is already bound: ${task.taskId}`,
        identity,
      );
    }
    runtime.tasks.push({ ...task });
    return snapshot(runtime);
  }

  attachResource(identity: HomeSessionIdentity, resourceId: string): HomeSessionRuntimeSnapshot {
    const runtime = this.requireIdentity(identity);
    if (resourceId.trim().length === 0) {
      throw new HomeSessionRuntimeDiagnostic(
        'invalid-session-operation',
        'Home session resource identity is required.',
        identity,
      );
    }
    runtime.resourceIds.add(resourceId);
    return snapshot(runtime);
  }

  private requireSession(sessionId: string): MutableHomeSessionRuntime {
    const runtime = this.sessions.get(sessionId);
    if (!runtime) {
      throw new HomeSessionRuntimeDiagnostic(
        'unknown-session',
        `Home session does not exist: ${sessionId}`,
        { sessionId },
      );
    }
    return runtime;
  }

  private requireIdentity(identity: HomeSessionIdentity): MutableHomeSessionRuntime {
    const runtime = this.requireSession(identity.sessionId);
    if (runtime.runtimeId !== identity.runtimeId) {
      throw new HomeSessionRuntimeDiagnostic(
        'stale-session-runtime',
        `Home session runtime identity is stale for ${identity.sessionId}.`,
        identity,
      );
    }
    return runtime;
  }

  private appendLog(
    runtime: MutableHomeSessionRuntime,
    level: HomeSessionLogEntry['level'],
    message: string,
  ): void {
    runtime.logs.push({ sequence: runtime.nextLogSequence++, level, message });
  }
}

function snapshot(runtime: MutableHomeSessionRuntime): HomeSessionRuntimeSnapshot {
  return {
    sessionId: runtime.sessionId,
    runtimeId: runtime.runtimeId,
    status: runtime.status,
    config: { ...runtime.config },
    queue: runtime.queue.map((item) => ({ ...item })),
    tasks: runtime.tasks.map((task) => ({ ...task })),
    logs: runtime.logs.map((entry) => ({ ...entry })),
    resourceIds: [...runtime.resourceIds],
  };
}
