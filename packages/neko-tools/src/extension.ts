/**
 * Neko Tools Extension
 *
 * VSCode extension entry point for media comparison and diff tools.
 *
 * Responsibilities:
 * - Initialize MediaDiffService with analyzers (image/video/audio)
 * - Initialize AssetVariantDiff editor with cross-extension callbacks
 * - Register user-facing commands that delegate to the real services
 * - Dispose services on deactivation
 */

import * as vscode from 'vscode';
import type { AssetEntity, VariantComparisonResult } from '@neko/shared';
import { getMediaType } from '@neko/shared';
import {
	initializeMediaDiff,
	getMediaDiffService,
	disposeMediaDiffService,
} from '../packages/extension/src/media-diff';
import { initializeAssetDiff } from '../packages/extension/src/asset-diff';

// =============================================================================
// Activation
// =============================================================================

export function activate(context: vscode.ExtensionContext) {
	console.log('[Neko Tools] Activating extension...');

	// 1. Initialize MediaDiff module (analyzers + custom editor + compare command)
	const mediaDiffEditor = initializeMediaDiff(context);
	const mediaDiffService = getMediaDiffService();

	// 2. Initialize AssetDiff module (variant comparison editor)
	//    Delegates entity/variant lookups to neko-assets via vscode commands
	const assetDiffEditor = initializeAssetDiff(
		context,
		async (entityId: string): Promise<AssetEntity | null> => {
			try {
				const entities: AssetEntity[] = await vscode.commands.executeCommand(
					'neko.assets.getAllEntities'
				) ?? [];
				return entities.find(e => e.id === entityId) ?? null;
			} catch {
				return null;
			}
		},
		async (
			entityId: string,
			variantIdA: string,
			variantIdB: string
		): Promise<VariantComparisonResult> => {
			try {
				const result = await vscode.commands.executeCommand<VariantComparisonResult>(
					'neko.assets.compareVariants',
					entityId,
					variantIdA,
					variantIdB
				);
				return result ?? {
					entityId,
					variantA: { id: variantIdA, name: variantIdA },
					variantB: { id: variantIdB, name: variantIdB },
					attributeDiffs: [],
					fileDiffs: [],
				};
			} catch {
				return {
					entityId,
					variantA: { id: variantIdA, name: variantIdA },
					variantB: { id: variantIdB, name: variantIdB },
					attributeDiffs: [],
					fileDiffs: [],
				};
			}
		}
	);

	// 3. Register user-facing commands (replace stubs with real delegations)
	context.subscriptions.push(
		// Compare Files — delegates to MediaDiff's compareFiles command
		vscode.commands.registerCommand(
			'neko.tools.compareFiles',
			async (uri?: vscode.Uri, uris?: vscode.Uri[]) => {
				const selectedFiles = uris ?? (uri ? [uri] : []);

				if (selectedFiles.length < 2) {
					vscode.window.showWarningMessage('Please select at least 2 files to compare');
					return;
				}

				// Delegate to the real media diff compare command
				await vscode.commands.executeCommand(
					'neko.mediaDiff.compareFiles',
					selectedFiles[0],
					selectedFiles
				);
			}
		),

		// Compare Images — prompt user to select two image files
		vscode.commands.registerCommand('neko.tools.compareImages', async () => {
			const files = await pickTwoMediaFiles('image');
			if (!files) return;
			await vscode.commands.executeCommand(
				'neko.mediaDiff.compareFiles',
				files[1],
				files
			);
		}),

		// Compare Videos — prompt user to select two video files
		vscode.commands.registerCommand('neko.tools.compareVideos', async () => {
			const files = await pickTwoMediaFiles('video');
			if (!files) return;
			await vscode.commands.executeCommand(
				'neko.mediaDiff.compareFiles',
				files[1],
				files
			);
		}),

		// Compare Audio — prompt user to select two audio files
		vscode.commands.registerCommand('neko.tools.compareAudio', async () => {
			const files = await pickTwoMediaFiles('audio');
			if (!files) return;
			await vscode.commands.executeCommand(
				'neko.mediaDiff.compareFiles',
				files[1],
				files
			);
		}),

		// Compare Asset Variants — prompt user to select entity and variants
		vscode.commands.registerCommand(
			'neko.tools.compareAssetVariants',
			async () => {
				// Get all entities from neko-assets
				let entities: AssetEntity[] = [];
				try {
					entities = await vscode.commands.executeCommand(
						'neko.assets.getAllEntities'
					) ?? [];
				} catch {
					vscode.window.showErrorMessage(
						'Cannot access asset library. Is neko-assets active?'
					);
					return;
				}

				// Filter entities with multiple variants
				const multiVariantEntities = entities.filter(
					e => e.variants.length >= 2
				);
				if (multiVariantEntities.length === 0) {
					vscode.window.showInformationMessage(
						'No entities with multiple variants found.'
					);
					return;
				}

				// Pick entity
				const entityPick = await vscode.window.showQuickPick(
					multiVariantEntities.map(e => ({
						label: e.name,
						description: `${e.variants.length} variants`,
						entity: e,
					})),
					{ placeHolder: 'Select an entity to compare variants' }
				);
				if (!entityPick) return;

				const entity = entityPick.entity;

				// Pick variant A
				const variantAPick = await vscode.window.showQuickPick(
					entity.variants.map(v => ({
						label: v.name,
						description: `${v.files.length} files`,
						variant: v,
					})),
					{ placeHolder: 'Select first variant (A)' }
				);
				if (!variantAPick) return;

				// Pick variant B (exclude A)
				const remainingVariants = entity.variants.filter(
					v => v.id !== variantAPick.variant.id
				);
				const variantBPick = await vscode.window.showQuickPick(
					remainingVariants.map(v => ({
						label: v.name,
						description: `${v.files.length} files`,
						variant: v,
					})),
					{ placeHolder: 'Select second variant (B)' }
				);
				if (!variantBPick) return;

				// Delegate to asset diff compare command
				await vscode.commands.executeCommand(
					'neko.assetDiff.compareVariants',
					entity.id,
					variantAPick.variant.id,
					variantBPick.variant.id
				);
			}
		),

		// Show Media Info
		vscode.commands.registerCommand(
			'neko.tools.showMediaInfo',
			async (uri?: vscode.Uri) => {
				if (!uri) {
					const fileUri = await vscode.window.showOpenDialog({
						canSelectFiles: true,
						canSelectMany: false,
						filters: {
							'Media Files': [
								'mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v',
								'mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a',
								'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg',
							],
						},
					});
					if (!fileUri?.[0]) return;
					uri = fileUri[0];
				}

				// Try to get metadata from neko-assets library
				try {
					const entities: AssetEntity[] = await vscode.commands.executeCommand(
						'neko.assets.getAllEntities'
					) ?? [];

					for (const entity of entities) {
						for (const variant of entity.variants) {
							for (const file of variant.files) {
								if (uri.fsPath.endsWith(file.path) || file.path === uri.fsPath) {
									const meta = file.metadata;
									const lines: string[] = [`File: ${file.name}`];
									if (meta.width && meta.height) lines.push(`Resolution: ${meta.width}x${meta.height}`);
									if (meta.duration) lines.push(`Duration: ${meta.duration.toFixed(1)}s`);
									if (meta.codec) lines.push(`Codec: ${meta.codec}`);
									if (meta.frameRate) lines.push(`FPS: ${meta.frameRate}`);
									if (meta.sampleRate) lines.push(`Sample Rate: ${meta.sampleRate} Hz`);
									if (meta.fileSize) lines.push(`Size: ${(meta.fileSize / (1024 * 1024)).toFixed(1)} MB`);

									vscode.window.showInformationMessage(lines.join(' | '));
									return;
								}
							}
						}
					}
				} catch {
					// neko-assets not available
				}

				// Fallback: show basic file info
				const mediaType = getMediaType(uri.fsPath);
				vscode.window.showInformationMessage(
					`${uri.fsPath} (${mediaType ?? 'unknown type'}) — Import to asset library for detailed metadata.`
				);
			}
		),
	);

	// 4. Register dispose
	context.subscriptions.push({
		dispose: () => disposeMediaDiffService(),
	});

	console.log('[Neko Tools] Extension activated');
}

// =============================================================================
// Helpers
// =============================================================================

const MEDIA_FILTERS: Record<string, Record<string, string[]>> = {
	image: { 'Image Files': ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'] },
	video: { 'Video Files': ['mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v'] },
	audio: { 'Audio Files': ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'] },
};

async function pickTwoMediaFiles(
	mediaType: 'image' | 'video' | 'audio'
): Promise<[vscode.Uri, vscode.Uri] | null> {
	const filters = MEDIA_FILTERS[mediaType] ?? {};

	const first = await vscode.window.showOpenDialog({
		canSelectFiles: true,
		canSelectMany: false,
		filters,
		title: `Select first ${mediaType} file`,
	});
	if (!first?.[0]) return null;

	const second = await vscode.window.showOpenDialog({
		canSelectFiles: true,
		canSelectMany: false,
		filters,
		title: `Select second ${mediaType} file`,
	});
	if (!second?.[0]) return null;

	return [first[0], second[0]];
}

// =============================================================================
// Deactivation
// =============================================================================

export function deactivate() {
	disposeMediaDiffService();
}
