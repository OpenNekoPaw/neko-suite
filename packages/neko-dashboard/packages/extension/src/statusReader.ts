import * as vscode from 'vscode';
import type {
  DashboardRuntimeStatus,
  RuntimeSourceStatus,
  WorkflowAvailability,
  WorkflowId,
} from './protocol';

const ENGINE_EXTENSION_ID = 'neko.neko-engine';
const AGENT_EXTENSION_ID = 'neko.nekoagent';
const ASSETS_EXTENSION_ID = 'neko.neko-assets';

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
      readEngineStatus(),
      readExtensionStatus<{ total: number; running: number }>(AGENT_EXTENSION_ID),
      readExtensionStatus<{ fileCount: number; totalSize: number }>(ASSETS_EXTENSION_ID),
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

async function readEngineStatus(): Promise<
  RuntimeSourceStatus<{ state: 'idle' | 'starting' | 'ready' | 'error'; port?: number }>
> {
  const extension = vscode.extensions.getExtension(ENGINE_EXTENSION_ID);
  if (!extension) return { available: false };

  const commands = await vscode.commands.getCommands(true);
  const hasEngineCommands = commands.includes('neko.engine.start');

  if (extension.isActive && hasEngineCommands) {
    return { available: true, value: { state: 'ready' } };
  }

  return { available: true, value: { state: 'idle' } };
}

function readExtensionStatus<TValue>(extensionId: string): RuntimeSourceStatus<TValue> {
  const extension = vscode.extensions.getExtension(extensionId);
  if (!extension) return { available: false };
  return { available: true };
}
