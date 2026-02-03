/**
 * Shaders Index
 *
 * Re-exports all WGSL shader code from effects-core.
 *
 * For TypeScript/Vite: import as strings
 * For Rust: use include_str!("path/to/shader.wgsl")
 */

// Import raw WGSL files as strings
// Note: Requires bundler support (Vite ?raw, webpack raw-loader, etc.)
// For direct Node.js usage, use fs.readFileSync

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const shadersDir = join(__dirname, '../../shaders');

// Lazy load shader content
let _commonWgsl: string | null = null;
let _blendModesWgsl: string | null = null;
let _colorCorrectionWgsl: string | null = null;
let _transitionsWgsl: string | null = null;
let _effectsWgsl: string | null = null;

export function getCommonWgsl(): string {
	if (!_commonWgsl) {
		_commonWgsl = readFileSync(join(shadersDir, 'common.wgsl'), 'utf-8');
	}
	return _commonWgsl;
}

export function getBlendModesWgsl(): string {
	if (!_blendModesWgsl) {
		_blendModesWgsl = readFileSync(join(shadersDir, 'blend_modes.wgsl'), 'utf-8');
	}
	return _blendModesWgsl;
}

export function getColorCorrectionWgsl(): string {
	if (!_colorCorrectionWgsl) {
		_colorCorrectionWgsl = readFileSync(join(shadersDir, 'color_correction.wgsl'), 'utf-8');
	}
	return _colorCorrectionWgsl;
}

export function getTransitionsWgsl(): string {
	if (!_transitionsWgsl) {
		_transitionsWgsl = readFileSync(join(shadersDir, 'transitions.wgsl'), 'utf-8');
	}
	return _transitionsWgsl;
}

export function getEffectsWgsl(): string {
	if (!_effectsWgsl) {
		_effectsWgsl = readFileSync(join(shadersDir, 'effects.wgsl'), 'utf-8');
	}
	return _effectsWgsl;
}

/**
 * Get complete shader library with all utilities combined
 */
export function getFullShaderLibrary(): string {
	return `
// =============================================================================
// Effects Core Shader Library
// =============================================================================

${getCommonWgsl()}

${getBlendModesWgsl()}

${getColorCorrectionWgsl()}

${getTransitionsWgsl()}

${getEffectsWgsl()}
`;
}

// Re-export the old TS string versions for backwards compatibility
export { COMMON_WGSL } from './common.wgsl';
export { BLEND_MODE_WGSL } from './blendModes.wgsl';
export { COLOR_CORRECTION_WGSL } from './colorCorrection.wgsl';
export { TRANSITION_WGSL } from './transitions.wgsl';
export { EFFECTS_WGSL } from './effects.wgsl';

// YUV conversion shaders
export {
	YUV_CONVERSION_WGSL,
	YUV_TO_RGBA_WGSL,
	YuvColorSpace,
	detectColorSpace,
} from './yuv.wgsl';
