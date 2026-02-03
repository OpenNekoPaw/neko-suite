/**
 * Handlers Module
 *
 * Message handlers for Webview ↔ Extension communication.
 */

export { handleAssetMessage, isAssetMessage } from './assetHandlers';
export { CompatibleExportHandler, isCompatibleModeMessage } from './compatibleExportHandler';

// NOTE: exportHandlers removed - export is now handled by neko-engine
// Stub exports for API compatibility
export function handleExportMessage(): boolean {
	return false;
}
export function isExportMessage(_message: unknown): boolean {
	return false;
}
