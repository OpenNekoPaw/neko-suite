import { randomUUID } from 'crypto';
import type * as vscode from 'vscode';
import type { ExportPreset, ExportPresetSettings } from '@neko/shared';

const STORAGE_KEY = 'neko-cut.exportPresets';

const BUILTIN_PRESETS: ExportPreset[] = [
	{
		id: 'builtin-social',
		name: '社交媒体优化',
		isBuiltin: true,
		settings: {
			format: 'mp4',
			videoCodec: 'h264',
			audioCodec: 'aac',
			width: 1920,
			height: 1080,
			fps: 60,
			quality: 'high',
			audioBitrate: 192000,
		},
	},
	{
		id: 'builtin-web',
		name: 'Web 优化',
		isBuiltin: true,
		settings: {
			format: 'webm',
			videoCodec: 'vp9',
			audioCodec: 'opus',
			width: 1280,
			height: 720,
			fps: 30,
			quality: 'medium',
			audioBitrate: 128000,
		},
	},
	{
		id: 'builtin-master',
		name: '高质量母版',
		isBuiltin: true,
		settings: {
			format: 'mov',
			videoCodec: 'h265',
			audioCodec: 'aac',
			width: 3840,
			height: 2160,
			fps: 60,
			quality: 'high',
			audioBitrate: 320000,
		},
	},
];

export class ExportPresetService {
	constructor(private readonly workspaceState: vscode.Memento) {}

	listPresets(): ExportPreset[] {
		const userPresets = this.workspaceState.get<ExportPreset[]>(STORAGE_KEY, []);
		return [...BUILTIN_PRESETS, ...userPresets];
	}

	savePreset(name: string, settings: ExportPresetSettings): ExportPreset {
		const preset: ExportPreset = {
			id: randomUUID(),
			name,
			isBuiltin: false,
			settings,
		};
		const existing = this.workspaceState.get<ExportPreset[]>(STORAGE_KEY, []);
		void this.workspaceState.update(STORAGE_KEY, [...existing, preset]);
		return preset;
	}
}
