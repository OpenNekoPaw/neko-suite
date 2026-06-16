import * as vscode from 'vscode';
import { NEKO_EXTENSION_IDS, type NekoEngineRuntimeStatus } from '@neko/shared';
import type {
  DashboardRuntimeStatus,
  RuntimeSourceStatus,
  WorkflowAvailability,
  WorkflowId,
} from './protocol';

const ENGINE_EXTENSION_ID = 'neko.neko-engine';
const AGENT_EXTENSION_ID = 'neko.neko-agent';
const ASSETS_EXTENSION_ID = 'neko.neko-assets';
const AUDIO_EXTENSION_ID = 'neko.neko-audio';
const ENGINE_STATUS_COMMAND = 'neko.engine.getStatus';

type DashboardEngineRuntimeValue = NonNullable<
  NonNullable<DashboardRuntimeStatus['engine']>['value']
>;

const WORKFLOW_PROBE_COMMANDS: ReadonlyArray<{
  readonly id: WorkflowId;
  readonly extensionId: string;
  readonly command: string;
}> = [
  {
    id: 'fountain',
    extensionId: NEKO_EXTENSION_IDS.NEKO_STORY,
    command: 'neko.story.newFile',
  },
  { id: 'nkc', extensionId: NEKO_EXTENSION_IDS.NEKO_CANVAS, command: 'neko.canvas.new' },
  { id: 'nkv', extensionId: NEKO_EXTENSION_IDS.NEKO_CUT, command: 'neko.newProject' },
  { id: 'nka', extensionId: AUDIO_EXTENSION_ID, command: 'neko.audio.new' },
  { id: 'nkm', extensionId: NEKO_EXTENSION_IDS.NEKO_MODEL, command: 'neko.model.new' },
  { id: 'nkp', extensionId: NEKO_EXTENSION_IDS.NEKO_PUPPET, command: 'neko.puppet.new' },
  { id: 'nks', extensionId: NEKO_EXTENSION_IDS.NEKO_SKETCH, command: 'neko.sketch.new' },
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
    return Promise.all(WORKFLOW_PROBE_COMMANDS.map(readWorkflowAvailability));
  }
}

async function readWorkflowAvailability(
  probe: (typeof WORKFLOW_PROBE_COMMANDS)[number],
): Promise<WorkflowAvailability> {
  const extension = vscode.extensions.getExtension(probe.extensionId);
  if (!extension) {
    return {
      id: probe.id,
      available: false,
      state: 'missing',
      extensionId: probe.extensionId,
      command: probe.command,
    };
  }

  const initialCommands = await vscode.commands.getCommands(true);
  if (initialCommands.includes(probe.command)) {
    return toReadyWorkflow(probe);
  }

  try {
    if (!extension.isActive) {
      await extension.activate();
    }
  } catch (error) {
    return {
      id: probe.id,
      available: false,
      state: 'error',
      extensionId: probe.extensionId,
      command: probe.command,
      error: toErrorMessage(error),
    };
  }

  const commands = await vscode.commands.getCommands(true);
  if (commands.includes(probe.command)) {
    return toReadyWorkflow(probe);
  }

  return {
    id: probe.id,
    available: false,
    state: 'inactive',
    extensionId: probe.extensionId,
    command: probe.command,
  };
}

function toReadyWorkflow(probe: (typeof WORKFLOW_PROBE_COMMANDS)[number]): WorkflowAvailability {
  return {
    id: probe.id,
    available: true,
    state: 'ready',
    extensionId: probe.extensionId,
    command: probe.command,
  };
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

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
