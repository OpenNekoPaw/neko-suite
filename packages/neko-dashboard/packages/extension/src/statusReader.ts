import * as vscode from 'vscode';
import type {
  DashboardRuntimeStatus,
  RuntimeSourceStatus,
  WorkflowAvailability,
  WorkflowId,
} from './protocol';

const WORKFLOW_PROBE_COMMANDS: ReadonlyArray<{
  readonly id: WorkflowId;
  readonly command: string;
}> = [
  { id: 'filmmaking', command: 'neko.newProject' },
  { id: 'screenwriting', command: 'neko.story.newFile' },
  { id: 'visual', command: 'neko.sketch.new' },
  { id: 'modeling', command: 'neko.model.new' },
  { id: 'animation', command: 'neko.puppet.new' },
  { id: 'ai', command: 'neko.ai.chat' },
];

export class StatusReader {
  async read(): Promise<DashboardRuntimeStatus> {
    const [engine, agent, assets] = await Promise.all([
      readCommand<{ state: 'idle' | 'starting' | 'ready' | 'error'; port?: number }>(
        'neko.engine.getStatus',
      ),
      readCommand<{ total: number; running: number }>('neko.agent.getSessionCount'),
      readCommand<{ fileCount: number; totalSize: number }>('neko.assets.getSummary'),
    ]);

    return { engine, agent, assets };
  }

  async readWorkflows(): Promise<readonly WorkflowAvailability[]> {
    const commands = await vscode.commands.getCommands(true);
    return WORKFLOW_PROBE_COMMANDS.map(({ id, command }) => ({
      id,
      available: commands.includes(command),
    }));
  }
}

async function readCommand<TValue>(command: string): Promise<RuntimeSourceStatus<TValue>> {
  const commands = await vscode.commands.getCommands(true);
  if (!commands.includes(command)) {
    return { available: false };
  }

  try {
    const value = await vscode.commands.executeCommand<TValue>(command);
    return { available: true, value };
  } catch (error) {
    return { available: false, error: String(error) };
  }
}
