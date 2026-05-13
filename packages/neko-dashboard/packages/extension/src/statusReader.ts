import * as vscode from 'vscode';
import type { DashboardRuntimeStatus, RuntimeSourceStatus } from './protocol';

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
