/**
 * Asset Drag & Drop Protocol Types
 *
 * 统一的跨扩展拖拽数据协议。
 * 用于 AssetLibrary → Timeline / Canvas 等场景。
 */

import type { AssetFile, EntityCategory } from './entity';

// =============================================================================
// MIME Types
// =============================================================================

/** 跨扩展资产拖拽的 MIME 类型 */
export const ASSET_DRAG_MIME = 'application/json';

/** 资产库内部拖拽的 MIME 类型（move/merge） */
export const ASSET_INTERNAL_DRAG_MIME = 'application/x-asset-internal';

// =============================================================================
// Drag Data — 对外拖拽（AssetLibrary → Timeline / Canvas）
// =============================================================================

/** 单个拖拽项 */
export interface AssetDragItem {
	entityId: string;
	variantId: string;
	entityName: string;
	variantName: string;
	category: EntityCategory;
	/** 变体关联的文件列表（含 path、mediaType 等） */
	files: AssetFile[];
}

/** 单资产拖拽数据 */
export interface SingleAssetDragData {
	type: 'asset';
	entityId: string;
	variantId: string;
	entityName: string;
	variantName: string;
	category: EntityCategory;
	files: AssetFile[];
}

/** 多资产拖拽数据 */
export interface MultiAssetDragData {
	type: 'assets';
	items: AssetDragItem[];
}

/** 对外拖拽数据联合类型 */
export type AssetDragData = SingleAssetDragData | MultiAssetDragData;

// =============================================================================
// Drag Data — 内部拖拽（AssetLibrary 内 move/merge）
// =============================================================================

/** 内部选择项 */
export interface AssetInternalSelectionItem {
	type: 'entity' | 'variant';
	entityId: string;
	variantId?: string;
}

/** 内部拖拽数据 */
export interface AssetInternalDragData {
	type: 'asset-internal';
	sourceItems: AssetInternalSelectionItem[];
}

// =============================================================================
// Helpers
// =============================================================================

/** 判断是否为单资产拖拽 */
export function isSingleAssetDrag(data: AssetDragData): data is SingleAssetDragData {
	return data.type === 'asset';
}

/** 判断是否为多资产拖拽 */
export function isMultiAssetDrag(data: AssetDragData): data is MultiAssetDragData {
	return data.type === 'assets';
}

/** 将拖拽数据统一为 AssetDragItem 数组 */
export function getDragItems(data: AssetDragData): AssetDragItem[] {
	if (isSingleAssetDrag(data)) {
		return [{
			entityId: data.entityId,
			variantId: data.variantId,
			entityName: data.entityName,
			variantName: data.variantName,
			category: data.category,
			files: data.files,
		}];
	}
	return data.items;
}
