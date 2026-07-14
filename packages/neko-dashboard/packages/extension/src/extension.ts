import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import {
  VSCodeEntityRuntimeRegistry,
  registerDashboardEntitySourceCommand,
  registerEntityFacadeCommands,
} from '@neko/entity/host-vscode';
import { ENTITY_FACADE_COMMANDS } from '@neko/shared';
import { createNodeWorkspaceEntityAssetMetadataBinding } from '@neko/shared/local-metadata/node';
import {
  createVSCodeLogger,
  resolveLogLevelSetting,
  watchLogLevel,
} from '@neko/shared/vscode/extension';
import { DashboardProvider } from './dashboardProvider';
import { EntityInspectorProvider } from './entityInspectorProvider';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const logger = createVSCodeLogger(
    'Neko Dashboard',
    'NekoDashboard',
    context,
    resolveLogLevelSetting(context.extensionMode),
  );
  watchLogLevel(logger, context);

  const provider = new DashboardProvider(context, { logger });
  const inspectorProvider = new EntityInspectorProvider(context, {
    logger,
    creativeEntityAggregator: provider.getCreativeEntityAggregator(),
  });
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const entityMetadata = workspaceRoot
    ? await createNodeWorkspaceEntityAssetMetadataBinding({
        homedir: os.homedir(),
        workDir: workspaceRoot,
      })
    : undefined;
  if (entityMetadata) {
    context.subscriptions.push({
      dispose: () => {
        void entityMetadata
          .dispose()
          .catch((error) =>
            logger.warn('Failed to dispose Entity/Asset metadata store', { error }),
          );
      },
    });
    if (
      entityMetadata.migrationReport.sourceStatus === 'quarantined' ||
      entityMetadata.migrationReport.unrecoverable.length > 0
    ) {
      logger.warn('Entity/Asset projection migration requires attention', {
        report: entityMetadata.migrationReport,
      });
    }
  }
  const entityRuntimeRegistry = new VSCodeEntityRuntimeRegistry({
    logger,
    resolveProjection: (projectRoot) =>
      entityMetadata && workspaceRoot && path.resolve(projectRoot) === path.resolve(workspaceRoot)
        ? {
            repository: entityMetadata.repository,
            partition: entityMetadata.partition,
            markStale: (diagnostic, updatedAt) => entityMetadata.markStale(diagnostic, updatedAt),
          }
        : undefined,
  });

  context.subscriptions.push(provider);
  context.subscriptions.push(inspectorProvider);
  context.subscriptions.push(entityRuntimeRegistry);
  context.subscriptions.push(
    registerEntityFacadeCommands({ logger, runtimeRegistry: entityRuntimeRegistry }),
  );
  context.subscriptions.push(
    registerDashboardEntitySourceCommand({ logger, runtimeRegistry: entityRuntimeRegistry }),
  );
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(EntityInspectorProvider.viewType, inspectorProvider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.dashboard.show', () => provider.show()),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(ENTITY_FACADE_COMMANDS.inspectEntity, (request: unknown) =>
      inspectorProvider.inspect(request),
    ),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('neko.entityInspector.follow', (request: unknown) =>
      inspectorProvider.follow(request),
    ),
  );

  void provider.maybeShowOnStartup();
}

export function deactivate(): void {
  // VSCode disposes subscriptions from the extension context.
}
