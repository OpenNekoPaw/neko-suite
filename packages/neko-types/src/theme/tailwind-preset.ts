/**
 * Neko Suite - Shared Tailwind CSS Preset
 *
 * Maps VSCode CSS variables to Tailwind utility classes.
 * Single source of truth: all webview packages reference this preset.
 *
 * Usage in tailwind.config.js (or .ts):
 *   import { nekoTailwindPreset } from '@neko/shared/theme/tailwind-preset';
 *   export default { presets: [nekoTailwindPreset], content: [...] };
 *
 * Then use in JSX:
 *   <div className="bg-vscode-bg text-vscode-fg border-vscode-border" />
 */

import { vscodeCSSTokens } from './tokens';

/**
 * Tailwind preset with all VSCode theme color mappings.
 * Type is intentionally kept loose to avoid requiring tailwindcss as a dependency.
 */
export const nekoTailwindPreset = {
  content: [] as string[],
  theme: {
    extend: {
      colors: { ...vscodeCSSTokens.colors },
      fontFamily: { ...vscodeCSSTokens.fontFamily },
      fontSize: { ...vscodeCSSTokens.fontSize },
      borderRadius: { ...vscodeCSSTokens.borderRadius },
      boxShadow: { ...vscodeCSSTokens.boxShadow },
      backdropBlur: { ...vscodeCSSTokens.backdropBlur },
    },
  },
};
