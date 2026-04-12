import * as vscode from 'vscode';
import type { IAssetEntityReader } from '../contracts/IAssetEntityReader';
import type { IVariantComparisonService } from '../contracts/IVariantComparisonService';
import { AssetVariantDiffSessionFactory, initializeAssetDiff } from '../asset-diff';

export function bootstrapAssetDiff(
  context: vscode.ExtensionContext,
  assetEntityReader: IAssetEntityReader,
  variantComparisonService: IVariantComparisonService,
): void {
  const getEntity = async (entityId: string) => assetEntityReader.getEntity(entityId);
  const compareVariants = async (entityId: string, variantIdA: string, variantIdB: string) =>
    variantComparisonService.compare(entityId, variantIdA, variantIdB);
  const sessionFactory = new AssetVariantDiffSessionFactory(compareVariants);

  initializeAssetDiff(context, getEntity, compareVariants, sessionFactory);
}
