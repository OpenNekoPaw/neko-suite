/**
 * EngineMediaService - neko-engine Media Diff Adapter
 *
 * Adapter layer between diff analyzers and neko-engine's Rust backend.
 * Delegates diff operations to the engine via vscode commands:
 *   - diff → neko.engine.diff (audios:diff, videos:diff, images:diff, timelines:diff)
 *
 * This adapter exists to:
 *   1. Decouple analyzers from vscode command names (testability)
 *   2. Provide graceful degradation when engine is unavailable
 *   3. Adapt neko-engine response shapes to analyzer expectations
 */

import * as vscode from 'vscode';
import type { EngineDiffResult } from '@neko/shared';

// =============================================================================
// Service
// =============================================================================

const ENGINE_EXTENSION_ID = 'neko.neko-engine';

export class EngineMediaService {
	private engineActivated = false;

	/**
	 * Ensure the neko-engine extension is activated before calling its commands.
	 * The engine registers internal commands (like neko.engine.diff) during activation,
	 * so we must activate it first — VSCode won't auto-activate for internal commands.
	 */
	private async ensureEngineActivated(): Promise<boolean> {
		if (this.engineActivated) return true;

		const ext = vscode.extensions.getExtension(ENGINE_EXTENSION_ID);
		if (!ext) {
			console.error(`[EngineMediaService] Extension ${ENGINE_EXTENSION_ID} not installed`);
			return false;
		}

		if (!ext.isActive) {
			try {
				await ext.activate();
			} catch (error) {
				console.error(`[EngineMediaService] Failed to activate ${ENGINE_EXTENSION_ID}:`, error);
				return false;
			}
		}

		this.engineActivated = true;
		return true;
	}

	/**
	 * Diff two media files via the engine's native diff action.
	 *
	 * @param group - Action group: 'audios' | 'videos' | 'images' | 'timelines'
	 * @param sourceA - Absolute path to first file (current)
	 * @param sourceB - Absolute path to second file (previous)
	 * @param options - Additional options passed to the engine diff action
	 * @returns EngineDiffResult or null if engine unavailable
	 */
	async diff(
		group: string,
		sourceA: string,
		sourceB: string,
		options?: Record<string, unknown>
	): Promise<EngineDiffResult | null> {
		const activated = await this.ensureEngineActivated();
		if (!activated) return null;

		try {
			const result = await vscode.commands.executeCommand<EngineDiffResult>(
				'neko.engine.diff',
				group,
				sourceA,
				sourceB,
				options
			);
			return result ?? null;
		} catch (error) {
			console.error(`[EngineMediaService] diff(${group}) failed:`, error);
			return null;
		}
	}
}
