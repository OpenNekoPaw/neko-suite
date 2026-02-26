/**
 * Neko Assets Extension
 *
 * VSCode extension entry point for unified asset management.
 *
 * Responsibilities:
 * - Initialize AssetLibrary with JsonFileStorage
 * - Connect engine probeMedia for rich metadata extraction
 * - Register FileDecorationProvider for Explorer tree enhancement
 * - Register context menu commands (add to timeline/canvas)
 * - Register existing commands (sync, push, pull, LFS, preview)
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { AssetLibrary, JsonFileStorage, RuleClassifier, AssetDiffService } from '@neko/asset';
import type { IFileSystem } from '@neko/asset';
import { detectMediaType } from '@neko/shared';
import { createEngineMetadataExtractor } from './services/EngineMetadataExtractor';
import { ThumbnailService } from './services/ThumbnailService';
import { AssetFileDecorationProvider } from './providers/AssetFileDecorationProvider';
import { AssetManagerTreeProvider } from './providers/AssetManagerTreeProvider';
import { AssetHistoryTreeProvider } from './providers/AssetHistoryTreeProvider';
import { VscodeGitService } from './services/VscodeGitService';

// =============================================================================
// Extension State
// =============================================================================

let library: AssetLibrary | null = null;
let diffService: AssetDiffService | null = null;
let thumbnailService: ThumbnailService | null = null;

// =============================================================================
// Node.js IFileSystem Adapter
// =============================================================================

const nodeFileSystem: IFileSystem = {
	async readFile(filePath: string): Promise<string> {
		return fs.readFile(filePath, 'utf-8');
	},
	async writeFile(filePath: string, content: string): Promise<void> {
		await fs.writeFile(filePath, content, 'utf-8');
	},
	async exists(filePath: string): Promise<boolean> {
		try {
			await fs.access(filePath);
			return true;
		} catch {
			return false;
		}
	},
	async mkdir(dirPath: string): Promise<void> {
		await fs.mkdir(dirPath, { recursive: true });
	},
};

// =============================================================================
// Activation
// =============================================================================

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	console.log('[Neko Assets] Activating extension...');

	// 1. Initialize AssetLibrary
	const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
	if (workspaceRoot) {
		try {
			const storagePath = path.join(workspaceRoot, '.neko', 'assets', 'library.json');

			const storage = new JsonFileStorage({
				filePath: storagePath,
				fs: nodeFileSystem,
				autoSaveDelay: 1000,
			});

			const metadataExtractor = createEngineMetadataExtractor();

			// Initialize ThumbnailService
			thumbnailService = new ThumbnailService(workspaceRoot);
			context.subscriptions.push(thumbnailService);

			library = new AssetLibrary({
				storage,
				classifier: new RuleClassifier(),
				metadataExtractor,
				thumbnailGenerator: (filePath) => thumbnailService!.generate(filePath),
			});

			await library.initialize();
			console.log('[Neko Assets] AssetLibrary initialized at', storagePath);

			// Initialize AssetDiffService with Git integration
			const gitService = new VscodeGitService();
			diffService = new AssetDiffService(
				storage,
				gitService,
				undefined,
				{
					statFile: async (filePath: string) => {
						try {
							const stats = await fs.stat(filePath);
							return { size: stats.size };
						} catch {
							return null;
						}
					},
				},
			);
			console.log('[Neko Assets] AssetDiffService initialized with Git integration');
		} catch (error) {
			console.error('[Neko Assets] Failed to initialize AssetLibrary:', error);
		}
	}

	// 2. Register FileDecorationProvider
	if (library) {
		const decorationProvider = new AssetFileDecorationProvider(library);
		context.subscriptions.push(
			vscode.window.registerFileDecorationProvider(decorationProvider),
		);

		// 3. Register Activity Bar tree views
		const assetManagerProvider = new AssetManagerTreeProvider(library);
		const assetHistoryProvider = new AssetHistoryTreeProvider(library);

		context.subscriptions.push(
			vscode.window.createTreeView('neko.assetManager', {
				treeDataProvider: assetManagerProvider,
				showCollapseAll: true,
			}),
			vscode.window.createTreeView('neko.assetHistory', {
				treeDataProvider: assetHistoryProvider,
			}),
			assetManagerProvider,
			assetHistoryProvider,
		);

		// Refresh tree views when library changes
		context.subscriptions.push(
			vscode.commands.registerCommand('neko.assets.refreshViews', () => {
				assetManagerProvider.refresh();
				assetHistoryProvider.refresh();
			}),
		);
	}

	// 4. Register asset action commands
	registerAssetCommands(context);

	// 5. Register existing commands (sync, push, pull, LFS, preview)
	registerLegacyCommands(context);

	// 6. Register internal API commands (for cross-extension access)
	registerInternalCommands(context);

	console.log('[Neko Assets] Extension activated');
}

// =============================================================================
// Asset Action Commands
// =============================================================================

function registerAssetCommands(context: vscode.ExtensionContext): void {
	// Add to Timeline (neko-cut)
	context.subscriptions.push(
		vscode.commands.registerCommand('neko.assets.addToTimeline', async (uri?: vscode.Uri) => {
			if (!uri) return;

			const mediaType = detectMediaType(uri.fsPath);
			if (mediaType !== 'video' && mediaType !== 'audio' && mediaType !== 'image') {
				vscode.window.showWarningMessage('Only media files can be added to the timeline.');
				return;
			}

			try {
				await vscode.commands.executeCommand('neko.cut.addElement', {
					path: uri.fsPath,
					type: mediaType,
				});
			} catch {
				vscode.window.showErrorMessage('Failed to add to timeline. Is neko-cut active?');
			}
		}),
	);

	// Add to Canvas (neko-canvas)
	context.subscriptions.push(
		vscode.commands.registerCommand('neko.assets.addToCanvas', async (uri?: vscode.Uri) => {
			if (!uri) return;

			try {
				await vscode.commands.executeCommand('neko.canvas.addNode', {
					path: uri.fsPath,
					type: 'MediaNode',
				});
			} catch {
				vscode.window.showErrorMessage('Failed to add to canvas. Is neko-canvas active?');
			}
		}),
	);

	// Import to Asset Library
	context.subscriptions.push(
		vscode.commands.registerCommand('neko.assets.importFile', async (uri?: vscode.Uri) => {
			if (!uri || !library) return;

			try {
				const result = await library.importFile(uri.fsPath);
				vscode.window.showInformationMessage(
					`Imported: ${result.entity.name} (${result.isNewEntity ? 'new entity' : 'existing entity'})`,
				);
			} catch (error) {
				const msg = error instanceof Error ? error.message : String(error);
				vscode.window.showErrorMessage(`Import failed: ${msg}`);
			}
		}),
	);
}

// =============================================================================
// Legacy Commands (preserved from original extension.ts)
// =============================================================================

function registerLegacyCommands(context: vscode.ExtensionContext): void {
	context.subscriptions.push(
		vscode.commands.registerCommand('neko.assets.sync', () => {
			vscode.window.showInformationMessage('Syncing assets...');
		}),
		vscode.commands.registerCommand('neko.assets.push', () => {
			vscode.window.showInformationMessage('Pushing to cloud...');
		}),
		vscode.commands.registerCommand('neko.assets.pull', () => {
			vscode.window.showInformationMessage('Pulling from cloud...');
		}),
		vscode.commands.registerCommand('neko.assets.initLfs', async () => {
			const terminal = vscode.window.createTerminal('Git LFS');
			terminal.sendText('git lfs install');
			terminal.show();
		}),
		vscode.commands.registerCommand('neko.assets.trackLfs', async () => {
			const pattern = await vscode.window.showInputBox({
				prompt: 'Enter file pattern to track (e.g., *.mp4)',
				value: '*.mp4',
			});
			if (pattern) {
				const terminal = vscode.window.createTerminal('Git LFS');
				terminal.sendText(`git lfs track "${pattern}"`);
				terminal.show();
			}
		}),
		vscode.commands.registerCommand('neko.assets.triggerRender', () => {
			vscode.window.showInformationMessage('CI/CD render triggered');
		}),
		vscode.commands.registerCommand('neko.assets.viewHistory', () => {
			vscode.window.showInformationMessage('Asset history - Coming soon');
		}),
		// Preview media files with neko-preview
		vscode.commands.registerCommand('neko.assets.previewMedia', async (uri?: vscode.Uri) => {
			if (!uri) {
				const fileUri = await vscode.window.showOpenDialog({
					canSelectFiles: true,
					canSelectMany: false,
					filters: {
						'Media Files': [
							'mp4', 'mov', 'avi', 'mkv', 'webm', 'm4v', 'ts', 'flv', 'wmv',
							'mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a', 'wma', 'opus',
						],
					},
				});
				if (!fileUri?.[0]) return;
				uri = fileUri[0];
			}

			const mediaType = detectMediaType(uri.fsPath);

			try {
				if (mediaType === 'video') {
					await vscode.commands.executeCommand('vscode.openWith', uri, 'neko.videoPreview');
				} else if (mediaType === 'audio') {
					await vscode.commands.executeCommand('vscode.openWith', uri, 'neko.audioPreview');
				}
			} catch (error) {
				console.error('[Neko Assets] Failed to open media preview:', error);
				vscode.window.showErrorMessage(`Failed to preview: ${uri.fsPath}`);
			}
		}),
	);
}

// =============================================================================
// Internal API Commands (cross-extension access)
// =============================================================================

function registerInternalCommands(context: vscode.ExtensionContext): void {
	// Get all entities (used by neko-canvas AssetLibraryProvider)
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'neko.assets.getAllEntities',
			async () => {
				if (!library) return [];
				try {
					return await library.getAllEntities();
				} catch (error) {
					console.error('[Neko Assets] getAllEntities failed:', error);
					return [];
				}
			},
		),
	);

	// Compare two variants (used by neko-cut DiffViewer)
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'neko.assets.compareVariants',
			async (entityId: string, variantIdA: string, variantIdB: string) => {
				if (!diffService) return null;
				try {
					return await diffService.compareVariants(entityId, variantIdA, variantIdB);
				} catch (error) {
					console.error('[Neko Assets] compareVariants failed:', error);
					return null;
				}
			},
		),
	);

	// Compare two files/paths (general diff)
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'neko.assets.compare',
			async (request: import('@neko/shared').AssetDiffRequest) => {
				if (!diffService) return null;
				try {
					return await diffService.compare(request);
				} catch (error) {
					console.error('[Neko Assets] compare failed:', error);
					return null;
				}
			},
		),
	);

	// Get version history for a file
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'neko.assets.getVersionHistory',
			async (filePath: string) => {
				if (!diffService) return [];
				try {
					return await diffService.getVersionHistory(filePath);
				} catch (error) {
					console.error('[Neko Assets] getVersionHistory failed:', error);
					return [];
				}
			},
		),
	);

	// Compare with Git version
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'neko.assets.compareWithGit',
			async (filePath: string, ref?: string) => {
				if (!diffService) return null;
				try {
					return await diffService.compareWithGit(filePath, ref);
				} catch (error) {
					console.error('[Neko Assets] compareWithGit failed:', error);
					return null;
				}
			},
		),
	);

	// Generate thumbnail for a file (used by other extensions)
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'neko.assets.generateThumbnail',
			async (filePath: string) => {
				if (!thumbnailService) return null;
				try {
					return await thumbnailService.generate(filePath);
				} catch (error) {
					console.error('[Neko Assets] generateThumbnail failed:', error);
					return null;
				}
			},
		),
	);

	// Get cached thumbnail path for a file
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'neko.assets.getThumbnailPath',
			async (filePath: string) => {
				if (!thumbnailService) return null;
				try {
					return await thumbnailService.getCached(filePath);
				} catch (error) {
					console.error('[Neko Assets] getThumbnailPath failed:', error);
					return null;
				}
			},
		),
	);
}

// =============================================================================
// Deactivation
// =============================================================================

export async function deactivate(): Promise<void> {
	if (library) {
		try {
			await library.flush();
		} catch (error) {
			console.error('[Neko Assets] Failed to flush library on deactivate:', error);
		}
		library = null;
	}
}
