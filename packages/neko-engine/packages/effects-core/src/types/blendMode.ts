/**
 * Blend Mode Types
 *
 * Photoshop-compatible blend modes for layer compositing.
 * Includes all standard blend modes with GPU shader support.
 */

// =============================================================================
// Blend Mode Categories
// =============================================================================

export type BlendModeCategory =
	| 'normal'
	| 'darken'
	| 'lighten'
	| 'contrast'
	| 'inversion'
	| 'component';

// =============================================================================
// Blend Mode Types
// =============================================================================

/**
 * All supported blend modes (Photoshop compatible)
 */
export type BlendModeType =
	// Normal
	| 'normal'
	| 'dissolve'
	// Darken
	| 'darken'
	| 'multiply'
	| 'colorBurn'
	| 'linearBurn'
	| 'darkerColor'
	// Lighten
	| 'lighten'
	| 'screen'
	| 'colorDodge'
	| 'linearDodge' // Add
	| 'lighterColor'
	// Contrast
	| 'overlay'
	| 'softLight'
	| 'hardLight'
	| 'vividLight'
	| 'linearLight'
	| 'pinLight'
	| 'hardMix'
	// Inversion
	| 'difference'
	| 'exclusion'
	| 'subtract'
	| 'divide'
	// Component
	| 'hue'
	| 'saturation'
	| 'color'
	| 'luminosity';

// =============================================================================
// Blend Mode Definition
// =============================================================================

/**
 * Blend mode configuration
 */
export interface BlendModeConfig {
	mode: BlendModeType;
	opacity: number; // 0-1
}

/**
 * Blend mode metadata
 */
export interface BlendModeInfo {
	type: BlendModeType;
	name: string;
	category: BlendModeCategory;
	description: string;
	/** Keyboard shortcut (Photoshop style) */
	shortcut?: string;
}

// =============================================================================
// Blend Mode Registry
// =============================================================================

/**
 * All blend modes with metadata
 */
export const BLEND_MODES: BlendModeInfo[] = [
	// Normal
	{ type: 'normal', name: 'Normal', category: 'normal', description: 'Default blend mode', shortcut: 'Shift+Alt+N' },
	{ type: 'dissolve', name: 'Dissolve', category: 'normal', description: 'Random pixel replacement', shortcut: 'Shift+Alt+I' },
	// Darken
	{ type: 'darken', name: 'Darken', category: 'darken', description: 'Keeps darker pixels', shortcut: 'Shift+Alt+K' },
	{ type: 'multiply', name: 'Multiply', category: 'darken', description: 'Multiplies colors', shortcut: 'Shift+Alt+M' },
	{ type: 'colorBurn', name: 'Color Burn', category: 'darken', description: 'Darkens with increased contrast', shortcut: 'Shift+Alt+B' },
	{ type: 'linearBurn', name: 'Linear Burn', category: 'darken', description: 'Darkens by decreasing brightness', shortcut: 'Shift+Alt+A' },
	{ type: 'darkerColor', name: 'Darker Color', category: 'darken', description: 'Compares and keeps darker' },
	// Lighten
	{ type: 'lighten', name: 'Lighten', category: 'lighten', description: 'Keeps lighter pixels', shortcut: 'Shift+Alt+G' },
	{ type: 'screen', name: 'Screen', category: 'lighten', description: 'Inverse multiply', shortcut: 'Shift+Alt+S' },
	{ type: 'colorDodge', name: 'Color Dodge', category: 'lighten', description: 'Brightens with decreased contrast', shortcut: 'Shift+Alt+D' },
	{ type: 'linearDodge', name: 'Linear Dodge (Add)', category: 'lighten', description: 'Brightens by increasing brightness', shortcut: 'Shift+Alt+W' },
	{ type: 'lighterColor', name: 'Lighter Color', category: 'lighten', description: 'Compares and keeps lighter' },
	// Contrast
	{ type: 'overlay', name: 'Overlay', category: 'contrast', description: 'Multiply or screen based on base', shortcut: 'Shift+Alt+O' },
	{ type: 'softLight', name: 'Soft Light', category: 'contrast', description: 'Subtle overlay effect', shortcut: 'Shift+Alt+F' },
	{ type: 'hardLight', name: 'Hard Light', category: 'contrast', description: 'Strong overlay effect', shortcut: 'Shift+Alt+H' },
	{ type: 'vividLight', name: 'Vivid Light', category: 'contrast', description: 'Burns or dodges based on blend' },
	{ type: 'linearLight', name: 'Linear Light', category: 'contrast', description: 'Linear burn or dodge based on blend' },
	{ type: 'pinLight', name: 'Pin Light', category: 'contrast', description: 'Replaces based on blend color' },
	{ type: 'hardMix', name: 'Hard Mix', category: 'contrast', description: 'Posterizes to primary colors' },
	// Inversion
	{ type: 'difference', name: 'Difference', category: 'inversion', description: 'Subtracts darker from lighter', shortcut: 'Shift+Alt+E' },
	{ type: 'exclusion', name: 'Exclusion', category: 'inversion', description: 'Lower contrast difference', shortcut: 'Shift+Alt+X' },
	{ type: 'subtract', name: 'Subtract', category: 'inversion', description: 'Subtracts blend from base' },
	{ type: 'divide', name: 'Divide', category: 'inversion', description: 'Divides base by blend' },
	// Component
	{ type: 'hue', name: 'Hue', category: 'component', description: 'Uses hue of blend color', shortcut: 'Shift+Alt+U' },
	{ type: 'saturation', name: 'Saturation', category: 'component', description: 'Uses saturation of blend color', shortcut: 'Shift+Alt+T' },
	{ type: 'color', name: 'Color', category: 'component', description: 'Uses hue and saturation of blend', shortcut: 'Shift+Alt+C' },
	{ type: 'luminosity', name: 'Luminosity', category: 'component', description: 'Uses luminosity of blend color', shortcut: 'Shift+Alt+Y' },
];

/**
 * Get blend mode info by type
 */
export function getBlendModeInfo(type: BlendModeType): BlendModeInfo | undefined {
	return BLEND_MODES.find(m => m.type === type);
}

/**
 * Get blend modes by category
 */
export function getBlendModesByCategory(category: BlendModeCategory): BlendModeInfo[] {
	return BLEND_MODES.filter(m => m.category === category);
}
