/**
 * Media Diff Module Index
 *
 * Exports all media diff functionality for use by the extension.
 */

// Services
export { GitMediaService, type IGitMediaService } from './services/GitMediaService';
export {
	MediaDiffService,
	type IMediaDiffService,
	type DiffProgressCallback,
	getMediaDiffService,
	disposeMediaDiffService,
} from './services/MediaDiffService';

// Analyzers
export {
	type IMediaDiffAnalyzer,
	AnalyzerRegistry,
	BaseMediaDiffAnalyzer,
	isImageDiffDetails,
	isVideoDiffDetails,
	isAudioDiffDetails,
	isTimelineDiffDetails,
	ImageDiffAnalyzer,
	VideoDiffAnalyzer,
	AudioDiffAnalyzer,
	TimelineDiffAnalyzer,
} from './services/analyzers';

// Editor
export { MediaDiffEditorProvider } from './editor/MediaDiffEditorProvider';
export { MediaDiffMessageHandler } from './editor/MediaDiffMessageHandler';

// =============================================================================
// Module Initialization
// =============================================================================

import * as vscode from 'vscode';
import { getMediaType } from '@neko/shared';
import { MediaDiffService, getMediaDiffService } from './services/MediaDiffService';
import { ImageDiffAnalyzer } from './services/analyzers/ImageDiffAnalyzer';
import { VideoDiffAnalyzer } from './services/analyzers/VideoDiffAnalyzer';
import { AudioDiffAnalyzer } from './services/analyzers/AudioDiffAnalyzer';
import { TimelineDiffAnalyzer } from './services/analyzers/TimelineDiffAnalyzer';
import { MediaDiffEditorProvider } from './editor/MediaDiffEditorProvider';
import { EngineMediaService } from '../services/EngineMediaService';

/**
 * Initialize the media diff module
 * Call this during extension activation
 */
export function initializeMediaDiff(
	context: vscode.ExtensionContext,
	engineMediaService?: EngineMediaService
): MediaDiffEditorProvider {
	// Get or create the diff service
	const diffService = getMediaDiffService();

	// Register analyzers — all delegate to neko-engine's native diff actions
	const imageDiffAnalyzer = new ImageDiffAnalyzer(engineMediaService);
	const videoDiffAnalyzer = new VideoDiffAnalyzer(engineMediaService);
	const audioDiffAnalyzer = new AudioDiffAnalyzer(engineMediaService);
	const timelineDiffAnalyzer = new TimelineDiffAnalyzer(engineMediaService);

	diffService.registerAnalyzer(imageDiffAnalyzer);
	diffService.registerAnalyzer(videoDiffAnalyzer);
	diffService.registerAnalyzer(audioDiffAnalyzer);
	diffService.registerAnalyzer(timelineDiffAnalyzer);

	// Create and register the editor provider
	const editorProvider = new MediaDiffEditorProvider(context, diffService, engineMediaService);

	// Register custom editor
	context.subscriptions.push(
		vscode.window.registerCustomEditorProvider(
			MediaDiffEditorProvider.viewType,
			editorProvider,
			{
				webviewOptions: {
					retainContextWhenHidden: true,
				},
				supportsMultipleEditorsPerDocument: false,
			}
		)
	);

	// Register command for comparing two selected files (local comparison)
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'neko.mediaDiff.compareFiles',
			async (uri?: vscode.Uri, uris?: vscode.Uri[]) => {
				// Multi-select: uris contains all selected files
				// Single-select: only uri is provided
				const selectedFiles = uris ?? (uri ? [uri] : []);

				if (selectedFiles.length !== 2) {
					vscode.window.showErrorMessage(
						vscode.l10n.t('mediaDiff.error.selectTwoFiles')
					);
					return;
				}

				const [file1, file2] = selectedFiles as [vscode.Uri, vscode.Uri];

				// Validate both files are supported media types
				if (!diffService.isSupported(file1)) {
					vscode.window.showErrorMessage(
						vscode.l10n.t('mediaDiff.error.unsupportedType')
					);
					return;
				}
				if (!diffService.isSupported(file2)) {
					vscode.window.showErrorMessage(
						vscode.l10n.t('mediaDiff.error.unsupportedType')
					);
					return;
				}

				// Validate both files have the same media type
				const mediaType1 = getMediaType(file1.fsPath);
				const mediaType2 = getMediaType(file2.fsPath);
				if (mediaType1 !== mediaType2) {
					vscode.window.showErrorMessage(
						vscode.l10n.t('mediaDiff.error.typeMismatch')
					);
					return;
				}

				// Set up local comparison mode
				// file2 is shown on the right (current), file1 is shown on the left (previous)
				editorProvider.setLocalCompareFile(file2, file1);

				// Open the custom editor with file2 as the document
				await vscode.commands.executeCommand(
					'vscode.openWith',
					file2,
					MediaDiffEditorProvider.viewType
				);
			}
		)
	);

	return editorProvider;
}
