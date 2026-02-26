/**
 * Neko Engine Extension
 *
 * VSCode extension entry point that wires up the media processing engine.
 *
 * Architecture:
 * extension.ts → MediaEngineManager → NativeMediaEngine → NativeEngine (NAPI) → EngineApi (Rust)
 *
 * Responsibilities:
 * - Engine lifecycle management (start/stop)
 * - VSCode command registration
 * - Status bar integration
 * - Export pipeline orchestration
 */
import * as vscode from 'vscode';
import {
	MediaEngineManager,
	createMediaEngineManager,
	NativeMediaEngine,
} from './mediaEngine';
import {
	ExportService,
	JviProjectLoader,
	VideoFrameProvider,
	createVideoFrameProvider,
	type ExportProgress,
} from './mediaEngine/export';

// =============================================================================
// Extension State
// =============================================================================

let manager: MediaEngineManager | null = null;
let exportService: ExportService | null = null;
let statusBarItem: vscode.StatusBarItem;
let outputChannel: vscode.OutputChannel;

// =============================================================================
// Activation
// =============================================================================

/**
 * Activate the extension
 */
export function activate(context: vscode.ExtensionContext): void {
	outputChannel = vscode.window.createOutputChannel('Neko Engine');
	context.subscriptions.push(outputChannel);

	log('Activating extension...');

	// Create status bar item
	statusBarItem = vscode.window.createStatusBarItem(
		vscode.StatusBarAlignment.Right,
		100
	);
	statusBarItem.command = 'neko.engine.status';
	context.subscriptions.push(statusBarItem);

	// Create MediaEngineManager
	manager = createMediaEngineManager(context.globalStorageUri);
	context.subscriptions.push(manager);

	// Create ExportService
	exportService = new ExportService();

	// Register commands
	registerCommands(context);

	// Update status bar
	updateStatusBar('idle');

	log('Extension activated');
}

// =============================================================================
// Command Registration
// =============================================================================

function registerCommands(context: vscode.ExtensionContext): void {
	// Start Engine
	context.subscriptions.push(
		vscode.commands.registerCommand('neko.engine.start', cmdStartEngine)
	);

	// Stop Engine
	context.subscriptions.push(
		vscode.commands.registerCommand('neko.engine.stop', cmdStopEngine)
	);

	// Engine Status
	context.subscriptions.push(
		vscode.commands.registerCommand('neko.engine.status', cmdShowStatus)
	);

	// Probe Media (interactive — shows file picker + output)
	context.subscriptions.push(
		vscode.commands.registerCommand('neko.engine.probe', cmdProbeMedia)
	);

	// Probe Media (internal — programmatic API for other extensions)
	context.subscriptions.push(
		vscode.commands.registerCommand('neko.engine.probeInternal', async (filePath: string) => {
			try {
				const engine = await getOrStartEngine();
				if (!engine) return null;
				return await engine.probeMedia(filePath);
			} catch (error) {
				log(`probeInternal failed for ${filePath}: ${error}`, 'error');
				return null;
			}
		})
	);

	// Extract Frame (programmatic API for other extensions)
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'neko.engine.extractFrame',
			async (filePath: string, timeSeconds: number) => {
				try {
					const engine = await getOrStartEngine();
					if (!engine?.engine) return null;
					const resultJson = await engine.engine.captureFrame(filePath, timeSeconds);
					const result = JSON.parse(resultJson);
					if (result.status === 'ok' && result.data?.data) {
						return { data: Buffer.from(result.data.data as string, 'base64') };
					}
					return null;
				} catch (error) {
					log(`extractFrame failed for ${filePath} at ${timeSeconds}s: ${error}`, 'error');
					return null;
				}
			}
		)
	);

	// Diff two media files (programmatic API for other extensions)
	// Dispatches to engine's native diff: audios:diff, videos:diff, images:diff, timelines:diff
	context.subscriptions.push(
		vscode.commands.registerCommand(
			'neko.engine.diff',
			async (group: string, sourceA: string, sourceB: string, options?: Record<string, unknown>) => {
				try {
					const engine = await getOrStartEngine();
					if (!engine?.engine) return null;
					const opts = { sourceA, sourceB, ...options };
					const resultJson = await engine.engine.dispatchAction(
						group,
						'diff',
						null,
						JSON.stringify(opts),
						null, null, null, null
					);
					const result = JSON.parse(resultJson);
					if (result.status === 'ok') {
						return result.data;
					}
					log(`diff failed for ${group}: ${result.message ?? 'unknown error'}`, 'error');
					return null;
				} catch (error) {
					log(`diff failed for ${group} (${sourceA} vs ${sourceB}): ${error}`, 'error');
					return null;
				}
			}
		)
	);

	// Export JVI Project
	context.subscriptions.push(
		vscode.commands.registerCommand('neko.engine.export', cmdExportProject)
	);

	// Open Documentation
	context.subscriptions.push(
		vscode.commands.registerCommand('neko.engine.openDocs', cmdOpenDocs)
	);
}

// =============================================================================
// Command Implementations
// =============================================================================

/**
 * Start the engine — initializes NativeEngine via MediaEngineManager
 */
async function cmdStartEngine(): Promise<void> {
	if (!manager) {
		vscode.window.showErrorMessage('Neko Engine: Manager not initialized');
		return;
	}

	updateStatusBar('starting');

	try {
		const engine = await manager.getCompatibleEngine();

		// Share the NativeEngine instance with ExportService
		if (exportService && engine.engine) {
			exportService.initializeWithEngine(engine.engine);
		}

		log(`Engine started (GPU: ${engine.engine?.hasGpu() ? 'enabled' : 'disabled'})`);

		// Log available groups
		const groups = engine.engine?.groups();
		if (groups) {
			log(`Available API groups: ${groups.join(', ')}`);
		}

		updateStatusBar('ready');
		vscode.window.showInformationMessage('Neko Engine started');
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		log(`Failed to start engine: ${msg}`, 'error');
		updateStatusBar('error');
		vscode.window.showErrorMessage(`Failed to start Neko Engine: ${msg}`);
	}
}

/**
 * Stop the engine — disposes NativeEngine and cleans up resources
 */
async function cmdStopEngine(): Promise<void> {
	if (!manager) {
		return;
	}

	try {
		// Cancel any ongoing export
		if (exportService) {
			await exportService.cancel();
		}

		// Dispose engines
		await manager.disposeEngines();

		log('Engine stopped');
		updateStatusBar('idle');
		vscode.window.showInformationMessage('Neko Engine stopped');
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		log(`Failed to stop engine: ${msg}`, 'error');
		vscode.window.showErrorMessage(`Failed to stop Neko Engine: ${msg}`);
	}
}

/**
 * Show engine status — queries real health/GPU info from Rust side
 */
async function cmdShowStatus(): Promise<void> {
	if (!manager) {
		vscode.window.showInformationMessage('Neko Engine: Not initialized');
		return;
	}

	try {
		const engine = await getOrStartEngine();
		if (!engine?.engine) {
			vscode.window.showInformationMessage('Neko Engine: Not running');
			return;
		}

		// Query health
		const healthJson = await engine.engine.health();
		const health = JSON.parse(healthJson);

		// Query GPU info
		const gpuJson = await engine.engine.gpuInfo();
		const gpu = JSON.parse(gpuJson);

		// Query metrics
		const metricsJson = await engine.engine.metrics();
		const metrics = JSON.parse(metricsJson);

		// Build status message
		const lines: string[] = [
			`State: ${engine.state}`,
			`GPU: ${gpu.data?.name ?? 'N/A'} (${gpu.data?.backend ?? 'N/A'})`,
			`Hardware Accel: ${engine.capabilities.hardwareAcceleration ? 'Yes' : 'No'}`,
		];

		if (metrics.data) {
			const m = metrics.data;
			if (m.cpuUsage !== undefined) {
				lines.push(`CPU: ${(m.cpuUsage as number).toFixed(1)}%`);
			}
			if (m.memoryUsedMb !== undefined) {
				lines.push(`Memory: ${(m.memoryUsedMb as number).toFixed(0)} MB`);
			}
		}

		// Show in output channel
		outputChannel.show(true);
		outputChannel.appendLine('--- Engine Status ---');
		for (const line of lines) {
			outputChannel.appendLine(line);
		}
		outputChannel.appendLine('');

		vscode.window.showInformationMessage(
			`Neko Engine: ${engine.state} | GPU: ${gpu.data?.name ?? 'N/A'}`
		);
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		vscode.window.showErrorMessage(`Failed to get status: ${msg}`);
	}
}

/**
 * Probe a media file — select file, probe metadata, show results
 */
async function cmdProbeMedia(): Promise<void> {
	// Select file
	const fileUri = await vscode.window.showOpenDialog({
		canSelectFiles: true,
		canSelectMany: false,
		filters: {
			'Media Files': ['mp4', 'mov', 'mkv', 'avi', 'webm', 'mp3', 'wav', 'flac', 'aac'],
			'All Files': ['*'],
		},
		title: 'Select media file to probe',
	});

	if (!fileUri || fileUri.length === 0) {
		return;
	}

	const filePath = fileUri[0]!.fsPath;

	try {
		const engine = await getOrStartEngine();
		if (!engine) {
			return;
		}

		const mediaInfo = await engine.probeMedia(filePath);

		// Show results in output channel
		outputChannel.show(true);
		outputChannel.appendLine(`--- Probe: ${filePath} ---`);
		outputChannel.appendLine(`  Duration: ${mediaInfo.duration.toFixed(2)}s`);
		outputChannel.appendLine(`  Resolution: ${mediaInfo.width}x${mediaInfo.height}`);
		outputChannel.appendLine(`  FPS: ${mediaInfo.fps}`);
		outputChannel.appendLine(`  Video Codec: ${mediaInfo.codec}`);
		outputChannel.appendLine(`  Format: ${mediaInfo.format}`);
		if (mediaInfo.hasAudio) {
			outputChannel.appendLine(`  Audio: ${mediaInfo.audioCodec ?? 'unknown'} (${mediaInfo.audioSampleRate ?? 0} Hz, ${mediaInfo.audioChannels ?? 0} ch)`);
		}
		if (mediaInfo.hasSubtitles) {
			outputChannel.appendLine('  Subtitles: Yes');
		}

		// Mode recommendation
		const recommendation = manager!.analyzeMedia(mediaInfo);
		outputChannel.appendLine(`  Recommended Mode: ${recommendation.recommendedMode}`);
		outputChannel.appendLine('');

		vscode.window.showInformationMessage(
			`${mediaInfo.width}x${mediaInfo.height} | ${mediaInfo.codec} | ${mediaInfo.duration.toFixed(1)}s`
		);
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		vscode.window.showErrorMessage(`Probe failed: ${msg}`);
	}
}

/**
 * Export a JVI project — select .jvi file, export to video
 */
async function cmdExportProject(): Promise<void> {
	if (!exportService) {
		vscode.window.showErrorMessage('Neko Engine: Export service not available');
		return;
	}

	// Ensure engine is running
	const engine = await getOrStartEngine();
	if (!engine?.engine) {
		return;
	}

	// Ensure export service has engine
	if (!exportService['_isInitialized']) {
		exportService.initializeWithEngine(engine.engine);
	}

	// Select JVI project file
	const jviUri = await vscode.window.showOpenDialog({
		canSelectFiles: true,
		canSelectMany: false,
		filters: { 'JVI Project': ['jvi'] },
		title: 'Select JVI project to export',
	});

	if (!jviUri || jviUri.length === 0) {
		return;
	}

	const jviPath = jviUri[0]!.fsPath;

	// Select output path
	const outputUri = await vscode.window.showSaveDialog({
		filters: {
			'MP4 Video': ['mp4'],
			'MOV Video': ['mov'],
		},
		title: 'Save exported video as',
	});

	if (!outputUri) {
		return;
	}

	const outputPath = outputUri.fsPath;

	try {
		// Load JVI project
		const loader = new JviProjectLoader(jviPath);
		const project = await loader.load();

		log(`Exporting project: ${project.name} (${project.resolution.width}x${project.resolution.height} @ ${project.fps}fps)`);

		// Convert JVI tracks to export layers
		const layers = loader.toLayers();
		const duration = loader.calculateDuration();

		// Create frame provider
		const frameProvider = await createVideoFrameProvider();

		// Build export config
		const config = {
			outputPath,
			width: project.resolution.width,
			height: project.resolution.height,
			fps: project.fps,
			duration,
			videoCodec: 'h264' as const,
			preset: 'medium' as const,
			profile: 'high' as const,
			container: 'mp4' as const,
			includeAudio: true,
			audioCodec: 'aac' as const,
			audioSampleRate: 48000,
			audioChannels: 2,
		};

		// Show progress
		await vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: 'Neko Engine: Exporting',
				cancellable: true,
			},
			async (progress, token) => {
				// Handle cancellation
				token.onCancellationRequested(() => {
					exportService?.cancel();
				});

				const result = await exportService!.export(
					config,
					layers,
					frameProvider,
					(p: ExportProgress) => {
						progress.report({
							increment: undefined,
							message: `${p.percentage.toFixed(1)}% | Frame ${p.currentFrame}/${p.totalFrames} | ${p.phase}`,
						});
						log(`Export progress: ${p.percentage.toFixed(1)}% (${p.phase})`);
					}
				);

				if (result.success) {
					log(`Export completed: ${outputPath} (${result.totalTimeMs?.toFixed(0)}ms)`);
					const action = await vscode.window.showInformationMessage(
						`Export completed: ${outputPath}`,
						'Open File',
						'Open Folder'
					);
					if (action === 'Open File') {
						vscode.env.openExternal(vscode.Uri.file(outputPath));
					} else if (action === 'Open Folder') {
						const path = await import('path');
						vscode.env.openExternal(vscode.Uri.file(path.dirname(outputPath)));
					}
				} else {
					log(`Export failed: ${result.error}`, 'error');
					vscode.window.showErrorMessage(`Export failed: ${result.error}`);
				}
			}
		);
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		log(`Export error: ${msg}`, 'error');
		vscode.window.showErrorMessage(`Export error: ${msg}`);
	}
}

/**
 * Open API documentation
 */
function cmdOpenDocs(): void {
	const docsPath = vscode.Uri.joinPath(
		vscode.Uri.file(__dirname),
		'../../docs/refactor.md'
	);
	vscode.commands.executeCommand('markdown.showPreview', docsPath);
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Get the compatible engine, starting it if needed
 */
async function getOrStartEngine(): Promise<NativeMediaEngine | null> {
	if (!manager) {
		vscode.window.showErrorMessage('Neko Engine: Manager not initialized');
		return null;
	}

	try {
		const engine = await manager.getCompatibleEngine();
		updateStatusBar('ready');
		return engine;
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		log(`Failed to get engine: ${msg}`, 'error');
		updateStatusBar('error');
		vscode.window.showErrorMessage(`Neko Engine initialization failed: ${msg}`);
		return null;
	}
}

/**
 * Update status bar based on engine state
 */
function updateStatusBar(state: 'idle' | 'starting' | 'ready' | 'error'): void {
	switch (state) {
		case 'idle':
			statusBarItem.text = '$(circle-outline) Neko Engine';
			statusBarItem.tooltip = 'Neko Engine: Idle — Click to view status';
			statusBarItem.backgroundColor = undefined;
			break;
		case 'starting':
			statusBarItem.text = '$(loading~spin) Neko Engine';
			statusBarItem.tooltip = 'Neko Engine: Starting...';
			statusBarItem.backgroundColor = undefined;
			break;
		case 'ready':
			statusBarItem.text = '$(check) Neko Engine';
			statusBarItem.tooltip = 'Neko Engine: Ready — Click to view status';
			statusBarItem.backgroundColor = undefined;
			break;
		case 'error':
			statusBarItem.text = '$(error) Neko Engine';
			statusBarItem.tooltip = 'Neko Engine: Error — Click to view status';
			statusBarItem.backgroundColor = new vscode.ThemeColor(
				'statusBarItem.errorBackground'
			);
			break;
	}
	statusBarItem.show();
}

/**
 * Log to output channel
 */
function log(message: string, level: 'info' | 'error' = 'info'): void {
	const timestamp = new Date().toISOString().slice(11, 23);
	const prefix = level === 'error' ? '❌' : '📋';
	outputChannel.appendLine(`[${timestamp}] ${prefix} ${message}`);

	if (level === 'error') {
		console.error(`[NekoEngine] ${message}`);
	} else {
		console.log(`[NekoEngine] ${message}`);
	}
}

// =============================================================================
// Deactivation
// =============================================================================

/**
 * Deactivate the extension
 */
export async function deactivate(): Promise<void> {
	log('Deactivating extension...');

	// Cancel ongoing exports
	if (exportService) {
		await exportService.cancel();
		exportService.dispose();
		exportService = null;
	}

	// Dispose engine manager
	if (manager) {
		await manager.disposeEngines();
		manager.dispose();
		manager = null;
	}

	log('Extension deactivated');
}
