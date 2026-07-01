import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { AgentSession, type AgentEvent } from '@neko/agent';
import type { IService } from '@neko/shared';
import type { AgentRealApiProfileConfig } from './profile-config';
import { createAgentEventRecorder, type AgentRunEvidence } from './evidence';
import { createSafeHarnessToolRegistry } from './safe-tools';
import { createScriptedService, type ScriptedServiceStep } from './mock-service';

export interface AgentHarness {
  readonly profile: AgentRealApiProfileConfig;
  readonly workDir: string;
  readonly service: IService;
  run(input: string): Promise<AgentRunEvidence>;
  dispose(): Promise<void>;
}

export interface CreateAgentHarnessOptions {
  readonly profile: AgentRealApiProfileConfig;
  readonly service?: IService;
  readonly providerId?: string;
  readonly modelId?: string;
  readonly systemPrompt?: string;
  readonly mockSteps?: readonly ScriptedServiceStep[];
  readonly mockStreamCalls?: readonly (readonly ScriptedServiceStep[])[];
  readonly mockStreamDelayMs?: number;
  readonly maxIterations?: number;
  readonly idcStage?: 'draft' | 'plan' | 'apply';
}

export async function createAgentHarness(
  options: CreateAgentHarnessOptions,
): Promise<AgentHarness> {
  const workDir =
    options.profile.workDir ?? (await fs.mkdtemp(path.join(os.tmpdir(), 'neko-agent-harness-')));
  const service =
    options.service ??
    createScriptedService({
      steps: options.mockSteps ?? [{ type: 'text', content: 'mock agent ok' }],
      ...(options.mockStreamCalls ? { streamCalls: options.mockStreamCalls } : {}),
      ...(options.mockStreamDelayMs !== undefined
        ? { streamDelayMs: options.mockStreamDelayMs }
        : {}),
    });
  const toolRegistry = createSafeHarnessToolRegistry({ workDir });

  return {
    profile: options.profile,
    workDir,
    service,
    async run(input) {
      const recorder = createAgentEventRecorder(options.profile);
      let timedOut = false;
      const session = new AgentSession({
        service,
        toolRegistry,
        systemPrompt:
          options.systemPrompt ??
          [
            'You are running inside the Neko Agent real API harness.',
            'Use the registered harness tools exactly when the user asks for them.',
            'Keep responses concise.',
          ].join('\n'),
        executionMode: 'auto',
        onConfirmTool: async () => true,
        maxIterations: options.maxIterations ?? 4,
        maxTokens: 512,
        ...(options.providerId ? { providerId: options.providerId } : {}),
        ...(options.modelId ? { modelId: options.modelId } : {}),
      });
      const timeout = setTimeout(() => {
        timedOut = true;
        session.cancel();
      }, options.profile.timeoutMs);
      try {
        recorder.record({
          type: 'coordinator_event',
          coordinatorEvent: {
            coordinatorId: 'neko-agent-harness-idc',
            type: 'phase_changed',
            phase: 'execute',
            summary: `idc:${options.idcStage ?? 'apply'} profile:${options.profile.profile}`,
            timestamp: Date.now(),
          },
        });
        for await (const event of session.execute(input, {
          workspaceRoot: workDir,
          metadata: {
            idcStage: options.idcStage ?? 'apply',
            harnessProfile: options.profile.profile,
          },
        })) {
          recorder.record(event as AgentEvent);
          if (timedOut) break;
        }
      } catch (error) {
        recorder.record({
          type: 'error',
          error: error instanceof Error ? error : new Error(String(error)),
        });
      } finally {
        clearTimeout(timeout);
        session.dispose();
      }
      return recorder.finish({
        ...(timedOut ? { status: 'interrupted' } : {}),
        providerId: options.providerId,
        modelId: options.modelId,
      });
    },
    async dispose() {
      if (!options.profile.workDir) {
        await fs.rm(workDir, { recursive: true, force: true });
      }
    },
  };
}
