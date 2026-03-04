/**
 * Path Resolver Service
 *
 * Handles path variable expansion and contraction.
 * Core library (zero vscode deps) — pure string manipulation.
 *
 * Expansion:  ${TEAM_FOOTAGE}/scene01/clip.mp4 → /Volumes/NAS/footage/scene01/clip.mp4
 * Contraction: /Volumes/NAS/footage/scene01/clip.mp4 → ${TEAM_FOOTAGE}/scene01/clip.mp4
 */

import type { PathVariableMap } from './types';

const VARIABLE_PATTERN = /^\$\{([^}]+)\}(.*)$/;

export class PathResolver {
	private variables: PathVariableMap = new Map();

	/**
	 * Update the variable map (called when settings change).
	 */
	setVariables(variables: PathVariableMap): void {
		this.variables = new Map(variables);
	}

	/**
	 * Expand path variables to absolute paths.
	 *
	 * ${VAR}/rest/of/path → /resolved/path/rest/of/path
	 * If no variable match, returns path as-is.
	 */
	resolve(storedPath: string): string {
		const match = storedPath.match(VARIABLE_PATTERN);
		if (!match) return storedPath;

		const varName = match[1]!;
		const rest = match[2] ?? '';
		const basePath = this.variables.get(varName);

		if (!basePath) {
			// Variable not defined — return as-is (will be detected as offline)
			return storedPath;
		}

		// Normalize: ensure no double slashes
		const normalizedBase = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
		const normalizedRest = rest.startsWith('/') ? rest : `/${rest}`;

		return rest ? `${normalizedBase}${normalizedRest}` : normalizedBase;
	}

	/**
	 * Contract absolute path to use path variable if possible.
	 *
	 * /Volumes/NAS/footage/scene01/clip.mp4 → ${TEAM_FOOTAGE}/scene01/clip.mp4
	 * Picks the longest-matching variable path (most specific).
	 * Returns original path if no variable matches.
	 */
	contract(absolutePath: string): string {
		let bestMatch: { variable: string; basePath: string } | null = null;

		for (const [variable, basePath] of this.variables) {
			const normalizedBase = basePath.endsWith('/') ? basePath : `${basePath}/`;

			if (absolutePath.startsWith(normalizedBase) || absolutePath === basePath) {
				if (!bestMatch || basePath.length > bestMatch.basePath.length) {
					bestMatch = { variable, basePath };
				}
			}
		}

		if (!bestMatch) return absolutePath;

		if (absolutePath === bestMatch.basePath) {
			return `\${${bestMatch.variable}}`;
		}

		const rest = absolutePath.slice(bestMatch.basePath.length);
		const normalizedRest = rest.startsWith('/') ? rest.slice(1) : rest;
		return `\${${bestMatch.variable}}/${normalizedRest}`;
	}

	/**
	 * Check if a path contains a variable reference.
	 */
	hasVariable(path: string): boolean {
		return VARIABLE_PATTERN.test(path);
	}

	/**
	 * Get all configured variables.
	 */
	getVariables(): PathVariableMap {
		return new Map(this.variables);
	}
}
