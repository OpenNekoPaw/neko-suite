import * as vscode from 'vscode';
import {
  VSCodeEntityRuntimeRegistry,
  registerDashboardEntitySourceCommand,
  registerEntityFacadeCommands,
} from '@neko/entity/host-vscode';
import { ENTITY_FACADE_COMMANDS } from '@neko/shared';
import {
  createVSCodeLogger,
  resolveLogLevelSetting,
  watchLogLevel,
} from '@neko/shared/vscode/extension';
import { DashboardProvider } from './dashboardProvider';
import { EntityInspectorProvider } from './entityInspectorProvider';

export function activate(context: vscode.ExtensionContext): void {
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
  const entityRuntimeRegistry = new VSCodeEntityRuntimeRegistry({ logger });

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
