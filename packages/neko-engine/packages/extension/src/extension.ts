/**
 * Neko Engine Extension
 *
 * Provides media processing capabilities:
 * - Native FFmpeg encoding/decoding via Rust N-API
 * - GPU-accelerated effects via wgpu
 * - Export pipeline for video rendering
 */
import * as vscode from 'vscode';

// Extension state
let statusBarItem: vscode.StatusBarItem;

/**
 * Activate the extension
 */
export function activate(context: vscode.ExtensionContext): void {
	console.log('[NekoEngine] Activating extension...');

	// Create status bar item
	statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
	statusBarItem.command = 'neko.engine.status';
	context.subscriptions.push(statusBarItem);

	// Register commands
	registerCommands(context);

	// Update status bar
	updateStatusBar();

	console.log('[NekoEngine] Extension activated');
}

/**
 * Register extension commands
 */
function registerCommands(context: vscode.ExtensionContext): void {
	// Start Engine
	context.subscriptions.push(
		vscode.commands.registerCommand('neko.engine.start', async () => {
			try {
				// TODO: Initialize native module and start services
				vscode.window.showInformationMessage('Neko Engine started');
				updateStatusBar();
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : 'Unknown error';
				vscode.window.showErrorMessage(`Failed to start engine: ${errorMessage}`);
			}
		})
	);

	// Stop Engine
	context.subscriptions.push(
		vscode.commands.registerCommand('neko.engine.stop', async () => {
			try {
				// TODO: Stop services and cleanup
				vscode.window.showInformationMessage('Neko Engine stopped');
				updateStatusBar();
			} catch (error) {
				const errorMessage = error instanceof Error ? error.message : 'Unknown error';
				vscode.window.showErrorMessage(`Failed to stop engine: ${errorMessage}`);
			}
		})
	);

	// Engine Status
	context.subscriptions.push(
		vscode.commands.registerCommand('neko.engine.status', async () => {
			// TODO: Get actual status from native module
			const message = 'Neko Engine: Ready';
			vscode.window.showInformationMessage(message);
		})
	);

	// Open API Documentation
	context.subscriptions.push(
		vscode.commands.registerCommand('neko.engine.openDocs', () => {
			// TODO: Open documentation
			vscode.window.showInformationMessage('Documentation coming soon');
		})
	);
}

/**
 * Update status bar item
 */
function updateStatusBar(): void {
	statusBarItem.text = '$(gear) Neko Engine';
	statusBarItem.tooltip = 'Click to view engine status';
	statusBarItem.show();
}

/**
 * Deactivate the extension
 */
export async function deactivate(): Promise<void> {
	console.log('[NekoEngine] Deactivating extension...');
	// Cleanup resources
}
