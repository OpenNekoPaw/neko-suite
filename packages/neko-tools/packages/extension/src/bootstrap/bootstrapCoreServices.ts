import * as vscode from 'vscode';
import type { AssetEntity, IErrorHandler, ILogger, VariantComparisonResult } from '@neko/shared';
import { createVSCodeLogger, VSCodeErrorHandler } from '@neko/shared/vscode/extension';
import {
  clearGlobalServices,
  ServiceCollection,
  setGlobalServices,
} from '../base/serviceCollection';
import type { IAssetEntityReader } from '../contracts/IAssetEntityReader';
import type { IEngineMediaService } from '../contracts/IEngineMediaService';
import type { IEngineRuntimeResolver } from '../contracts/IEngineRuntimeResolver';
import type { IExtensionI18n } from '../contracts/IExtensionI18n';
import type { IVariantComparisonService } from '../contracts/IVariantComparisonService';
import { EngineMediaService } from '../services/EngineMediaService';
import { VSCodeEngineRuntimeResolver } from '../services/EngineRuntimeResolver';
import { setErrorHandler } from '../utils/errorHandler';
import { setRootLogger } from '../utils/logger';
import {
  IAssetEntityReader as IAssetEntityReaderId,
  IEngineMediaService as IEngineMediaServiceId,
  IEngineRuntimeResolver as IEngineRuntimeResolverId,
  IExtensionErrorHandler,
  IExtensionI18n as IExtensionI18nId,
  IRootLogger,
  IVariantComparisonService as IVariantComparisonServiceId,
} from './serviceIds';

export interface ICoreServicesBootstrapResult extends vscode.Disposable {
  services: ServiceCollection;
  logger: ILogger;
  errorHandler: IErrorHandler;
  i18n: IExtensionI18n;
  engineRuntimeResolver: IEngineRuntimeResolver;
  engineMediaService: IEngineMediaService;
  assetEntityReader: IAssetEntityReader;
  variantComparisonService: IVariantComparisonService;
}

class VscodeExtensionI18n implements IExtensionI18n {
  t(key: string, ...args: Array<string | number | boolean>): string {
    return vscode.l10n.t(key, ...args);
  }
}

class VscodeCommandAssetEntityReader implements IAssetEntityReader {
  async listEntities(): Promise<AssetEntity[]> {
    return this.fetchEntities();
  }

  async getEntity(entityId: string): Promise<AssetEntity | null> {
    try {
      const entities = await this.fetchEntities();
      return entities.find((entity) => entity.id === entityId) ?? null;
    } catch {
      return null;
    }
  }

  private async fetchEntities(): Promise<AssetEntity[]> {
    return (
      (await vscode.commands.executeCommand<AssetEntity[]>('neko.assets.getAllEntities')) ?? []
    );
  }
}

class VscodeCommandVariantComparisonService implements IVariantComparisonService {
  async compare(
    entityId: string,
    variantIdA: string,
    variantIdB: string,
  ): Promise<VariantComparisonResult> {
    try {
      const result = await vscode.commands.executeCommand<VariantComparisonResult>(
        'neko.assets.compareVariants',
        entityId,
        variantIdA,
        variantIdB,
      );

      return result ?? createEmptyVariantComparisonResult(entityId, variantIdA, variantIdB);
    } catch {
      return createEmptyVariantComparisonResult(entityId, variantIdA, variantIdB);
    }
  }
}

function createEmptyVariantComparisonResult(
  entityId: string,
  variantIdA: string,
  variantIdB: string,
): VariantComparisonResult {
  return {
    entityId,
    variantA: { id: variantIdA, name: variantIdA },
    variantB: { id: variantIdB, name: variantIdB },
    attributeDiffs: [],
    fileDiffs: [],
  };
}

export function bootstrapCoreServices(
  context: vscode.ExtensionContext,
): ICoreServicesBootstrapResult {
  const services = new ServiceCollection();
  const logger = createVSCodeLogger('Neko Tools', 'NekoTools', context);
  const errorHandler = new VSCodeErrorHandler(logger);
  const i18n = new VscodeExtensionI18n();
  const engineRuntimeResolver = new VSCodeEngineRuntimeResolver();
  const engineMediaService = new EngineMediaService(engineRuntimeResolver);
  const assetEntityReader = new VscodeCommandAssetEntityReader();
  const variantComparisonService = new VscodeCommandVariantComparisonService();

  setRootLogger(logger);
  setErrorHandler(errorHandler);

  services.set(IRootLogger, logger);
  services.set(IExtensionErrorHandler, errorHandler);
  services.set(IExtensionI18nId, i18n);
  services.set(IEngineRuntimeResolverId, engineRuntimeResolver);
  services.set(IEngineMediaServiceId, engineMediaService);
  services.set(IAssetEntityReaderId, assetEntityReader);
  services.set(IVariantComparisonServiceId, variantComparisonService);
  setGlobalServices(services);

  logger.info('Activating extension...');

  return {
    services,
    logger,
    errorHandler,
    i18n,
    engineRuntimeResolver,
    engineMediaService,
    assetEntityReader,
    variantComparisonService,
    dispose() {
      clearGlobalServices();
      services.dispose();
    },
  };
}
