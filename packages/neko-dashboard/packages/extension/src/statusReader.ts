import * as vscode from 'vscode';
import type { NekoEngineRuntimeStatus } from '@neko/shared';
import type {
  DashboardRuntimeStatus,
  RuntimeSourceStatus,
  WorkflowAvailability,
  WorkflowId,
} from './protocol';

const ENGINE_EXTENSION_ID = 'neko.neko-engine';
const AGENT_EXTENSION_ID = 'neko.neko-agent';
const ASSETS_EXTENSION_ID = 'neko.neko-assets';
const ENGINE_STATUS_COMMAND = 'neko.engine.getStatus';

type DashboardEngineRuntimeValue = NonNullable<
  NonNullable<DashboardRuntimeStatus['engine']>['value']
>;

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

async function readEngineStatus(): Promise<RuntimeSourceStatus<DashboardEngineRuntimeValue>> {
  const extension = vscode.extensions.getExtension(ENGINE_EXTENSION_ID);
  if (!extension) return { available: false };

  const commands = await vscode.commands.getCommands(true);
  const hasEngineCommands = commands.includes('neko.engine.start');
  const commandStatus = await readEngineCommandStatus(commands);

  if (commandStatus) {
    return { available: true, value: commandStatus };
  }

  if (extension.isActive && hasEngineCommands) {
    return { available: true, value: { state: 'ready' } };
  }

  return { available: true, value: { state: 'idle' } };
}

async function readEngineCommandStatus(
  commands: readonly string[],
): Promise<DashboardEngineRuntimeValue | undefined> {
  if (!commands.includes(ENGINE_STATUS_COMMAND)) return undefined;

  try {
    const status = await vscode.commands.executeCommand<unknown>(ENGINE_STATUS_COMMAND);
    if (!isEngineRuntimeStatus(status)) return undefined;
    return {
      state: status.state,
      ...(status.endpoint ? { endpoint: status.endpoint, port: status.endpoint.port } : {}),
      ...(status.health ? { health: status.health } : {}),
    };
  } catch {
    return undefined;
  }
}

function readExtensionStatus<TValue>(extensionId: string): RuntimeSourceStatus<TValue> {
  const extension = vscode.extensions.getExtension(extensionId);
  if (!extension) return { available: false };
  return { available: true };
}

function isEngineRuntimeStatus(value: unknown): value is NekoEngineRuntimeStatus {
  if (!isRecord(value)) return false;
  if (!isEngineRuntimeState(value.state)) return false;
  if (value.health !== undefined && !isEngineHealth(value.health)) return false;
  if (value.endpoint !== undefined && !isEngineEndpoint(value.endpoint)) return false;
  return true;
}

function isEngineEndpoint(
  value: unknown,
): value is NonNullable<NekoEngineRuntimeStatus['endpoint']> {
  if (!isRecord(value)) return false;
  return (
    typeof value.host === 'string' &&
    typeof value.port === 'number' &&
    Number.isInteger(value.port) &&
    value.port > 0 &&
    value.port <= 65535 &&
    typeof value.address === 'string' &&
    typeof value.url === 'string'
  );
}

function isEngineRuntimeState(value: unknown): value is NekoEngineRuntimeStatus['state'] {
  return value === 'idle' || value === 'starting' || value === 'ready' || value === 'error';
}

function isEngineHealth(value: unknown): value is NonNullable<NekoEngineRuntimeStatus['health']> {
  return value === 'unknown' || value === 'healthy' || value === 'unhealthy';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
