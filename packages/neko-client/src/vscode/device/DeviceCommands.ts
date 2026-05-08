import * as vscode from 'vscode';
import type {
  DeviceConnectionState,
  DeviceCapabilities,
  DeviceInfo,
  DevicePermissionState,
  DeviceType,
} from '@neko/shared';
import { EngineClient } from '../../EngineClient';
import { EngineDeviceManager, type DeviceManager } from '../../device';
import { DevicePermissionService } from './DevicePermissionService';

export interface DeviceCommandServices {
  readonly permissionService: DevicePermissionService;
  readonly getFrameServerPort: () => Promise<number | null>;
}

type DeviceTreeNode = DeviceInfo | DeviceDetailNode;

interface DeviceDetailNode {
  readonly kind: 'detail';
  readonly id: string;
  readonly device: DeviceInfo;
  readonly label: string;
  readonly description: string;
  readonly icon: string;
  readonly tooltip?: string;
}

export function registerDeviceCommands(
  context: vscode.ExtensionContext,
  services: DeviceCommandServices,
): DeviceManagerTreeDataProvider {
  const provider = new DeviceManagerTreeDataProvider();
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
  statusBar.command = 'neko.devices.list';
  statusBar.text = `$(plug) ${vscode.l10n.t('neko.devices.status')}`;
  statusBar.tooltip = vscode.l10n.t('neko.devices.status');
  statusBar.show();

  const managerRef: { current?: DeviceManager } = {};

  async function getManager(): Promise<DeviceManager | undefined> {
    if (managerRef.current) return managerRef.current;
    const port = await services.getFrameServerPort();
    if (port === null) {
      vscode.window.showWarningMessage(vscode.l10n.t('neko.devices.noFrameServer'));
      return undefined;
    }
    const engine = new EngineClient(port);
    managerRef.current = new EngineDeviceManager({
      engine,
      permissionPolicy: {
        getPermission: (request) => services.permissionService.getPermission(request),
        requestPermission: (request) => services.permissionService.requestPermission(request),
      },
    });
    managerRef.current.onDeviceChange(() => provider.setDevices(managerRef.current?.list() ?? []));
    context.subscriptions.push({
      dispose: () => {
        managerRef.current?.dispose();
        managerRef.current = undefined;
      },
    });
    return managerRef.current;
  }

  const refresh = () => refreshDevices(getManager, provider);

  context.subscriptions.push(
    statusBar,
    provider,
    services.permissionService.onDidChange(() => provider.refresh()),
    vscode.window.createTreeView('neko.devices', { treeDataProvider: provider }),
    vscode.commands.registerCommand('neko.devices.list', async () => {
      const devices = await refresh();
      if (devices.length === 0) {
        vscode.window.showInformationMessage(vscode.l10n.t('neko.devices.noneFound'));
      }
      return devices;
    }),
    vscode.commands.registerCommand('neko.devices.refresh', refresh),
    vscode.commands.registerCommand('neko.devices.test', async (device?: DeviceInfo) => {
      await testDevice(context, getManager, provider, device);
    }),
    vscode.commands.registerCommand(
      'neko.devices.requestPermission',
      async (deviceType: DeviceType, deviceId?: string): Promise<DevicePermissionState> => {
        const state = await services.permissionService.requestPermission({ deviceType, deviceId });
        await refresh();
        return state;
      },
    ),
    vscode.commands.registerCommand(
      'neko.devices.revokePermission',
      async (deviceType: DeviceType, deviceId?: string): Promise<void> => {
        await services.permissionService.revoke(deviceType, deviceId);
        await refresh();
      },
    ),
    vscode.commands.registerCommand(
      'neko.devices.requestSelectedPermission',
      async (device?: DeviceInfo): Promise<DevicePermissionState | undefined> => {
        if (!device) return undefined;
        return vscode.commands.executeCommand<DevicePermissionState>(
          'neko.devices.requestPermission',
          device.type,
          device.id,
        );
      },
    ),
    vscode.commands.registerCommand(
      'neko.devices.revokeSelectedPermission',
      async (device?: DeviceInfo): Promise<void> => {
        if (!device) return;
        await vscode.commands.executeCommand(
          'neko.devices.revokePermission',
          device.type,
          device.id,
        );
      },
    ),
    vscode.commands.registerCommand('neko.devices.testSelected', async (device?: DeviceInfo) => {
      await vscode.commands.executeCommand('neko.devices.test', device);
    }),
    vscode.commands.registerCommand(
      'neko.devices.pick',
      async (deviceType?: DeviceType): Promise<DeviceInfo | undefined> => {
        const devices = await refresh();
        const filtered = deviceType
          ? devices.filter((device) => device.type === deviceType)
          : devices;
        const picked = await vscode.window.showQuickPick(
          filtered.map((device) => ({
            label: device.label,
            description: `${deviceTypeLabel(device.type)} · ${connectionStateLabel(
              device.connectionState,
            )} · ${permissionStateLabel(device.permissionState)}`,
            device,
          })),
          { title: vscode.l10n.t('neko.devices.pick.title') },
        );
        return picked?.device;
      },
    ),
    vscode.commands.registerCommand('neko.devices.useInLive', async (device?: DeviceInfo) => {
      if (!device) return;
      try {
        const result = await vscode.commands.executeCommand<boolean | undefined>(
          'neko.live.useDevice',
          device,
        );
        if (result === true) return;
      } catch {
        vscode.window.showWarningMessage(
          vscode.l10n.t('neko.devices.useInLive.failed', device.label),
        );
        return;
      }
      vscode.window.showWarningMessage(
        vscode.l10n.t('neko.devices.useInLive.failed', device.label),
      );
    }),
  );

  return provider;
}

async function refreshDevices(
  getManager: () => Promise<DeviceManager | undefined>,
  provider: DeviceManagerTreeDataProvider,
): Promise<readonly DeviceInfo[]> {
  const manager = await getManager();
  if (!manager) return [];
  const devices = await manager.refresh();
  provider.setDevices(devices);
  return devices;
}

async function testDevice(
  context: vscode.ExtensionContext,
  getManager: () => Promise<DeviceManager | undefined>,
  provider: DeviceManagerTreeDataProvider,
  device: DeviceInfo | undefined,
): Promise<void> {
  const manager = await getManager();
  if (!manager) return;
  const selected = device ?? (await pickDevice(await refreshDevices(getManager, provider)));
  if (!selected) return;

  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: vscode.l10n.t('neko.devices.test.progress', selected.label),
      cancellable: false,
    },
    async () => {
      await manager.refresh();
      const current = manager.list(selected.type).find((candidate) => candidate.id === selected.id);
      if (!current) {
        vscode.window.showWarningMessage(
          vscode.l10n.t('neko.devices.test.notFound', selected.label),
        );
        return;
      }

      const permissionState = await manager.requestPermission(current.type, current.id);
      if (permissionState !== 'granted') {
        vscode.window.showWarningMessage(
          vscode.l10n.t('neko.devices.test.permissionDenied', current.label),
        );
        provider.setDevices(manager.list());
        return;
      }

      if (current.type === 'xr') {
        vscode.window.showWarningMessage(
          vscode.l10n.t('neko.devices.test.unsupported', current.label),
        );
        return;
      }

      let outputPath: string | undefined;
      try {
        outputPath =
          current.type === 'audio-input'
            ? await createAudioTestOutputPath(context, current)
            : undefined;
        const options = outputPath ? { outputPath } : undefined;
        const session = await manager.connect(current.id, options);
        try {
          await delay(current.type === 'audio-input' ? 1000 : 250);
        } finally {
          await manager.disconnect(session.sessionId);
        }
        provider.setDevices(manager.list());
        vscode.window.showInformationMessage(
          vscode.l10n.t('neko.devices.test.success', current.label),
        );
      } catch (err) {
        provider.setDevices(manager.list());
        vscode.window.showWarningMessage(
          vscode.l10n.t('neko.devices.test.failed', current.label, errorMessage(err)),
        );
      } finally {
        if (outputPath) {
          await deleteFileIfExists(vscode.Uri.file(outputPath));
        }
      }
    },
  );
}

async function pickDevice(devices: readonly DeviceInfo[]): Promise<DeviceInfo | undefined> {
  const picked = await vscode.window.showQuickPick(
    devices.map((device) => ({
      label: device.label,
      description: deviceDescription(device),
      device,
    })),
    { title: vscode.l10n.t('neko.devices.pick.title') },
  );
  return picked?.device;
}

export class DeviceManagerTreeDataProvider
  implements vscode.TreeDataProvider<DeviceTreeNode>, vscode.Disposable
{
  private readonly didChangeTreeData = new vscode.EventEmitter<DeviceTreeNode | undefined>();
  readonly onDidChangeTreeData = this.didChangeTreeData.event;
  private devices: readonly DeviceInfo[] = [];

  setDevices(devices: readonly DeviceInfo[]): void {
    this.devices = devices;
    this.refresh();
  }

  refresh(): void {
    this.didChangeTreeData.fire(undefined);
  }

  getTreeItem(node: DeviceTreeNode): vscode.TreeItem {
    if (isDetailNode(node)) {
      const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.None);
      item.id = node.id;
      item.description = node.description;
      item.contextValue = 'nekoDeviceDetail';
      item.tooltip = node.tooltip ?? node.description;
      item.iconPath = new vscode.ThemeIcon(node.icon);
      return item;
    }

    const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.Collapsed);
    item.id = deviceNodeId(node);
    item.description = deviceDescription(node);
    item.contextValue = `nekoDevice:${node.type}:${node.permissionState}`;
    item.tooltip = deviceTooltip(node);
    item.iconPath = new vscode.ThemeIcon(iconForDeviceType(node.type));
    return item;
  }

  getChildren(node?: DeviceTreeNode): vscode.ProviderResult<DeviceTreeNode[]> {
    if (!node) return [...this.devices];
    if (isDetailNode(node)) return [];
    return createDetailNodes(node);
  }

  dispose(): void {
    this.didChangeTreeData.dispose();
  }
}

function createDetailNodes(device: DeviceInfo): DeviceDetailNode[] {
  const nodes: DeviceDetailNode[] = [
    detailNode(
      device,
      'status',
      vscode.l10n.t('neko.devices.detail.status'),
      connectionStateLabel(device.connectionState),
      'pulse',
    ),
    detailNode(
      device,
      'permission',
      vscode.l10n.t('neko.devices.detail.permission'),
      permissionStateLabel(device.permissionState),
      'shield',
    ),
    detailNode(
      device,
      'default',
      vscode.l10n.t('neko.devices.detail.default'),
      device.isDefault
        ? vscode.l10n.t('neko.devices.detail.yes')
        : vscode.l10n.t('neko.devices.detail.no'),
      'star-full',
    ),
  ];

  for (const capability of capabilityDescriptions(device.capabilities)) {
    nodes.push(
      detailNode(
        device,
        capability.id,
        capability.label,
        capability.description,
        'settings-gear',
        capability.tooltip,
      ),
    );
  }

  if (device.errorMessage) {
    nodes.push(
      detailNode(
        device,
        'error',
        vscode.l10n.t('neko.devices.detail.error'),
        device.errorMessage,
        'warning',
      ),
    );
  }

  nodes.push(
    detailNode(device, 'id', vscode.l10n.t('neko.devices.detail.id'), device.id, 'symbol-key'),
  );

  return nodes;
}

function detailNode(
  device: DeviceInfo,
  id: string,
  label: string,
  description: string,
  icon: string,
  tooltip?: string,
): DeviceDetailNode {
  return {
    kind: 'detail',
    id: `${deviceNodeId(device)}:${id}`,
    device,
    label,
    description,
    icon,
    tooltip,
  };
}

function capabilityDescriptions(
  capabilities: DeviceCapabilities | undefined,
): Array<{ id: string; label: string; description: string; tooltip?: string }> {
  if (!capabilities) return [];
  const entries: Array<{ id: string; label: string; description: string; tooltip?: string }> = [];
  if (capabilities.sampleRates?.length) {
    entries.push({
      id: 'sampleRates',
      label: vscode.l10n.t('neko.devices.detail.sampleRates'),
      description: capabilities.sampleRates.map((rate) => `${rate} Hz`).join(', '),
    });
  }
  if (capabilities.channels?.length) {
    entries.push({
      id: 'channels',
      label: vscode.l10n.t('neko.devices.detail.channels'),
      description: capabilities.channels.join(', '),
    });
  }
  if (capabilities.resolutions?.length) {
    const values = capabilities.resolutions.map(
      (resolution) => `${resolution.width}x${resolution.height}@${resolution.fps.join('/')}`,
    );
    entries.push({
      id: 'resolutions',
      label: vscode.l10n.t('neko.devices.detail.resolutions'),
      description: values.join(', '),
      tooltip: values.join('\n'),
    });
  }
  if (capabilities.controls?.length) {
    entries.push({
      id: 'controls',
      label: vscode.l10n.t('neko.devices.detail.controls'),
      description: capabilities.controls.join(', '),
    });
  }
  return entries;
}

function deviceDescription(device: DeviceInfo): string {
  return [
    deviceTypeLabel(device.type),
    connectionStateLabel(device.connectionState),
    shouldShowPermissionInSummary(device)
      ? permissionStateLabel(device.permissionState)
      : undefined,
    device.isDefault ? vscode.l10n.t('neko.devices.detail.defaultBadge') : undefined,
  ]
    .filter(Boolean)
    .join(' · ');
}

function deviceTooltip(device: DeviceInfo): string {
  return [
    device.label,
    `${vscode.l10n.t('neko.devices.detail.type')}: ${deviceTypeLabel(device.type)}`,
    `${vscode.l10n.t('neko.devices.detail.status')}: ${connectionStateLabel(device.connectionState)}`,
    `${vscode.l10n.t('neko.devices.detail.permission')}: ${permissionStateLabel(device.permissionState)}`,
    device.isDefault
      ? `${vscode.l10n.t('neko.devices.detail.default')}: ${vscode.l10n.t('neko.devices.detail.yes')}`
      : undefined,
    ...capabilityDescriptions(device.capabilities).map(
      (capability) => `${capability.label}: ${capability.description}`,
    ),
    device.errorMessage
      ? `${vscode.l10n.t('neko.devices.detail.error')}: ${device.errorMessage}`
      : undefined,
    `${vscode.l10n.t('neko.devices.detail.id')}: ${device.id}`,
  ]
    .filter(Boolean)
    .join('\n');
}

function shouldShowPermissionInSummary(device: DeviceInfo): boolean {
  return (
    device.permissionState !== 'granted' ||
    device.type === 'audio-input' ||
    device.type === 'camera' ||
    device.type === 'xr'
  );
}

async function createAudioTestOutputPath(
  context: vscode.ExtensionContext,
  device: DeviceInfo,
): Promise<string> {
  const directory = vscode.Uri.joinPath(context.globalStorageUri, 'device-tests');
  await vscode.workspace.fs.createDirectory(directory);
  return vscode.Uri.joinPath(
    directory,
    `${sanitizeFilePart(device.type)}-${sanitizeFilePart(device.id)}-${Date.now()}.wav`,
  ).fsPath;
}

async function deleteFileIfExists(uri: vscode.Uri): Promise<void> {
  try {
    await vscode.workspace.fs.delete(uri);
  } catch {
    // Best effort cleanup for short device test recordings.
  }
}

function sanitizeFilePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'device';
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isDetailNode(node: DeviceTreeNode): node is DeviceDetailNode {
  return 'kind' in node;
}

function deviceNodeId(device: DeviceInfo): string {
  return `${device.type}:${device.id}`;
}

function deviceTypeLabel(type: DeviceType): string {
  return vscode.l10n.t(`neko.devices.type.${type}`);
}

function connectionStateLabel(state: DeviceConnectionState): string {
  return vscode.l10n.t(`neko.devices.state.${state}`);
}

function permissionStateLabel(state: DevicePermissionState): string {
  return vscode.l10n.t(`neko.devices.permission.${state}`);
}

function iconForDeviceType(type: DeviceType): string {
  switch (type) {
    case 'audio-input':
      return 'mic';
    case 'camera':
      return 'device-camera-video';
    case 'midi-input':
      return 'symbol-event';
    case 'gamepad':
      return 'game';
    case 'xr':
      return 'eye';
    default:
      return 'plug';
  }
}
