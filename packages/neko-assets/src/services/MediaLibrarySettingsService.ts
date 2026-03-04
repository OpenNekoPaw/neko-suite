/**
 * Media Library Settings Service
 *
 * Manages .neko/settings.json (team-shared) and .neko/settings.local.json
 * (machine-specific overrides, gitignored).
 *
 * Provides resolved media library configuration and path variable maps
 * for the PathResolver.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import type {
	MediaLibrarySettings,
	MediaLibraryLocalSettings,
	MediaLibraryEntry,
	ResolvedMediaLibrary,
} from '@neko/shared';
import type { PathVariableMap } from '@neko/asset';
import { getLogger } from '../utils/logger';

const logger = getLogger('MediaLibrarySettings');

const SETTINGS_FILE = 'settings.json';
const SETTINGS_LOCAL_FILE = 'settings.local.json';
const DEBOUNCE_MS = 300;

export class MediaLibrarySettingsService implements vscode.Disposable {
	private disposables: vscode.Disposable[] = [];
	private settings: MediaLibrarySettings = {};
	private localSettings: MediaLibraryLocalSettings = {};
	private reloadTimer: ReturnType<typeof setTimeout> | null = null;

	private readonly _onDidChange = new vscode.EventEmitter<ResolvedMediaLibrary[]>();
	readonly onDidChange = this._onDidChange.event;

	constructor(private readonly workspaceRoot: string) {
		this.setupWatchers();
	}

	/**
	 * Load settings from disk.
	 */
	async load(): Promise<void> {
		this.settings = await this.readJsonFile<MediaLibrarySettings>(
			this.getSettingsPath(),
		) ?? {};
		this.localSettings = await this.readJsonFile<MediaLibraryLocalSettings>(
			this.getLocalSettingsPath(),
		) ?? {};
		logger.info(
			`Loaded ${this.settings.mediaLibraries?.length ?? 0} media libraries`,
		);
	}

	/**
	 * Get resolved libraries (after applying local overrides and checking accessibility).
	 */
	async getResolvedLibraries(): Promise<ResolvedMediaLibrary[]> {
		const entries = this.settings.mediaLibraries ?? [];
		const overrides = this.localSettings.mediaLibraryOverrides ?? {};
		const results: ResolvedMediaLibrary[] = [];

		for (const entry of entries) {
			const override = overrides[entry.variable];
			const resolvedPath = override ?? entry.path;
			const accessible = await this.checkAccessible(resolvedPath);

			results.push({
				name: entry.name,
				resolvedPath,
				originalPath: entry.path,
				variable: entry.variable,
				enabled: entry.enabled !== false,
				accessible,
				overridden: override !== undefined,
			});
		}

		return results;
	}

	/**
	 * Build PathVariableMap for PathResolver.
	 */
	async getPathVariableMap(): Promise<PathVariableMap> {
		const libraries = await this.getResolvedLibraries();
		const map: PathVariableMap = new Map();

		for (const lib of libraries) {
			if (lib.enabled) {
				map.set(lib.variable, lib.resolvedPath);
			}
		}

		return map;
	}

	/**
	 * Add a media library entry to settings.json.
	 */
	async addLibrary(entry: MediaLibraryEntry): Promise<void> {
		if (!this.settings.mediaLibraries) {
			this.settings.mediaLibraries = [];
		}

		// Check for duplicate variable
		const existing = this.settings.mediaLibraries.find(
			e => e.variable === entry.variable,
		);
		if (existing) {
			throw new Error(`Variable "${entry.variable}" already exists`);
		}

		this.settings.mediaLibraries.push(entry);
		await this.writeSettings();
	}

	/**
	 * Remove a media library by variable name.
	 */
	async removeLibrary(variable: string): Promise<void> {
		if (!this.settings.mediaLibraries) return;

		this.settings.mediaLibraries = this.settings.mediaLibraries.filter(
			e => e.variable !== variable,
		);
		await this.writeSettings();
	}

	/**
	 * Set a local override for a variable.
	 */
	async setLocalOverride(variable: string, localPath: string): Promise<void> {
		if (!this.localSettings.mediaLibraryOverrides) {
			this.localSettings.mediaLibraryOverrides = {};
		}
		this.localSettings.mediaLibraryOverrides[variable] = localPath;
		await this.writeLocalSettings();
	}

	// =========================================================================
	// File Paths
	// =========================================================================

	private getSettingsPath(): string {
		return path.join(this.workspaceRoot, '.neko', SETTINGS_FILE);
	}

	private getLocalSettingsPath(): string {
		return path.join(this.workspaceRoot, '.neko', SETTINGS_LOCAL_FILE);
	}

	// =========================================================================
	// File I/O
	// =========================================================================

	private async readJsonFile<T>(filePath: string): Promise<T | null> {
		try {
			const content = await fs.readFile(filePath, 'utf-8');
			return JSON.parse(content) as T;
		} catch {
			return null;
		}
	}

	private async writeSettings(): Promise<void> {
		const filePath = this.getSettingsPath();
		await fs.mkdir(path.dirname(filePath), { recursive: true });
		await fs.writeFile(filePath, JSON.stringify(this.settings, null, '\t'), 'utf-8');
	}

	private async writeLocalSettings(): Promise<void> {
		const filePath = this.getLocalSettingsPath();
		await fs.mkdir(path.dirname(filePath), { recursive: true });
		await fs.writeFile(filePath, JSON.stringify(this.localSettings, null, '\t'), 'utf-8');
	}

	private async checkAccessible(dirPath: string): Promise<boolean> {
		try {
			await fs.access(dirPath, fs.constants.R_OK);
			return true;
		} catch {
			return false;
		}
	}

	// =========================================================================
	// File Watcher
	// =========================================================================

	private setupWatchers(): void {
		const nekoDir = path.join(this.workspaceRoot, '.neko');
		const pattern = new vscode.RelativePattern(nekoDir, 'settings*.json');
		const watcher = vscode.workspace.createFileSystemWatcher(pattern);

		const handleChange = () => {
			if (this.reloadTimer) clearTimeout(this.reloadTimer);
			this.reloadTimer = setTimeout(() => this.reload(), DEBOUNCE_MS);
		};

		this.disposables.push(
			watcher,
			watcher.onDidChange(handleChange),
			watcher.onDidCreate(handleChange),
			watcher.onDidDelete(handleChange),
		);
	}

	private async reload(): Promise<void> {
		await this.load();
		const libraries = await this.getResolvedLibraries();
		this._onDidChange.fire(libraries);
	}

	dispose(): void {
		if (this.reloadTimer) {
			clearTimeout(this.reloadTimer);
			this.reloadTimer = null;
		}
		this._onDidChange.dispose();
		for (const d of this.disposables) {
			d.dispose();
		}
		this.disposables = [];
	}
}
