import * as vscode from 'vscode';
import { EngineClient, EngineDeviceManager, type DeviceManager } from '@neko/neko-client';
import type { DeviceInfo, DevicePermissionState, DeviceType } from '@neko/shared';
import { DevicePermissionService } from './DevicePermissionService';

export interface DeviceCommandServices {
  readonly permissionService: DevicePermissionService;
  readonly getFrameServerPort: () => Promise<number | null>;
}

export function registerDeviceCommands(
  context: vscode.ExtensionContext,
  services: DeviceCommandServices,
): DeviceManagerTreeDataProvider {
  const provider = new DeviceManagerTreeDataProvider();
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
  statusBar.command = 'neko.devices.list';
  statusBar.text = '$(plug) Neko Devices';
  statusBar.tooltip = 'Neko Devices';
  statusBar.show();

  const managerRef: { current?: DeviceManager } = {};

  async function getManager(): Promise<DeviceManager | undefined> {
    if (managerRef.current) return managerRef.current;
    const port = await services.getFrameServerPort();
    if (port === null) {
      vscode.window.showWarningMessage('Neko Engine frame server is not available');
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
    context.subscriptions.push({ dispose: () => managerRef.current?.dispose() });
    return managerRef.current;
  }

  context.subscriptions.push(
    statusBar,
    provider,
    services.permissionService.onDidChange(() => provider.refresh()),
    vscode.window.createTreeView('neko.devices', { treeDataProvider: provider }),
    vscode.commands.registerCommand('neko.devices.list', async () => {
      const devices = await refreshDevices(getManager, provider);
      if (devices.length === 0) {
        vscode.window.showInformationMessage('No Neko devices found');
      }
      return devices;
    }),
    vscode.commands.registerCommand(
      'neko.devices.requestPermission',
      async (deviceType: DeviceType, deviceId?: string): Promise<DevicePermissionState> => {
        const state = await services.permissionService.requestPermission({ deviceType, deviceId });
        provider.refresh();
        return state;
      },
    ),
    vscode.commands.registerCommand(
      'neko.devices.revokePermission',
      async (deviceType: DeviceType, deviceId?: string): Promise<void> => {
        await services.permissionService.revoke(deviceType, deviceId);
        provider.refresh();
      },
    ),
    vscode.commands.registerCommand(
      'neko.devices.pick',
      async (deviceType?: DeviceType): Promise<DeviceInfo | undefined> => {
        const devices = await refreshDevices(getManager, provider);
        const filtered = deviceType
          ? devices.filter((device) => device.type === deviceType)
          : devices;
        const picked = await vscode.window.showQuickPick(
          filtered.map((device) => ({
            label: device.label,
            description: `${device.type} · ${device.connectionState} · ${device.permissionState}`,
            device,
          })),
          { title: 'Select Neko Device' },
        );
        return picked?.device;
      },
    ),
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

export class DeviceManagerTreeDataProvider
  implements vscode.TreeDataProvider<DeviceInfo>, vscode.Disposable
{
  private readonly didChangeTreeData = new vscode.EventEmitter<DeviceInfo | undefined>();
  readonly onDidChangeTreeData = this.didChangeTreeData.event;
  private devices: readonly DeviceInfo[] = [];

  setDevices(devices: readonly DeviceInfo[]): void {
    this.devices = devices;
    this.refresh();
  }

  refresh(): void {
    this.didChangeTreeData.fire(undefined);
  }

  getTreeItem(device: DeviceInfo): vscode.TreeItem {
    const item = new vscode.TreeItem(device.label, vscode.TreeItemCollapsibleState.None);
    item.description = `${device.type} · ${device.connectionState}`;
    item.contextValue = `nekoDevice:${device.type}:${device.permissionState}`;
    item.tooltip = `${device.label}\n${device.type}\n${device.permissionState}`;
    return item;
  }

  getChildren(): vscode.ProviderResult<DeviceInfo[]> {
    return [...this.devices];
  }

  dispose(): void {
    this.didChangeTreeData.dispose();
  }
}
