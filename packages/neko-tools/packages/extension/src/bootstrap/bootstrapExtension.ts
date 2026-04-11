import * as vscode from 'vscode';
import { initializeAssetDiff } from '../asset-diff';
import type { ServiceCollection } from '../base/serviceCollection';
import { initializeMediaDiff, disposeMediaDiffService } from '../media-diff';
import { initializeMediaLsp } from '../media-lsp';
import { bootstrapCoreServices } from './bootstrapCoreServices';
import { registerNekoToolsCommands } from './registerCommands';

export interface INekoToolsExtensionActivation extends vscode.Disposable {
  services: ServiceCollection;
}

export function bootstrapNekoToolsExtension(
  context: vscode.ExtensionContext,
): INekoToolsExtensionActivation {
  const coreServices = bootstrapCoreServices(context);

  initializeMediaDiff(context, coreServices.engineMediaService);
  initializeMediaLsp(context, coreServices.engineMediaService);
  initializeAssetDiff(
    context,
    async (entityId) => coreServices.assetEntityReader.getEntity(entityId),
    async (entityId, variantIdA, variantIdB) =>
      coreServices.variantComparisonService.compare(entityId, variantIdA, variantIdB),
  );

  registerNekoToolsCommands(context, {
    i18n: coreServices.i18n,
    assetEntityReader: coreServices.assetEntityReader,
    errorHandler: coreServices.errorHandler,
  });

  coreServices.logger.info('Extension activated');

  return {
    services: coreServices.services,
    dispose() {
      disposeMediaDiffService();
      coreServices.dispose();
    },
  };
}
