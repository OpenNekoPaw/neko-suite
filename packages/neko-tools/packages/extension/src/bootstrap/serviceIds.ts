import type { IErrorHandler, ILogger } from '@neko/shared';
import { createServiceId } from '../base/serviceCollection';
import type { IAssetEntityReader as AssetEntityReaderContract } from '../contracts/IAssetEntityReader';
import type { IEngineMediaService as EngineMediaServiceContract } from '../contracts/IEngineMediaService';
import type { IExtensionI18n as ExtensionI18nContract } from '../contracts/IExtensionI18n';
import type { IVariantComparisonService as VariantComparisonServiceContract } from '../contracts/IVariantComparisonService';

export const IRootLogger = createServiceId<ILogger>('nekoTools.rootLogger');
export const IExtensionErrorHandler = createServiceId<IErrorHandler>(
  'nekoTools.extensionErrorHandler',
);
export const IExtensionI18n = createServiceId<ExtensionI18nContract>('nekoTools.extensionI18n');
export const IAssetEntityReader = createServiceId<AssetEntityReaderContract>(
  'nekoTools.assetEntityReader',
);
export const IVariantComparisonService = createServiceId<VariantComparisonServiceContract>(
  'nekoTools.variantComparisonService',
);
export const IEngineMediaService = createServiceId<EngineMediaServiceContract>(
  'nekoTools.engineMediaService',
);
